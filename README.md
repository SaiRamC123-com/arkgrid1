# ArkGrid: Flood Response Intelligence

Citizen safety, rescue intelligence and command operations in one connected platform.
A prototype. See "Honesty and limits" below before relying on any output.

## What it does

**Citizens:** one-tap offline SOS, family safety circles with safe-zone check-ins, shelter and hospital finder with live capacity and offline routes, photo hazard reports with AI-assisted triage, road accessibility layer, flood-risk mask, ArkBot chatbot, evacuation advisories.

**Responders and commanders:** live command dashboard (Socket.io), incident clustering, rescue priority scoring, probable search zones, what-if simulator (rain and water surge), relief logistics with runway forecasting, drone and responder safety (trap zones, go/no-go gate, drone planner).

## Architecture

```
React + Vite + Tailwind (PWA, offline queue, Leaflet)
        │  REST + Socket.io (Firebase ID token on every call)
Node + Express API ── Firebase Auth / Firestore / Storage (Admin SDK)
        │            └─ Groq (chatbot, report classification)
        │  X-Internal-Key
Python FastAPI ML service
   Model 01 flood risk · Model 02 clustering · Model 03 search zones · simulator
```

| Slide model            | Method                         | Where                              |
| ---------------------- | ------------------------------ | ---------------------------------- |
| 01 Flood risk          | Gradient-boosted classifier    | `ml-service/flood_risk`            |
| 02 Incident clustering | DBSCAN / HDBSCAN               | `ml-service/clustering`            |
| 03 Search zones        | Monte Carlo drift              | `ml-service/search_zone`           |
| 04 Rescue priority     | Weighted multi-criteria (MCDA) | `server/services/triageService.js` |

## Setup

Requirements: Node 18+, Python 3.10+, a Firebase project, a Groq API key.

```bash
# 1. install
npm install
npm install --prefix client && npm install --prefix server
cd ml-service && python -m venv venv && source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt && cd ..

# 2. configure (see tables below)
#    client/.env, server/.env, ml-service/.env, server/config/serviceAccountKey.json

# 3. check everything
npm run doctor

# 4. run
npm run dev                                         # client :5173 + API :5000
cd ml-service && uvicorn main:app --port 8000       # ML service
```

Firebase: enable Email/Password auth, create Firestore, optionally enable Storage, then
`firebase deploy --only firestore:rules,storage` (deny-all rules; only the API touches data).

### Environment

| File              | Variable                                          | Notes                             |
| ----------------- | ------------------------------------------------- | --------------------------------- |
| `client/.env`     | `VITE_FIREBASE_*`, `VITE_API_URL`                 | Firebase web config, API base URL |
| `server/.env`     | `PORT`, `CLIENT_URL`                              | CORS origin = the client URL      |
|                   | `GROQ_API_KEY`, `GROQ_MODEL`, `GROQ_VISION_MODEL` | ArkBot and report AI (optional)   |
|                   | `FIREBASE_STORAGE_BUCKET`                         | Report photos (optional)          |
|                   | `ML_SERVICE_URL`, `ML_API_KEY`                    | Key must equal `ml-service/.env`  |
|                   | `RESPONDER_CODE`, `COMMANDER_CODE`                | Invite codes for staff sign-up    |
|                   | `CLUSTER_*`, `CONTACT_LOST_MIN`                   | Tuning knobs, all optional        |
| `ml-service/.env` | `ML_API_KEY`, `DEM_GEOTIFF`                       | Optional local DEM (EPSG:4326)    |

## Roles

`citizen` (default) · `responder` (invite code) · `commander` (invite code).
Roles are stored server-side and enforced by the API and by Socket.io rooms.

## Demo in three minutes

```bash
npm run seed -- --lat 12.9716 --lng 77.5946    # your coordinates; needs a commander account
```

1. **Commander:** Command Dashboard (live pins, alerts) → Incident Clusters (17 signals → 5 incidents) → Rescue Priority (drag the weights) → assign a team and watch it move.
2. **Simulator:** run +1.5 m surge, press play, publish the safety overlay, then check Drone & Responder Safety.
3. **Citizen (second browser):** switch DevTools to Offline, send an SOS, go back online and watch it sync. Report a hazard with a photo and ask ArkBot for the nearest shelter.

`npm run seed -- --clear` removes all demo data.

## Honesty and limits

- No accuracy figure is claimed anywhere. The default flood model is trained on **synthetic heuristic labels**, so it reproduces an assumption, not observed floods.
- Search zones, triage weights, supply rates, walking speeds and drone limits are **assumptions** shown in the UI.
- Terrain is 90 m with several metres of vertical error. Use surge results to compare scenarios, not to read depths.
- Roads and hazards come from citizen reports and may be wrong or outdated.
- Advisories reach only people using the app. They do not replace sirens, SMS or broadcast alerts.
- To train on real data: `python -m flood_risk.build_dataset ...` then `python -m flood_risk.train --csv ...`, and benchmark with a **spatial hold-out**.

## Deploying

- Client: `npm run build --prefix client`; host `client/dist` with an SPA fallback to `index.html`. Serve `sw.js` from the root and bump `VERSION` in it on each release.
- API: `NODE_ENV=production node server.js` behind HTTPS (the app sets `trust proxy`). Set `CLIENT_URL` to the real origin.
- ML service: `uvicorn main:app --host 0.0.0.0 --port 8000` on a **private network**, always with `ML_API_KEY`. Persist `flood_risk/artifacts` or let it retrain on start.
- Open-Meteo's free tier is non-commercial. Use a commercial plan or self-host for funded deployments. OSRM demo servers are not for production.
- Storage may require a paid Firebase plan. Without it, reports still work and photos are skipped.

## Troubleshooting

Run `npm run doctor` first. Common issues: ML key mismatch (401), missing service account key,
GPS blocked (needs HTTPS or localhost), Storage bucket name copied wrongly.

## Attribution

Copernicus DEM GLO-90 and weather data via Open-Meteo.com · © OpenStreetMap contributors · © CARTO · OSRM.
