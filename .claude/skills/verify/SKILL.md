---
name: verify
description: Build, launch, and drive the Risk_v2 client to verify changes end-to-end.
---

# Verifying Risk_v2 client changes

## Build / launch
- Client lives in `v2 Risk/client` (Vite + React). `npm install`, then `npm run dev` (port 5173). `npm run build` is plain `vite build` — no type-check in CI; `npx tsc -b` has ~41 pre-existing errors (unused vars, missing `three` types in Antigravity.tsx), so error-count deltas matter, not zero.
- The real backend (`v2 Risk/server`, port 3001) needs Supabase env vars. For client verification, stub it with a plain node http server implementing the routes in `server/index.js` (`POST /api/start|respond|complete`, `GET /api/user/:email/assessments`, etc.) **with CORS headers**. On localhost the client targets `http://localhost:3001` (see `API_URL` in `src/App.tsx`).

## Driving the app (Playwright, chromium at /opt/pw-browsers/chromium)
- Onboarding form: `input[placeholder="Jane Smith"]`, `input[placeholder="Acme Corporation"]`, `input[type=email]`, check both `input.ip-checkbox[required]`, submit the form button.
- Assessment is ~80 slider questions (`input[type=range]`). Auto-advance fires on `mouseup`: set value via the native value setter + dispatch `input`, then `dispatchEvent('mouseup')`. **Vary values** — 80%+ identical answers triggers the straight-lining retest screen instead of results.
- Results dashboard is reached when "Risk Assessment Dashboard" text appears. Alternatively seed `localStorage.risk_assessment_session` with `{step:'results', metadata, result}` to skip the assessment.
- Desktop viewport needed for topbar buttons: `.db-btn-hide` buttons (Plan, History) are hidden ≤768px.

## Gotchas
- Google Fonts imports fail in the sandboxed browser (ERR_CONNECTION_RESET) — harmless noise.
