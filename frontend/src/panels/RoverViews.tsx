// Rover point of view at each stop: Curiosity Navcam frames taken where the rover stood (HISTORICAL),
// with the M1 terrain classes as an optional overlay (DERIVED). Answers "what will I see when I get there".
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useStore } from "../store/store";
import { Tag } from "./Tag";

export interface RoverImage {
  stop: string; imageid: string; sol: number; lmst: string | null; azimuth: number; elevation: number; camera: string;
  image: string; m1: string; classFractions: Record<"soil" | "bedrock" | "sand" | "big_rock", number>; source: string; credit: string;
}

const BASE = (import.meta.env.VITE_BUNDLE_BASE_URL as string | undefined) ?? "./bundle";
const cache = new Map<string, Promise<RoverImage[]>>();

function loadIndex(siteId: string): Promise<RoverImage[]> {
  if (!cache.has(siteId)) {
    cache.set(siteId, fetch(`${BASE}/${siteId}/rover/index.json`).then((r) => (r.ok ? r.json() : { images: [] })).then((j) => j.images as RoverImage[]).catch(() => []));
  }
  return cache.get(siteId)!;
}

export function useRoverImages(stopId: string | undefined) {
  const siteId = useStore((s) => s.bundle?.manifest.siteId);
  const [imgs, setImgs] = useState<RoverImage[]>([]);
  useEffect(() => {
    let live = true;
    if (!siteId || !stopId) { setImgs([]); return; }
    loadIndex(siteId).then((all) => { if (live) setImgs(all.filter((i) => i.stop === stopId)); });
    return () => { live = false; };
  }, [siteId, stopId]);
  return { imgs, url: (p: string) => `${BASE}/${siteId}/${p}` };
}

const CLASS_LABEL = { soil: "Soil", bedrock: "Bedrock", sand: "Sand", big_rock: "Possible big rock" } as const;
const CLASS_COLOUR = { soil: "#d6a06e", bedrock: "#7896c8", sand: "#f0cd5a", big_rock: "#ff468c" } as const;
const compass = (az: number) => ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(az / 45) % 8];

export function RoverViews({ stopId, compact = false }: { stopId: string; compact?: boolean }) {
  const { imgs, url } = useRoverImages(stopId);
  const [open, setOpen] = useState<number | null>(null);
  if (!imgs.length) return null;
  return (
    <div className={`rover-views ${compact ? "compact" : ""}`}>
      <div className="rv-head"><span>What you will see here</span><Tag t="HISTORICAL" /></div>
      <div className="rv-strip">
        {imgs.map((im, i) => (
          <button key={im.imageid} className="rv-thumb" onClick={() => setOpen(i)} aria-label={`Open Navcam view looking ${compass(im.azimuth)}`}>
            <img src={url(im.image)} alt="" loading="lazy" />
            <span>{compass(im.azimuth)}</span>
          </button>
        ))}
      </div>
      {!compact && <p className="rv-note">Curiosity Navcam, sol {imgs[0].sol}, from where the rover stood at this stop.</p>}
      {open !== null && createPortal(
        <Lightbox imgs={imgs} i={open} url={url} onClose={() => setOpen(null)} onStep={(d) => setOpen((open + d + imgs.length) % imgs.length)} />,
        document.body)}
    </div>
  );
}

function Lightbox({ imgs, i, url, onClose, onStep }: { imgs: RoverImage[]; i: number; url: (p: string) => string; onClose: () => void; onStep: (d: number) => void }) {
  const [classes, setClasses] = useState(false);
  const im = imgs[i];
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); if (e.key === "ArrowRight") onStep(1); if (e.key === "ArrowLeft") onStep(-1); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose, onStep]);
  const f = im.classFractions;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="rv-box" role="dialog" aria-modal="true" aria-label="Rover view" onClick={(e) => e.stopPropagation()}>
        <div className="rv-img">
          <img src={url(im.image)} alt={`Curiosity Navcam view looking ${compass(im.azimuth)}, sol ${im.sol}`} />
          {classes && <img className="rv-m1" src={url(im.m1)} alt="" />}
          <button className="rv-nav prev" aria-label="Previous view" onClick={() => onStep(-1)}>‹</button>
          <button className="rv-nav next" aria-label="Next view" onClick={() => onStep(1)}>›</button>
        </div>
        <aside className="rv-side">
          <header><h3>Looking {compass(im.azimuth)} ({Math.round(im.azimuth)}°), {Math.abs(Math.round(im.elevation))}° down</h3><button className="btn btn-quiet" onClick={onClose}>Close</button></header>
          <dl className="facts">
            <div><dt>Taken</dt><dd>Sol {im.sol}{im.lmst ? `, ${im.lmst.split("M")[1]?.slice(0, 5)} LMST` : ""}</dd></div>
            <div><dt>Camera</dt><dd>{im.camera}</dd></div>
            <div><dt>Credit</dt><dd>{im.credit}</dd></div>
          </dl>
          <label className="rv-toggle"><input type="checkbox" checked={classes} onChange={(e) => setClasses(e.target.checked)} /> Show terrain classes (M1 model) <Tag t="DERIVED" /></label>
          <ul className="rv-classes">
            {(Object.keys(CLASS_LABEL) as (keyof typeof CLASS_LABEL)[]).map((k) => (
              <li key={k}><i style={{ background: CLASS_COLOUR[k] }} />{CLASS_LABEL[k]}<b>{Math.round(f[k] * 100)}%</b></li>
            ))}
          </ul>
          <p className="fine-note">Ground within 15 m is classified. M1: expert test mIoU 0.806; big rock is about 35% precise, so it marks possible rock. <a href={im.source} target="_blank" rel="noreferrer">Original image</a></p>
        </aside>
      </div>
    </div>
  );
}
