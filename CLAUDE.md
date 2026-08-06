# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

The application lives in the **`v2 Risk/`** directory (note the space in the path — quote it in shell commands). It is a two-part app:

- `v2 Risk/client/` — Vite + React 19 + TypeScript single-page app (the entire UI is in `src/App.tsx`, ~3000 lines).
- `v2 Risk/server/` — Express (Node ≥18) API backed by Supabase (Postgres + Storage).

The Markdown/`.docx` files at the repo root (`ENHANCED_RISK_FRAMEWORK`, `IMPLEMENTATION_ROADMAP`, `ANALYSIS_QUESTIONS_AND_SCORING`, etc.) are design/spec documents for the risk framework, not code.

## Commands

Client (`cd "v2 Risk/client"`):
- `npm run dev` — Vite dev server on :5173
- `npm run build` — type-check + production build to `dist/`
- `npm run lint` — ESLint (flat config, `eslint.config.js`)
- `npm run preview` — serve the built `dist/`

Server (`cd "v2 Risk/server"`):
- `npm run dev` — `node --watch index.js`, listens on **:3001** (port is hard-coded in `index.js`, not read from `PORT`)
- `npm start` — `node index.js`

There is **no test suite and no test runner** configured in either package.

## What the app does

A risk-assessment tool: a user onboards (name/company/email + business `stage` and `vertical`), answers a randomized questionnaire across ~18 risk domains, and gets a scored dashboard. The full PDF report is a **paid** deliverable gated behind a Razorpay payment.

## Architecture — the parts that require reading multiple files

### Scoring is duplicated on client and server, and they are NOT identical
- **Client** `client/src/utils/riskEngine.js` — the source of truth for what the user sees. `QUESTION_POOL` holds ~200 questions; `generateUniqueAssessment` randomly samples per domain (weighted, ~80 questions/run) so every session differs. `calculateRiskScore` produces the dashboard. `DOMAINS` defines the 18 domains with `weight`, `tier`, and `conditional` flags (`ai_compliance` only if `uses_ai`, `climate` only if `physical_product`).
- **Server** `server/scoringEngine.js` + `server/questions.js` — a separate, *static* question list and a re-implementation of the scoring math. `/api/complete` computes its own `result` but **persists the client-sent `result` (`bodyResult`) when present**, falling back to the server-computed one. So the server score is essentially a backup; the client's is authoritative.
- If you change scoring rules or domain weights, **update both engines** or they will diverge silently.

### Assessment flow and API
`client/src/App.tsx` drives a `Step` state machine (`onboarding → assessment → results → retest`) and talks to the server via `API_URL` (from `VITE_API_URL`, else localhost:3001 in dev / same-origin in prod). Key endpoints in `server/index.js`:
- `POST /api/start` → creates an **in-memory** session (`sessions` object). These are wiped on every restart/redeploy, so `/api/complete` accepts `metadata`/`responses` in the body as a fallback.
- `POST /api/respond` — appends a single answer to the session (fire-and-forget from the client).
- `POST /api/complete` — validates, scores, upserts the `users` row, inserts the `assessments` row, and returns a short-lived HMAC `uploadToken`.
- `GET /api/user/:email`, `/api/user/:email/assessments`, `/api/assessment/:id`, `/api/user/:email/pdfs` — history/read.
- `GET /api/admin/assessments` — admin dump of all assessments; opened in the UI via `?admin=KEY`, guarded by `ADMIN_KEY` (constant-time compare, `x-admin-key` header preferred).

Client state (in-progress assessment, result snapshot, payment session) is persisted to `localStorage` so refreshes and the payment round-trip survive.

### Payment (Razorpay) is verified server-side, price is server-enforced
- `POST /api/razorpay/order` creates the order with a **server-fixed amount** (`RAZORPAY_AMOUNT`, in paise) and records an `order_id ↔ session_id` link in the `payment_sessions` table.
- The client hands off to an external **Payment Hub** (`VITE_PAYMENT_HUB_URL`, `?app_id=risk`); after checkout the browser is redirected to `GET /payment-status`, which **HMAC-verifies the Razorpay signature** (`order_id|payment_id` keyed with the secret), marks the session `paid`, and redirects back to the frontend with `?session=…&payment=success|failed`.
- `GET /api/session/:id/payment` is polled so a refresh can re-hydrate the paid flag.
- **Gating:** `/api/upload-pdf` refuses (402) unless the session is `paid`. The PDF report is the paid item.

### Storage & upload authorization
- `POST /api/upload-dashboard-image` is authorized by the short-lived `uploadToken` (HMAC via `APP_SECRET`, falls back to the Razorpay secret) — not by payment.
- Uploads go to Supabase Storage buckets `pdf-reports` and `dashboard-images`; filenames/paths are sanitized (`safeFilename`/`safeSegment`) and size-capped. PDFs are generated client-side in `client/src/utils/pdfGenerator.js` (jsPDF + html2canvas).

### Database
Supabase tables (`users`, `assessments`, `payment_sessions`, `pdf_reports`) and Storage buckets are defined by the `.sql` files in `server/`. `supabase_schema.sql` is the base schema; the others are incremental migrations (`add_result_json.sql`, `dashboard_image_setup.sql`, `payment_sessions_setup.sql`, `pdf_storage_setup.sql`) and RLS changes (`lock_down_rls.sql`, `fix_rls_policies.sql`). The server uses the **service-role key** (`SUPABASE_SERVICE_ROLE_KEY`, falling back to anon) so it can operate once RLS is locked down. The client's Supabase client (`client/src/supabaseClient.ts`) is used **only** for Google OAuth sign-in and is `null` if env vars are absent.

## Deployment
- **Frontend** deploys to **GitHub Pages** via `.github/workflows/deploy.yml` on push to `main`, built with `--base=/Risk_v2-/` (change if a custom domain is pointed at Pages) and a `404.html` SPA fallback. Note: `client/.env.production` points `VITE_API_URL` at a Render backend (`risk-v2.onrender.com`), so the Pages frontend calls the separately-hosted API.
- **Backend** is expected to run on Render (see `SUPABASE_SETUP.md`); `app.set('trust proxy', 1)` is set for correct rate-limit IPs behind the proxy.

## Configuration
- Server env: see `server/.env.example` — `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RAZORPAY_KEY_ID`/`_SECRET`/`_AMOUNT`, `APP_SECRET`, `ADMIN_KEY`, `ALLOWED_ORIGINS` (CORS allowlist), `FRONTEND_URL`.
- Client env (Vite, build-time): `VITE_API_URL`, `VITE_PAYMENT_HUB_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
