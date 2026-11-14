# Mars BEACON v6: How It All Fits Together

For Harishik, Sahaj and Naomi. Companion to the v6 Team Workflow PDF. The PDF says **what** to do and **when**. This page explains **how** the pieces connect, **how** updates reach everyone, and **why** nobody has to wait for anybody.

Everything here follows the v6 plan and the repo as it is on `main`.

---

## 1. The whole system on one page

There are four places things live. Each one has one owner.

```
   GitHub repo (code only)                 Google Cloud Storage bucket (big data)
   +------------------------+              +------------------------------------+
   | frontend/   Harishik   |              | gale-boxwork/v0.1.0/               |
   | backend/    Naomi      |              |   manifest.json                    |
   | pipeline/   Sahaj      |  Sahaj and   |   height_4m.f32, slope_4m.u8, ...  |
   |   reconstruction/      |  Harishik    |   ortho tiles, ML layers (Sahaj)   |
   |              Harishik  |  upload ---> |   glb patches, .spz splats         |
   | contracts/  all three  |              |   (Harishik)                       |
   | fixtures/   all three  |              +------------------------------------+
   +------------------------+                         |
        |            |                                | app downloads the bundle
        | merge to   | merge to                       | (VITE_BUNDLE_BASE_URL)
        | main       | main                           v
        v            v                     +------------------------------------+
   Static host   Cloud Run  <-- optional --| BROWSER APP (what judges open)     |
   (GitHub or    (Naomi's     API calls    | Console, Tablet, HUD               |
   Cloudflare    FastAPI +    (VITE_API_   | Web Worker computes every number   |
   Pages)        PostGIS)     BASE_URL)    | (envelope, routes, sun, radiation) |
   serves the                              +------------------------------------+
   app files
```

Two rules make it work:

1. **Every number the judges see is computed in the browser**, from the bundle files. The backend only adds live data (DONKI, Mars24 conditions, rover images), sharing and the Site Generator. If the backend is down, the app still works and panels say **CACHED**.
2. **Code goes in Git. Data goes in the bucket.** Large files never go into Git.

---

## 2. The three contracts: the handshakes between people

A contract is a small file that fixes the **shape** of what one person hands to another. Once the shape is agreed, each side can build and test alone, because they both know exactly what will arrive.

Think plug and socket. If Sahaj's plug (the bundle) has the agreed shape, Harishik's socket (the loader) accepts it, whether it is fake data at 23:00 or real Gale data at 01:00.

| Contract (in `contracts/`) | Handshake between | Plain meaning |
|---|---|---|
| `site_manifest.example.json` | Sahaj (writes data) -> Harishik (app reads) and Naomi (serves it) | "Here is the list of data files for a site, their size, type and scale, and every layer's mission, product ID, date and tag" |
| `api_contract.yaml` | Naomi (backend answers) -> Harishik (app asks) | "If the app calls `/spaceweather`, here is exactly what comes back" |
| `mission_state.schema.ts` | Harishik (app state) -> Sahaj (parity tests) and Naomi (saved plans) | "This is what a mission looks like: crew, oxygen, events, plans, envelope" |

### What is actually in them (real examples from the repo)

A file entry in the manifest:

```json
{ "name": "height", "path": "height_4m.f32", "dtype": "float32",
  "cols": 750, "rows": 750, "scale": 1, "offset": 0, "sha256": "TBD" }
```

This tells Harishik's loader: download `height_4m.f32`, read it as 750 x 750 float32 numbers, multiply by `scale`, add `offset`. The loader never hard-codes a file name or size. It reads them here. That is also why Jezero works through the same code: a second manifest, nothing else.

An endpoint in the API contract:

```yaml
/plans:
  post: { summary: Save a plan (MissionState subset), responses: { "201": { description: "{ shareId }" } } }
```

This tells Harishik: send a plan, get back a `shareId`. It tells Naomi: whatever is inside the server, the answer must look like this.

A type in the mission state schema:

```ts
export interface Haven { id: string; type: "habitat" | "rover" | "shelter"; x: number; y: number; active: boolean; }
```

Naomi stores plans in this shape. Sahaj's Python parity tests read and write this shape. Harishik's store uses it everywhere.

---

## 3. Fixtures: how you work before the others are done

`fixtures/` holds **fake data in the real format**. It is the reason nobody waits.

| Who | Builds against | Swaps to the real thing when |
|---|---|---|
| Harishik (app) | `fixtures/` fake 750 x 750 bundle and fake API responses | Sahaj uploads a real bundle; Naomi posts the Cloud Run URL |
| Naomi (backend) | `fixtures/` manifest and plan examples | Sahaj's real manifest lands in the bucket |
| Sahaj (pipeline) | `contracts/site_manifest.example.json` as the output target | Nothing to swap: his output **is** the real thing |

### The two switches

The app has two settings. Changing them is the **only** step needed to move from fake to real. No code changes.

| Setting | Development value | Real value |
|---|---|---|
| `VITE_BUNDLE_BASE_URL` | `/fixtures` | The bucket URL, e.g. `https://storage.googleapis.com/<bucket>/gale-boxwork/` |
| `VITE_API_BASE_URL` | Fixture mode, or Naomi's laptop | The Cloud Run URL Naomi posts in chat once |

---

## 4. How updates reach everyone (four real stories)

### Story A: Sahaj makes better terrain

1. Sahaj runs `pipeline/build_site.py`. It writes the rasters and a `manifest.json` in the agreed format.
2. He uploads them to a **new versioned folder** in the bucket, e.g. `gale-boxwork/v0.2.0/`.
3. He points the site's manifest at the new version.
4. Harishik (and the judges) reload the app. The new terrain appears. **Nobody changed any code.**

If something is wrong with v0.2.0, point the manifest back to v0.1.0. Old versions are never overwritten.

### Story B: Naomi adds the space weather endpoint

1. Naomi writes `/spaceweather` in `backend/`, matching what `api_contract.yaml` already says.
2. She merges to `main`. GitHub Actions builds the container and redeploys Cloud Run **at the same URL**.
3. Harishik's space weather panel, already coded against the contract and tested on fixtures, now shows **LIVE** data. **Harishik does nothing.**
4. If Cloud Run is asleep or down, the panel shows **CACHED** from the bundle copy.

### Story C: Harishik needs a field that is not in a contract

Example: the HUD needs `sunAzDeg` from `/conditions` and it is not there.

1. Harishik posts in the **"contracts"** chat thread: what field, why.
2. Naomi says OK (or suggests a better shape).
3. Naomi updates `api_contract.yaml` **and** the matching fixture in one small PR, then the real endpoint.
4. Harishik uses the field. Fixtures already have it, so he is not blocked while Naomi codes.

Adding a field is cheap. Renaming or removing one breaks someone: avoid it after Gate 1.

### Story D: Harishik's reconstruction outputs

1. Harishik's scripts in `pipeline/reconstruction/` produce a fused `.glb` patch at waypoint 1 and an `.spz` splat at the destination.
2. He uploads them into the **same** versioned bundle folder.
3. He adds entries to the manifest's `patches` and `splats` lists (they already exist, empty).
4. The app sees new entries and loads them. Same mechanism as Story A.

---

## 5. Your lane: what you touch and what you never touch

| | You own and edit freely | You read but never edit | You change only through the "contracts" thread |
|---|---|---|---|
| **Harishik** | `frontend/`, `pipeline/reconstruction/` | `backend/`, `pipeline/` (except reconstruction) | `contracts/` |
| **Sahaj** | `pipeline/` (except reconstruction) | `frontend/`, `backend/` | `contracts/` |
| **Naomi** | `backend/`, CI/CD workflows, hosting config | `frontend/`, `pipeline/` | `contracts/` |

Suggested (agree at the contract call): each person owns their own `fixtures/` subfolder (`fixtures/bundle/` Sahaj, `fixtures/api/` Naomi, `fixtures/state/` Harishik).

Two people never edit the same file at the same time. That is what keeps merges painless.

---

## 6. How you know your part fits before you merge

You do not need the others' code running to check that you are compatible. Check yourself against the contract:

| Who | Self-check before merging |
|---|---|
| Sahaj | The manifest you wrote validates against `site_manifest.example.json`'s fields; every file listed exists, sizes match `cols x rows`, sha256 filled in. Python parity tests read a `MissionState` in the schema's shape |
| Naomi | Every endpoint's response matches `api_contract.yaml` (backend tests compare real responses to the contract) |
| Harishik | The app runs on fixtures with no console errors; the loader rejects a manifest with a wrong size instead of drawing garbage |

Then the real joining happens at the checkpoints (section 8), where you check it together.

---

## 7. Git in six commands

```bash
git checkout main && git pull --rebase origin main     # start of every work block
git checkout -b sahaj/l0-terrain                        # yourname/what-you-are-doing
# ...work...
git add pipeline/                                       # only your folders
git commit -m "Bake slope and horizon rasters for Gale box"
git push -u origin sahaj/l0-terrain                     # then open a pull request on GitHub
```

- Merge into `main` several times a day, in small pieces. Never one huge merge at 03:00.
- `main` must always build. If CI is green and nobody is awake, merge your own small PR.
- Conflict and unsure? Stop and ask in chat. Never force-push.
- No AI co-author lines in commits (the hook and CI remove or reject them). No secrets in Git.

---

## 8. Checkpoints: when the pieces are joined and checked together

Integration is not a step at the end. `main` **is** the integrated app at every moment, and three checkpoints confirm it.

| Checkpoint | All three open the app and confirm |
|---|---|
| **Gate A: contracts frozen** | All three contract files agreed, `TBD` fields resolved or marked, fixtures load in the app |
| **Gate 1 (01:00)** | Real Gale terrain in 3D, at least 4 layers, live envelope, backend answering. If the envelope is missing, everyone helps until it is there |
| **Gate 2 (Sun 12:00): feature freeze** | Every feature merged at least at must-ship depth (plan section 7.1). After this, fixes only |

Each check takes 5 minutes: what works, what is blocked, who fixes it.

---

## 9. What exists right now and what is still missing

Checked on `main` at about 23:00 KST Saturday.

| Item | Status |
|---|---|
| Repo layout, folder READMEs, licence, AI co-author hook and CI check | Done |
| Starter contracts (all three) | Drafted. Still `TBD`: manifest `siteHash`, `crs.proj4`, elevation range, sha256 values, target coordinates |
| `frontend/` app scaffold | Not yet (README only) |
| `backend/` FastAPI scaffold, Cloud Run deploy | Not yet (README only) |
| `fixtures/` fake bundle and fake API responses | Not yet (README only) |
| CI that tests and **auto-deploys** on merge (plan file 23, section 3) | Not yet. Only the AI co-author check runs. Until this exists, "every merge deploys itself" is not true |
| Bucket for bundles | Not confirmed |

The 21:30 to 23:00 block in the PDF assumed the scaffolds and fixtures were in. The fastest catch-up order:

1. **Harishik:** frontend scaffold + fake 750 x 750 bundle in `fixtures/bundle/`, so the app renders something.
2. **Naomi:** backend `/health` + fixture responses in `fixtures/api/`, deploy to Cloud Run, post the URL; then the deploy workflow.
3. **Sahaj:** a 500 m real crop in the manifest format, sent to Harishik as soon as it exists; create the bucket with Naomi.

---

## 10. Quick answers

**"What if my part is not ready at a checkpoint?"** The others keep using fixtures. Say so in chat, give an honest time, keep going.

**"What if the backend breaks during the demo?"** The app still runs on the bundle; panels say CACHED. That is by design.

**"What if I break `main`?"** Revert your PR on GitHub (one button) and say so in chat. Fix on your branch.

**"Who decides a contract change?"** The contract's owner, after the other two say OK in the "contracts" thread.

**"Stuck for 20 minutes?"** Say it in chat. Silence is the most expensive bug.
