# Sejuk Sejuk Service — Operations System

A simplified internal operations system for a fictional aircon service company, built for
the Programmer Assessment (Operations System + AI Challenge). Covers the full workflow:

**Order → Assignment → Service Completion → Manager/Accounts Review**, plus an AI
assistant that answers operational questions from live system data.

## What Was Built

All modules from the assessment were implemented:

- **Module 1 — Admin Portal**: create orders, assign a technician, view all orders.
- **Module 2 — Technician Portal**: mobile-first job list, start job, complete job with
  up to 6 file uploads, auto-calculated final amount, optional payment capture.
- **Module 3 — WhatsApp Notification Trigger**: on job completion, a "Notify Customer"
  button opens a `wa.me` deep link pre-filled with the completion message.
- **Manager Review Queue**: review `Job Done` orders and close them, with inline
  **AI Workflow Supervisor** flags (final amount much higher than quoted; job done with
  no photos uploaded).
- **Real authentication (bonus)**: Supabase Auth (email/password) instead of a mock role
  switch, with role-scoped Row Level Security enforced in Postgres, not just the UI.
- **Bonus — KPI Dashboard**: jobs completed, total amount, and a leaderboard/chart per
  technician, with a 7/30-day range toggle.
- **AI Module — Operations Query Window**: a chat-style assistant in the Manager view
  that answers the three example question types using controlled, parameterized Supabase
  queries — never a raw/unrestricted database query — with DeepSeek used only to phrase
  the final sentence from the retrieved rows.

Every status change and technician assignment is written to an `audit_log` table for
traceability, per the assessment's basic system rules.

## Tech Stack

| Layer | Tool |
|---|---|
| Front-end | React 19 + TypeScript + Vite |
| Styling | Tailwind CSS v4 |
| Routing | React Router |
| Backend/DB | Supabase (Postgres + Row Level Security) |
| File storage | Supabase Storage (`job-attachments` bucket) |
| AI | DeepSeek (`deepseek-chat`, OpenAI-compatible API) |
| Serverless function | Vercel Node function (`api/ai-query.ts`) |
| Auth | Supabase Auth (email/password) — real login, role-scoped RLS |
| Deployment | Vercel |

## Architecture Decisions

- **Real authentication with role-scoped RLS**: the assessment explicitly says a mock
  role switch is *sufficient*, but real Supabase Auth was implemented as the documented
  bonus. `profiles` (`user_id, role, name`) extends `auth.users` with app-specific data;
  `technicians.user_id` links each technician row to their own account. `AuthContext`
  tracks the real Supabase session via `onAuthStateChange` and loads `role`/`name`/
  (for technicians) their linked `technicianId` once signed in — `RequireRole` gates
  routes against that instead of a `localStorage` value.
- **Access control lives in Postgres RLS, not just the UI.** Two SQL helper functions,
  `auth_role()` and `auth_technician_id()`, are called from every policy: admins/managers
  see and manage everything; a technician can only see/update orders (and insert
  completions/attachments for orders) assigned to them. This means even a compromised or
  buggy client can't read or write data outside what the signed-in user is allowed —
  the check isn't just "does the button render," it's enforced at the database.
- **No self-service role assignment.** `profiles` has a `SELECT` policy (read your own
  row) and deliberately no `INSERT`/`UPDATE`/`DELETE` policy for regular users — the only
  way to create or change a profile is a service-role action (dashboard or
  `scripts/seedUsers.mjs`), so no logged-in user can ever grant themselves Admin.
- **Status transitions as a small pure helper, not DB constraints**
  (`src/lib/orderStatus.ts`): `New → Assigned → In Progress → Job Done → Reviewed →
  Closed`. The *sequence* is enforced in the UI/mutation layer rather than a Postgres
  state machine; RLS enforces *who* can update a given order, not which status values
  are reachable from which.
- **AI query classification is deterministic, not LLM-driven**
  (`server/aiQueryCore.ts`): the question is matched against a small set of regex
  patterns to pick one of three supported query shapes and a date range, which are then
  run as ordinary parameterized Supabase queries. DeepSeek is only called *after* the
  data is retrieved, purely to phrase the final sentence — it never decides what to
  query or sees the whole database. If the DeepSeek call fails or no key is configured,
  the endpoint falls back to a template-formatted answer built directly from the
  retrieved rows, so the feature degrades gracefully instead of breaking.
- **Server code lives outside `src/`** (`server/`, `api/`): `src/` is compiled under a
  browser-oriented `tsconfig` (DOM lib, no Node types). AI-query logic needs
  `process.env` and runs server-side only, so it's a sibling top-level folder with its
  own `tsconfig.server.json`, imported by both `api/ai-query.ts` (the real Vercel
  function) and a small Vite dev-server middleware (`vite.config.ts`) that reuses the
  exact same function during `npm run dev`, so the AI module is testable locally without
  `vercel dev`.

## AI Query Types Supported

1. "How many jobs were completed **today / this week / last week**?"
2. "Which technician completed the **most jobs** (this week / last week)?"
3. "What jobs did **technician \<name\>** complete (today / this week / last week)?"
   (name must be one of the seeded technicians: Ali, John, Bala, Yusoff)

If a question doesn't match any of these three shapes, the assistant returns a fixed
message explaining what it can answer and suggests a rephrase — it does not attempt a
best-effort guess against the database.

`api/ai-query.ts` requires a real signed-in session: the client sends the caller's
Supabase access token, the endpoint validates it and checks their `profiles.role` is
`manager` (401 if not signed in, 403 if signed in but not a manager) *before* running
any query — every underlying Supabase call then runs as that authenticated user, so RLS
scopes the data the same way it would for any other request they made.

"This week" / "last week" are implemented as rolling 7-day windows (last 7 days / the
7 days before that), not calendar weeks — simpler and avoids timezone-boundary edge
cases, but won't match a strict Monday-start week if that's expected.

## Limitations

- No public sign-up — accounts are provisioned up front (dashboard or
  `scripts/seedUsers.mjs`), which is intentional for an internal tool with a fixed,
  known set of staff, but means adding a new technician later is a manual step, not a
  self-serve flow.
- Row-level status *sequencing* (e.g. a technician can't skip straight to `Closed`) is
  still enforced only in the UI/mutation layer, not a Postgres state machine — RLS
  enforces *who* can write to a row, not which status transitions are valid.
- AI query classification only recognizes the three documented question shapes; it does
  not handle multi-part questions, ambiguous phrasing, or technicians outside the
  seeded list.
- "Postpone / Reschedule" is listed as an example KPI metric in the assessment but isn't
  modeled anywhere in this system (no reschedule concept exists), so the dashboard shows
  it as "not tracked" rather than fabricating a number.
- The `job-attachments` Storage bucket is marked "public" at the bucket level (so
  `<img>`/download links work directly), but read/write through the API requires a real
  signed-in session — it isn't scoped further to "only the assigned technician can read
  their own job's attachments," which would be the natural next tightening.
- No automated tests.

## Local Setup

1. `npm install`
2. Create a Supabase project, then run [`supabase/schema.sql`](supabase/schema.sql) in
   its SQL Editor (creates tables, RLS policies/helper functions, seeds technicians,
   creates the `job-attachments` storage bucket).
3. Copy `.env.local.example` to `.env.local` and fill in:
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — from Supabase project settings
   - `DEEPSEEK_API_KEY` — from platform.deepseek.com (optional; without it, the AI
     module falls back to template-formatted answers instead of DeepSeek-phrased ones)
4. Provision the real accounts (Admin, Manager, and one per technician):
   - Easiest: get your **service_role** key from Project Settings → API, add it to
     `.env.local` as `SUPABASE_SERVICE_ROLE_KEY` (never `VITE_`-prefixed — it must never
     reach the browser), then run `node scripts/seedUsers.mjs`. It creates all 6
     accounts with random passwords (printed once to the console — save them), their
     `profiles` rows, and links each technician to their account. Safe to re-run.
   - Or manually: create the 6 users in Authentication → Users, then insert matching
     `profiles` rows and set `technicians.user_id` yourself via the Table Editor.
5. `npm run dev` — the AI query endpoint works locally too, via a Vite dev middleware
   that mirrors `api/ai-query.ts`.

## Deployment

Push to a Git repo and import into Vercel, or run `vercel`. Set the same three env vars
in the Vercel project's Environment Variables settings. `api/ai-query.ts` is
auto-detected as a serverless function; `vercel.json` rewrites all non-`/api` paths to
`index.html` for client-side routing.

## Self-Assessment

- **Easiest module**: Module 1 (Admin Portal) — a standard form-to-database flow with
  no unusual constraints.
- **Hardest part**: keeping the AI module's data access genuinely constrained rather
  than just prompting an LLM to "be careful" — the design that made this straightforward
  was moving query *selection* out of the LLM entirely (regex classification →
  parameterized query → LLM only formats already-retrieved rows).
- **What I'd improve for production**: a proper state machine enforced in Postgres (or
  at least a DB trigger) for status *sequencing*, instead of only in the client — RLS
  now covers *who* can write, but not *which transition*; per-attachment storage
  scoping instead of "any signed-in user"; a self-serve (but admin-approved) way to add
  technicians instead of a manual seed script; and replacing the regex-based AI query
  classifier with a small tool-calling setup (LLM picks from a fixed set of typed query
  functions) so more question phrasings are understood without expanding the regex list
  by hand.
- **AI tool usage while building**: built interactively with Claude Code, which wrote
  the schema, components, and serverless function from the assessment spec.
