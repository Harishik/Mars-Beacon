// Mars BEACON Guide (BEACON_Guide.md): launcher, first-visit invitation, non-modal help panel (bottom sheet on
// phones), deterministic answers and the guided tour. Mounted at the app root, outside the 3D canvas, so it works
// while the site loads, when it fails to load, and with WebGL unavailable. No network requests, no polling.
import { useEffect, useRef, useState } from "react";
import { create } from "zustand";
import { useStore } from "../store/store";
import { CompanionAvatar, warmPoses } from "./CompanionAvatar";
import { ANCHORS, spotlight, waitForAnchor } from "./anchors";
import { runGuideAction } from "./actions";
import { readContext } from "./context";
import { loadPrefs, savePrefs } from "./preferences";
import { MAX_QUESTION, resolveQuestion, type Resolution } from "./resolveQuestion";
import { SUGGESTED, TOPIC_BY_ID } from "./topics";
import { TOUR } from "./tourSteps";
import type { ActionResult, CompanionExpression, GuideActionId, GuideAnchor, GuideIntent } from "./types";
import "./guide.css";

interface Entry { id: number; question?: string; res: Resolution }
interface ViewSnapshot { phase: string; view: string; panel: string; overlay: string; envelope: boolean; slope: boolean; playheadS: number; focusView: boolean; hash: string }
interface GuideState {
  open: boolean; invite: boolean; expression: CompanionExpression; pointing: "left" | "right" | null;
  entries: Entry[]; current: number | null; result: ActionResult | null; helpful: Record<number, boolean>;
  tour: number | null; snapshot: ViewSnapshot | null; missing: GuideAnchor | null;
}
const useGuide = create<GuideState>(() => ({
  open: false, invite: false, expression: "idle", pointing: null, entries: [], current: null, result: null, helpful: {},
  tour: null, snapshot: null, missing: null,
}));
let nextId = 1;
let backTimer = 0;

/** Semantic events for the avatar (§7). Success and warning settle back to idle. */
export function onCompanionEvent(e: CompanionExpression, pointing: "left" | "right" | null = null) {
  window.clearTimeout(backTimer);
  useGuide.setState({ expression: e, pointing });
  if (e === "success" || e === "attention") backTimer = window.setTimeout(() => useGuide.setState({ expression: useGuide.getState().open ? "explaining" : "idle", pointing: null }), 1600);
}

function snapshot(): ViewSnapshot {
  const s = useStore.getState();
  return { phase: s.phase, view: s.view, panel: s.panel, overlay: s.overlay, envelope: s.layers.envelope, slope: s.layers.slope, playheadS: s.playheadS, focusView: s.focusView, hash: window.location.hash };
}
const changed = (a: ViewSnapshot | null) => { if (!a) return false; const b = snapshot(); return a.phase !== b.phase || a.view !== b.view || a.panel !== b.panel || a.overlay !== b.overlay || a.envelope !== b.envelope || a.slope !== b.slope || a.hash !== b.hash; };
/** Restore presentation only (the guide never changed anything else). */
function restoreView(v: ViewSnapshot) {
  if (window.location.hash !== v.hash) window.location.hash = v.hash || "#/";
  const s = useStore.getState();
  s.set({ phase: v.phase as never, view: v.view as never, panel: v.panel as never, overlay: v.overlay as never, playheadS: v.playheadS, focusView: v.focusView, playing: false, layers: { ...s.layers, envelope: v.envelope, slope: v.slope } });
}

/** Point at an anchor: spotlight it and turn the avatar toward it, or report the manual route. */
async function pointAt(anchor: GuideAnchor, launcher: HTMLElement | null) {
  const el = await waitForAnchor(anchor);
  if (!el) { useGuide.setState({ missing: anchor }); onCompanionEvent("error"); return false; }
  useGuide.setState({ missing: null });
  spotlight(el);
  const r = el.getBoundingClientRect(), p = launcher?.getBoundingClientRect();
  onCompanionEvent("explaining", p && r.left + r.width / 2 < p.left ? "left" : "right");
  return true;
}

export function Companion() {
  const g = useGuide();
  const launcher = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const answerRef = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState("");
  const route = useRoute();
  const view = useStore((s) => s.view);
  // Subscribe only to what an open panel displays (§5.4).
  useStore((s) => (g.open ? `${s.planBusy}|${s.plans.length}|${!!s.envelope.insideP90}|${s.quality}|${!!s.bundle}|${s.playing}` : ""));

  // First visit: a brief invitation after the shell is interactive. No focus capture, no repeats.
  useEffect(() => {
    const p = loadPrefs();
    if (p.inviteDismissed || p.tourCompleted) return;
    const t = window.setTimeout(() => useGuide.setState({ invite: true }), 1800);
    return () => window.clearTimeout(t);
  }, []);

  // Escape closes the panel and stops a tour (the Equations sheet keeps its own Escape).
  useEffect(() => {
    if (!g.open) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape" && !useStore.getState().ledger) close(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [g.open]);

  const open = (focusHeading = true) => {
    warmPoses();
    useGuide.setState({ open: true, invite: false });
    onCompanionEvent("attention");
    if (focusHeading) requestAnimationFrame(() => heading.current?.focus());
  };
  const close = () => {
    useGuide.setState({ open: false, tour: null, missing: null });
    onCompanionEvent("closed");
    requestAnimationFrame(() => launcher.current?.focus());
  };
  const dismissInvite = () => { useGuide.setState({ invite: false }); savePrefs({ inviteDismissed: true }); };

  const show = (res: Resolution, question?: string) => {
    const id = nextId++;
    useGuide.setState((s) => ({ entries: [...s.entries.slice(-11), { id, question, res }], current: id, result: null, missing: null, tour: null }));
    onCompanionEvent(res.kind === "topic" ? "explaining" : "warning");
    requestAnimationFrame(() => answerRef.current?.scrollTo({ top: 0 }));
  };
  const ask = (text: string) => { const t = text.trim(); if (!t) return; show(resolveQuestion(t), t.slice(0, MAX_QUESTION)); setQ(""); };
  const pick = (intent: GuideIntent | "tour") => (intent === "tour" ? startTour() : show({ kind: "topic", intent, score: 100 }));

  const act = async (id: GuideActionId, anchor?: GuideAnchor) => {
    const r = runGuideAction(id);
    useGuide.setState({ result: r });
    if (!r.ok) { onCompanionEvent("warning"); return; }
    if (anchor) { if (await pointAt(anchor, launcher.current)) onCompanionEvent("success"); }
    else onCompanionEvent("success");
  };
  const goTo = async (anchor: GuideAnchor) => {
    if (!window.location.hash.startsWith("#/app")) window.location.hash = "#/app";
    if (await pointAt(anchor, launcher.current)) onCompanionEvent("success");
  };

  // ---- Tour ----
  const startTour = () => {
    open(false);
    useGuide.setState({ tour: 0, snapshot: snapshot(), current: null, result: null, missing: null });
    savePrefs({ inviteDismissed: true, lastTourStep: 0 });
  };
  const runStep = async (i: number) => {
    const step = TOUR[i];
    useGuide.setState({ tour: i, result: null, missing: null });
    savePrefs({ lastTourStep: i });
    if (step.enter) {
      const r = runGuideAction(step.enter);
      if (!r.ok) { useGuide.setState({ result: r }); onCompanionEvent("warning"); return; }
      if (r.note) useGuide.setState({ result: r });
    }
    if (step.anchor) await pointAt(step.anchor, launcher.current);
    else onCompanionEvent(i === TOUR.length - 1 ? "success" : "explaining");
  };
  const endTour = (completed: boolean) => {
    if (completed) savePrefs({ tourCompleted: true, lastTourStep: null });
    useGuide.setState({ tour: null, missing: null });
    onCompanionEvent(completed ? "success" : "idle");
  };

  const pos = route === "app" ? (view === "hud" || view === "eva" ? "eye" : "map") : "landing";
  const ctx = readContext();
  const entry = g.entries.find((e) => e.id === g.current) ?? null;

  return (
    <div className={`guide-root guide-${pos}`} data-open={g.open || undefined}>
      {g.invite && !g.open && (
        <div className="guide-invite" role="status">
          <p>New here? I can show you how Mars BEACON works.</p>
          <div className="guide-row">
            <button className="guide-btn primary" onClick={startTour}>Take the tour</button>
            <button className="guide-btn" onClick={() => { savePrefs({ inviteDismissed: true }); open(); }}>Ask a question</button>
            <button className="guide-btn quiet" onClick={dismissInvite}>Not now</button>
          </div>
        </div>
      )}

      {g.open && (
        <section className="guide-panel" aria-labelledby="guide-title">
          <header className="guide-head">
            <span className="guide-face" aria-hidden><CompanionAvatar expression={g.expression} pointing={g.pointing} size={44} /></span>
            <h2 id="guide-title" ref={heading} tabIndex={-1}>Mars BEACON Guide</h2>
            {g.tour === null && <button className="guide-btn" onClick={startTour}>Tour</button>}
            <button className="guide-btn icon" aria-label="Close guide" onClick={close}>×</button>
          </header>

          {g.tour !== null ? (
            <TourCard i={g.tour} ctx={ctx} result={g.result} missing={g.missing}
              onBack={() => runStep(g.tour! - 1)} onNext={() => (g.tour! < TOUR.length - 1 ? runStep(g.tour! + 1) : endTour(true))}
              onSkip={() => endTour(false)} onOffer={(a) => act(a)}
              restore={changed(g.snapshot) ? () => { restoreView(g.snapshot!); useGuide.setState({ snapshot: null }); } : null} />
          ) : (
            <>
              <div className="guide-body" ref={answerRef} aria-live="polite">
                {entry ? <Answer entry={entry} ctx={ctx} result={g.result} missing={g.missing} onAct={act} onGo={goTo} onPick={pick}
                  helpful={g.helpful[entry.id]} onHelpful={(v) => useGuide.setState((s) => ({ helpful: { ...s.helpful, [entry.id]: v } }))} />
                  : <p className="guide-lead">Ask what a control does, see why it matters, and go straight to it. Your mission stays as it is.</p>}
                {g.snapshot && changed(g.snapshot) && (
                  <button className="guide-btn" onClick={() => { restoreView(g.snapshot!); useGuide.setState({ snapshot: null }); }}>Restore my view</button>
                )}
              </div>
              <div className="guide-suggest" aria-label="Suggested questions">
                {SUGGESTED.map((s) => <button key={s.label} className="guide-chip" onClick={() => pick(s.intent)}>{s.label}</button>)}
              </div>
              <form className="guide-ask" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
                <label htmlFor="guide-q" className="sr-only">Ask a question</label>
                <input id="guide-q" value={q} maxLength={MAX_QUESTION} onChange={(e) => setQ(e.target.value)} placeholder="Ask a question" autoComplete="off" />
                <button className="guide-btn primary" type="submit" disabled={!q.trim()}>Ask</button>
              </form>
              {g.entries.length > 1 && (
                <ol className="guide-history" aria-label="Earlier this session">
                  {g.entries.slice(0, -1).reverse().map((e) => (
                    <li key={e.id}><button onClick={() => useGuide.setState({ current: e.id, result: null, missing: null })}>{e.question ?? labelOf(e.res)}</button></li>
                  ))}
                </ol>
              )}
            </>
          )}
          {ctx.loadError && <p className="guide-note warn">The site data did not load, so actions that need the map are unavailable. General help still works.</p>}
        </section>
      )}

      <button ref={launcher} className="guide-launcher" aria-label={g.open ? "Close Mars BEACON guide" : "Open Mars BEACON guide"} aria-expanded={g.open}
        onClick={() => (g.open ? close() : open())}>
        <CompanionAvatar expression={g.open ? g.expression : "idle"} pointing={g.open ? g.pointing : null} size={64} />
      </button>
    </div>
  );
}

function labelOf(res: Resolution) {
  return res.kind === "topic" ? TOPIC_BY_ID.get(res.intent)!.title : res.kind === "ambiguous" ? "Which did you mean?" : "Not sure";
}

function ResultLine({ result, missing }: { result: ActionResult | null; missing: GuideAnchor | null }) {
  return (
    <>
      {result && !result.ok && <p className="guide-note warn" role="status">{result.reason} {result.manual}</p>}
      {result && result.ok && result.note && <p className="guide-note">{result.note}</p>}
      {missing && <p className="guide-note warn" role="status">I couldn't find the {ANCHORS[missing].label} on screen. {ANCHORS[missing].manual}</p>}
    </>
  );
}

function Answer({ entry, ctx, result, missing, onAct, onGo, onPick, helpful, onHelpful }: {
  entry: Entry; ctx: ReturnType<typeof readContext>; result: ActionResult | null; missing: GuideAnchor | null;
  onAct: (a: GuideActionId, anchor?: GuideAnchor) => void; onGo: (a: GuideAnchor) => void; onPick: (i: GuideIntent) => void;
  helpful: boolean | undefined; onHelpful: (v: boolean) => void;
}) {
  const { res } = entry;
  if (res.kind === "ambiguous") return (
    <div className="guide-answer">
      <p>Do you mean {res.options.map((o) => TOPIC_BY_ID.get(o)!.title.toLowerCase()).join(" or ")}?</p>
      <div className="guide-row">{res.options.map((o) => <button key={o} className="guide-btn" onClick={() => onPick(o)}>{TOPIC_BY_ID.get(o)!.title}</button>)}</div>
    </div>
  );
  if (res.kind === "unknown") return (
    <div className="guide-answer">
      <p>I don't have a reliable answer to that yet. These are close:</p>
      <div className="guide-row">{res.nearby.map((o) => <button key={o} className="guide-btn" onClick={() => onPick(o)}>{TOPIC_BY_ID.get(o)!.title}</button>)}</div>
      <p className="guide-fine">The Equations sheet documents every formula and assumption.</p>
    </div>
  );
  const t = TOPIC_BY_ID.get(res.intent)!;
  const live = t.live?.(ctx) ?? null;
  const needsSite = t.availableWhen !== "always" && !ctx.siteLoaded;
  const needsPlan = t.availableWhen === "plan-ready" && !ctx.plansReady;
  return (
    <div className="guide-answer">
      <h3>{t.title}</h3>
      <p>{t.summary}</p>
      {live && <p className="guide-live">{live}</p>}
      {t.steps && <ol className="guide-steps">{t.steps.map((s) => <li key={s}>{s}</li>)}</ol>}
      {t.details && <details><summary>More detail</summary>{t.details.map((d) => <p key={d}>{d}</p>)}</details>}
      <div className="guide-row">
        {t.action && t.action !== "offer_rehearsal" && t.actionLabel && (
          <button className="guide-btn primary" disabled={needsSite} onClick={() => onAct(t.action!, t.anchor)}>{t.actionLabel}</button>
        )}
        {t.action === "offer_rehearsal" && (
          <button className="guide-btn primary" disabled={needsSite || needsPlan} onClick={() => onAct("start_rehearsal", "timeline")}>Start rehearsal</button>
        )}
        {t.anchor && (!t.action || t.action === "offer_rehearsal") && <button className="guide-btn" disabled={needsSite} onClick={() => onGo(t.anchor!)}>Go to {ANCHORS[t.anchor].label}</button>}
      </div>
      {needsSite && <p className="guide-note">This needs the site data, which has not loaded yet.</p>}
      {!needsSite && needsPlan && <p className="guide-note">This needs a plan first.</p>}
      <ResultLine result={result} missing={missing} />
      <div className="guide-helpful">
        {helpful === undefined ? (<><span>Was this helpful?</span><button className="guide-btn quiet" onClick={() => onHelpful(true)}>Yes</button><button className="guide-btn quiet" onClick={() => onHelpful(false)}>No</button></>)
          : <span>{helpful ? "Thanks." : "Thanks. The related topics may help:"}</span>}
      </div>
      {helpful === false && t.related && <div className="guide-row">{t.related.map((o) => <button key={o} className="guide-btn" onClick={() => onPick(o)}>{TOPIC_BY_ID.get(o)!.title}</button>)}</div>}
    </div>
  );
}

function TourCard({ i, ctx, result, missing, onBack, onNext, onSkip, onOffer, restore }: {
  i: number; ctx: ReturnType<typeof readContext>; result: ActionResult | null; missing: GuideAnchor | null;
  onBack: () => void; onNext: () => void; onSkip: () => void; onOffer: (a: GuideActionId) => void;
  restore: (() => void) | null;
}) {
  const step = TOUR[i];
  const last = i === TOUR.length - 1;
  const p90 = step.id === "return" && ctx.siteLoaded ? (ctx.p90Ready ? "The P90 result is available now." : "The P90 result is unavailable at the moment.") : null;
  return (
    <div className="guide-body guide-tour" aria-live="polite">
      <p className="guide-step">Step {i + 1} of {TOUR.length}: {step.title}</p>
      <p>{step.narration}</p>
      {p90 && <p className="guide-live">{p90}</p>}
      <ResultLine result={result} missing={missing} />
      {step.offer && <button className="guide-btn" onClick={() => onOffer(step.offer!.action)}>{step.offer.label}</button>}
      {last && restore && <button className="guide-btn" onClick={restore}>Restore my view</button>}
      <div className="guide-row guide-tour-nav">
        <button className="guide-btn" onClick={onBack} disabled={i === 0}>Back</button>
        <button className="guide-btn primary" onClick={onNext}>{last ? "Done" : "Next"}</button>
        {!last && <button className="guide-btn quiet" onClick={onSkip}>Skip tour</button>}
      </div>
    </div>
  );
}

function useRoute() {
  const [h, setH] = useState(() => window.location.hash);
  useEffect(() => { const f = () => setH(window.location.hash); window.addEventListener("hashchange", f); return () => window.removeEventListener("hashchange", f); }, []);
  return h.startsWith("#/app") ? "app" : "landing";
}
