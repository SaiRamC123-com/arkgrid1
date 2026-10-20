# ArkGrid: Flood Response Intelligence

Citizen safety, rescue intelligence and command operations in one connected platform.
A prototype. See "Honesty and limits" below before relying on any output.

## What it does

**Citizens:** one-tap SOS with an offline local queue (transmitted to the response system when internet returns) and a user-confirmed SMS composer, local GPS history for offline SOS, family safety circles with safe-zone check-ins, photo hazard reports with AI-assisted triage, road accessibility layer, flood-risk mask, ArkBot chatbot, evacuation advisories, and disaster-history route comparisons to registered shelters.

**Responders and commanders:** live command dashboard (Socket.io), incident clustering, rescue priority scoring, probable search zones, what-if simulator (rain and water surge), relief logistics with runway forecasting, drone and responder safety (trap zones, go/no-go gate, drone planner).

**Live observations:** USGS earthquake event reports and GDACS flood/tropical-cyclone alerts are shown alongside separately labeled Open-Meteo model weather conditions near a user-selected location. Each provider has independent status and retrieval age; earthquakes can fall back directly to USGS only when the ArkGrid route returns 404. Open-Meteo conditions are not confirmed disasters or warnings, and ongoing GDACS events remain visible outside the selected recent-event window.

**Flood Risk monitoring:** a separate authenticated monitor samples Open-Meteo precipitation around the selected 1–8 km area, checks nearby GDACS flood/cyclone event points, and includes only fresh verified ArkGrid submerged-road/flooded-road reports. The screen shows GREEN/YELLOW/RED/UNKNOWN with source availability and retrieval times; red is based on an active GDACS red flood alert or a verified ArkGrid flooded-road report, and yellow on an active GDACS orange flood alert. Open-Meteo values are model estimates, not rain-gauge observations, and are displayed without an unvalidated rainfall-to-flood threshold. GREEN means no elevated signal was returned by the available sources—not that flooding is absent or the area is safe. GDACS event centroids and report markers are points, not flood extents. The ML susceptibility mask remains optional and is not a measured flood observation.

**Heat Wave Tracking:** a nine-point Open-Meteo forecast grid for a selected location, refreshed every ten minutes. Heat-index estimates use air temperature, humidity, the NWS equation, and NWS risk bands; they are not official local heat warnings or sensor observations. Cached values may be served for up to one hour when the provider is unavailable.

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

#### Windows PowerShell: ML service

Run these commands in a PowerShell terminal. The FastAPI application is `main:app` (not
`app:app`), and use the project virtual environment so its declared dependencies are available:

```powershell
Set-Location .\ml-service
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

If `.venv` has not been created yet, first run
`python -m venv .venv`; then use the commands above. The API defaults to
`http://localhost:8000` when `ML_SERVICE_URL` is blank. For local development, set
`ML_SERVICE_URL=http://127.0.0.1:8000` in `server/.env` if the Node process cannot resolve or
connect to `localhost`; the server and ML service must use the same `ML_API_KEY`.

Firebase: enable Email/Password auth, create Firestore, optionally enable Storage, then
`firebase deploy --only firestore:rules,storage` (deny-all rules; only the API touches data).

### Environment

| File              | Variable                                          | Notes                             |
| ----------------- | ------------------------------------------------- | --------------------------------- |
| `client/.env`     | `VITE_FIREBASE_*`, `VITE_API_URL`                 | Firebase web config, API base URL |
|                   | `VITE_OBSERVATIONS_REFRESH_MS`                     | Optional refresh interval (minimum 60 seconds; default 5 minutes) |
| `server/.env`     | `PORT`, `CLIENT_URL`                              | CORS origin = the client URL      |
|                   | `GROQ_API_KEY`, `GROQ_MODEL`, `GROQ_VISION_MODEL` | ArkBot and report AI (optional)   |
|                   | `FIREBASE_STORAGE_BUCKET`                         | Report photos (optional)          |
|                   | `ML_SERVICE_URL`, `ML_API_KEY`                    | Reachable ML URL; key must match `ml-service/.env` |
|                   | `RESPONDER_CODE`, `COMMANDER_CODE`                | Invite codes for staff sign-up    |
|                   | `CLUSTER_*`, `CONTACT_LOST_MIN`                   | Tuning knobs, all optional        |
|                   | `USGS_CACHE_TTL_MS`                               | USGS response cache lifetime (default 5 minutes) |
|                   | `GDACS_CACHE_TTL_MS`                              | GDACS response cache lifetime (default 5 minutes) |
|                   | `FLOOD_WEATHER_CACHE_TTL_MS`                       | Flood-monitoring weather cache lifetime (default 10 minutes) |
|                   | `WEATHER_CACHE_TTL_MS`                            | Heat forecast cache lifetime (default 10 minutes) |
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
3. **Citizen (second browser):** switch DevTools to Offline, send an SOS, go back online and watch it sync. Report a hazard with a photo and ask ArkBot about local shelter resources.

### SOS delivery boundaries

- A pending SOS is stored in this browser's local queue while offline. It is not transmitted until a network connection returns and the authenticated API acknowledges it.
- The SOS page prepares its SMS fallback independently of the online request. While a reachable-looking network request is awaiting acknowledgement, a draft can become available after five seconds; network, timeout, server, or missing-endpoint failures also expose it. Location details must be confirmed before the draft can be prepared, copied, or opened. The user must tap to open the phone's messaging app, review the recipient and message, and tap Send. ArkGrid cannot confirm the app opened, SMS submission, or delivery. Authentication, authorization, rate-limit, and validation errors are reported separately rather than treated as internet failures.
- Emergency recipients are selected from saved medical contacts, Family Network members, the supported browser Contact Picker, or a number entered for that SOS. A minimal Family Network contact list is stored in the local IndexedDB cache for offline selection; phone contacts selected in the browser are not uploaded or saved by this flow.
- Live location updates are opt-in and go to the authenticated ArkGrid response system while the incident is active and internet is available. SMS recipients do not get live updates, and no public/time-limited location link is provided.
- Browser location requires user permission and a secure context (HTTPS in production). ArkGrid uses the browser device-location API, not an internet geolocation endpoint. Availability and accuracy depend on the device and environment. Cached GPS fixes include accuracy and capture time; they are labeled "LAST KNOWN POSITION" and may be outdated. Retry Location watches for up to ten seconds and chooses the valid reading with the best reported accuracy. Manual coordinates have no measured accuracy.
- Before preparing or opening an SMS, confirm the location details. Optional manual coordinates require a complete in-range latitude/longitude pair. Confirmed landmark, locality/address, and trapped/emergency-description fields are saved with a queued incident in IndexedDB and with an acknowledged incident on the server, then restored on reload. The SMS labels manual coordinates as not GPS-verified and user-provided descriptions as unverified. Prepared message size and estimated SMS segments are displayed because carrier limits can vary.
- While the signed-in app is open and browser location permission is already granted, ArkGrid records device GPS snapshots locally in IndexedDB and retains at most 30 minutes. On offline SOS, activation uses only a user-confirmed saved point—latest, approximately five, or approximately ten minutes old (within two minutes of that target)—and does not request a new position for that activation or substitute a different snapshot. GPS sampling remains local and is not recorded in the background. The generated SMS clearly labels the saved coordinates and includes their original timestamp and age.
- The generated PWA worker precaches the application shell, route fallback, manifest, icons, and built assets. Emergency messages, contacts, coordinates, and queued records are not service-worker cache entries. First load/installation requires connectivity and the service worker must finish installing before the shell can open offline. External map tiles and web fonts are optional; the SOS controls do not require them.

### SOS manual verification

Use a test account and test recipient number; do not use the flow to contact emergency services during testing.

1. **Online submission:** allow location, select an emergency need and test contact, tap SOS, and confirm the authenticated response system records the incident. No SMS should open on an acknowledged submission.
2. **No internet / API failure / timeout:** use browser DevTools Offline or a local test API that is stopped/unreachable; tap SOS and confirm an SMS draft appears in the same SOS page. Select a valid test contact, tap **Open SMS Application**, verify recipient/body, and cancel rather than sending.
3. **Authentication and validation:** expire the test session or submit invalid test data; verify an auth/validation message appears and is not described as a network outage or automatically sent by SMS.
4. **Fresh GPS:** grant location permission and confirm coordinates, accuracy, timestamp, and "DEVICE GPS LOCATION" in the prepared draft.
5. **Denied/timeout GPS with cache:** first obtain a valid fix, then deny permission or simulate a timeout; confirm the cached position is labeled "LAST KNOWN POSITION" with its original timestamp.
6. **Offline GPS history:** while signed in and online, grant location permission and keep the app open for at least ten minutes. Go offline, confirm the displayed latest/approximately five/approximately ten minute snapshot and explicitly confirm the desired point before SOS. Check the SMS includes its original timestamp and age and is labeled not current. If no point is available for a requested age, verify no other location is substituted.
7. **No position and no contact:** clear only the test account's `ark_last_fix_<uid>` key and that account's records in the IndexedDB `locationHistory` store, then leave all recipients unselected; confirm the message has no coordinates or map link and asks for a valid responder number.
8. **Manual location and landmarks:** enter a valid manual coordinate pair and landmark/locality/trapped details; confirm and save them, then prepare an SMS. Verify the message marks the location as manually entered/not GPS-verified, includes the user-entered details, and displays an estimated segment count. Edit a field and verify SMS preparation is blocked until reconfirmation. Test a partial or out-of-range coordinate pair and confirm it is rejected.
9. **Retry Location:** use the retry action and confirm it stops within ten seconds, selects the reading with the smallest accuracy value, and refreshes the draft. Also navigate away during the watch and verify the watch stops.
10. **SMS URI compatibility:** on Android Chrome verify the `?body=` composer URI; on iOS Safari verify `&body=`. Check the text is encoded once and that ArkGrid never reports sending or delivery.
11. **Duplicate taps and offline shell:** rapidly tap the existing SOS button and verify one incident is queued; after one successful online load and service-worker installation, switch offline and reload `/citizen/sos` to check the cached app shell.

Focused client tests: from `client`, run `node --test src\\utils\\sosLocation.test.js src\\utils\\sosLocationHistory.test.js src\\utils\\sosSms.test.js src\\utils\\sosSubmission.test.js src\\utils\\heatIndex.test.js src\\utils\\heatWeather.test.js`. Build with `npm run build` from the repository root.

`npm run seed -- --clear` removes all demo data.

## Honesty and limits

- No accuracy figure is claimed anywhere. The default flood model is trained on **synthetic heuristic labels**, so it reproduces an assumption, not observed floods.
- Search zones, triage weights, supply rates, walking speeds and drone limits are **assumptions** shown in the UI.
- Terrain is 90 m with several metres of vertical error. Use surge results to compare scenarios, not to read depths.
- Roads and hazards come from citizen reports and may be wrong or outdated.
- Flood monitoring is a screening view, not a warning service. It does not query local river gauges or national flood-warning agencies, and does not infer flood boundaries from weather-model values or GDACS point centroids. A missing alert/report or GREEN status is not evidence that an area is safe.
- Advisories reach only people using the app. They do not replace sirens, SMS or broadcast alerts.
- To train on real data: `python -m flood_risk.build_dataset ...` then `python -m flood_risk.train --csv ...`, and benchmark with a **spatial hold-out**.

## Deploying

- Client: `npm run build --prefix client`; host `client/dist` with an SPA fallback to `index.html`. Serve `sw.js` from the root and bump `VERSION` in it on each release.
- Vercel client: set `VITE_API_URL` to the deployed API's HTTPS origin (for example, `https://arkgrid-server.onrender.com`), never `localhost`; redeploy after changing this Vite build-time variable.
- API: deploy/restart the updated API before the client so `/api/weather/heat-grid` is available. For local development, set `VITE_API_URL=http://localhost:5000` in `client/.env.local` and run the API on port 5000. In production, use the deployed API's HTTPS origin.
- Heat Wave Tracking uses the public Open-Meteo Forecast API from the Node API server; no ML service is involved. Confirm deployment with `GET /api/weather/heat-grid?lat=12.9716&lng=77.5946&radiusKm=10`. A successful response has a nine-point `points` array, a populated `center`, and `retrievedAt`; optional provider fields are displayed independently. The frontend falls back directly to Open-Meteo only if the configured ArkGrid API returns 404 for this route. The Bengaluru coordinates are an integration-test example, not a default user location.
- Live Observations uses `GET /api/observations/earthquakes?hours=24&minMagnitude=0` and `GET /api/observations/hazards?hours=24`. The earthquake view can call USGS directly after an ArkGrid 404; GDACS is server-proxied because its feed does not allow direct browser CORS requests. Deploy the API containing `server/routes/observationRoutes.js` to enable GDACS alerts. Open-Meteo weather points load only after a user selects a location.
- Flood Risk monitoring uses authenticated `POST /api/risk/monitor` with `{ "lat": 12.9716, "lng": 77.5946, "radiusKm": 3, "grid": 14 }`. It returns separate Open-Meteo, GDACS, and ArkGrid field-report status, source timestamps, precipitation sample points, and report/event markers. Run it alongside the optional authenticated `POST /api/risk` ML assessment; either can work when the other service is unavailable. Deploy the updated API for this route. The example coordinates are only for testing, not a default user location.
- API server: `NODE_ENV=production node server.js` behind HTTPS (the app sets `trust proxy`). Set `CLIENT_URL` to the real origin.
- ML service: `uvicorn main:app --host 0.0.0.0 --port 8000` on a **private network**, always with `ML_API_KEY`. Set the API's `ML_SERVICE_URL` to this reachable service and use the same `ML_API_KEY` on both services. Persist `flood_risk/artifacts` or let it retrain on start.
- Open-Meteo's free tier is non-commercial. Use a commercial plan or self-host for funded deployments. OSRM demo servers are not for production.
- Storage may require a paid Firebase plan. Without it, reports still work and photos are skipped.

## Troubleshooting

Run `npm run doctor` first. For an ML service offline error, start the local API with
`cd ml-service && uvicorn main:app --host 0.0.0.0 --port 8000`, check `GET /health`, and
confirm the API's `ML_SERVICE_URL` reaches that service. In deployments, `localhost` points
to the API container itself; configure the ML service URL and matching `ML_API_KEY` explicitly.
Other common issues: ML key mismatch (401), missing service account key, GPS blocked (needs
HTTPS or localhost), Storage bucket name copied wrongly.

For Live Observations, if `/api/observations/hazards` returns `404`, deploy or restart the Node
API containing `server/routes/observationRoutes.js`. The page reports GDACS as unavailable in
that case; it does not fetch GDACS directly because that provider does not permit browser CORS.
USGS earthquakes have a direct-feed fallback on this 404 only.

For Flood Risk monitoring, if `POST /api/risk/monitor` returns `404`, deploy or restart the Node
API containing `server/routes/riskRoutes.js`. It requires the same Firebase ID-token authentication
as the existing risk API. An unavailable source or `UNKNOWN` result identifies a provider or
coverage gap; it does not fall back to zero rainfall. The separate ML assessment needs the Python
service and can fail without suppressing live monitoring. Open-Meteo precipitation is weather-model
output; no rain-gauge or locally validated flood threshold is applied.

For Heat Wave Tracking, the frontend sends `lat`, `lng`, and `radiusKm` to
`/api/weather/heat-grid` using the build-time `VITE_API_URL`. The Vite configuration has no API
proxy, so local development must point `VITE_API_URL` directly at `http://localhost:5000`, while a
production build must point it at the deployed HTTPS API origin. If `/api/health` works but
`/api/weather/heat-grid` returns `404`, the running API deployment is older than the source: deploy
or restart the Node API containing `server/routes/weatherRoutes.js`, then retry. A `502` means the
ArkGrid API could not retrieve/parse Open-Meteo data; check the API server logs for the
`[weather] Open-Meteo forecast request failed` diagnostic. Invalid or missing coordinates return
`400`. The API permits browser origins configured in `CLIENT_URL`, localhost, and Vercel origins.

Registered facilities remain available to command-dashboard and logistics views, and Disaster
History uses registered shelters for optional route comparisons. `/api/shelters` and
`/api/shelters/nearby` require a signed-in Firebase ID token; an unauthenticated request should
return `401 Missing auth token`. The API reads registered facilities from Firestore's `shelters`
collection. Nearby searches may also query OpenStreetMap, but an Overpass failure is reported as
a partial-source warning and does not prevent registered facilities from being returned. The
dedicated Shelters & Hospitals page has been removed; its old citizen and command routes redirect
to their respective landing pages.

## Attribution

Copernicus DEM GLO-90 and weather data via Open-Meteo.com · © OpenStreetMap contributors · © CARTO · OSRM.
