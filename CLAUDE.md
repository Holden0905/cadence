@AGENTS.md
# CLAUDE.md — Cadence

This file gives Claude Code context about the Cadence project. Read it fully before making any changes.

---

## Most Important Rules

1. **Never run SQL directly against the database.** Write all SQL (schema changes, migrations, data fixes, new tables, altered policies) and present it to Brian for review. Brian runs it manually via the Supabase dashboard SQL editor. This includes MCP — do not execute SQL through the Supabase MCP connection.
2. **This is a compliance application.** Inspection records, approval timestamps, and document associations are regulatory evidence. Never delete, overwrite, or fabricate data. Soft deletes only (`is_active = false`). No placeholder data in production.
3. **When uncertain, ask first.** If a task is ambiguous, could affect production data, or touches auth/middleware/layout, stop and ask Brian before proceeding. Don't guess.
4. **Run `npm run lint && npm run build` before every commit.** Turbopack's dev server is more lenient than production TypeScript. If either command fails, fix the errors before committing.
5. **Do not modify files outside the scope of the current feature.** If you're building the zip download feature, don't refactor the sidebar while you're in there.

---

## What Cadence Is

Cadence is an automated weekly environmental inspection tracking system built for Stepan Company's Millsdale, IL facility. It replaces a manual process where Mo Khatib (Environmental Engineer — Air) collected weekly inspection documents from plant areas, tracked completion in a spreadsheet, and emailed a summary matrix to ~25 stakeholders every Thursday. Cadence auto-generates weekly inspection cycles, assigns tasks to responsible owners, accepts document uploads, sends automated reminder and summary emails, and provides admin review/approval workflows.

**Risk level: High.** This is a production application used by a client (Stepan Company) for environmental compliance tracking. Real inspection data is in the database. Errors in this system affect regulatory compliance records.

---

## People

| Person | Email | Role | Notes |
|---|---|---|---|
| Brian Jones | brianjones@pesldar.com | PES Operations Manager, developer, super_admin | Built Cadence. Final authority on all technical decisions. |
| Alex Thompson | athompson@pesldar.com | PES, beta tester, super_admin | Extensive QA testing. |
| Michael Schmidt | mschmidt@stepan.com | Stepan environmental leadership | Brian is helping Mike position himself to oversee air compliance across multiple Stepan sites. |
| Mo Khatib | mo.khatib@stepan.com | Environmental Engineer — Air | The person whose manual workflow Cadence replaces. Would be site_admin in production. |
| Daniel Conrad | — | PES IT | Manages DNS for pesldar.com. Contact for SPF/DKIM changes. |

---

## Stack

| Layer | Technology | Notes |
|---|---|---|
| Framework | Next.js 16 (App Router, TypeScript, Turbopack) | |
| Styling | Tailwind CSS v4, shadcn/ui | |
| Fonts | Geist Sans / Geist Mono | |
| Database / Auth / Storage | Supabase (PostgreSQL, RLS, Storage) | Project ref: `cnxumopwxzryfxyqmrwu` |
| Hosting | Vercel | Auto-deploys on push to main |
| Email | Resend | Verified domain: pesldar.com, from: cadence@pesldar.com |
| Cron | Vercel Cron (vercel.json) + pg_cron/pg_net (Supabase-side) | |
| Source Control | GitHub | https://github.com/Holden0905/cadence |
| Package manager | npm | |

---

## Environments

| Environment | URL | Supabase Project |
|---|---|---|
| Production | https://cadence-woad-two.vercel.app | cnxumopwxzryfxyqmrwu |
| Local | http://localhost:3000 | Same Supabase project (no staging DB) |

**Note:** There is no staging environment. The production Supabase database is used for both local dev and production. This is why database changes require Brian's review.

---

## Database Rules

**Autonomy level: Locked down.**

Claude Code does NOT run any SQL directly. For all database work:

1. Write the complete SQL (CREATE TABLE, ALTER, GRANT, RLS policies, triggers, seed data)
2. Present it to Brian in a clearly labeled block
3. Brian reviews and runs it via the Supabase dashboard SQL editor
4. Brian confirms it ran successfully before Claude Code writes any dependent UI code

**Never use `npx supabase db push` or any Supabase CLI migration commands.**

### Supabase GRANTs — Breaking Change (Effective May 30, 2026)

Supabase no longer auto-grants table access to API roles. Every new table must include explicit GRANT statements or it will return `42501 permission denied` from `supabase-js`.

**Order of operations for every new table:**

```sql
-- 1. Create the table
CREATE TABLE public.new_table ( ... );

-- 2. Grant access to roles (BEFORE RLS)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.new_table TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.new_table TO service_role;

-- 3. Enable RLS
ALTER TABLE public.new_table ENABLE ROW LEVEL SECURITY;

-- 4. Create RLS policies
CREATE POLICY "..." ON public.new_table ...;
```

**Grant patterns by use case:**
- **Authenticated CRUD (most Cadence tables):** GRANT SELECT, INSERT, UPDATE, DELETE to `authenticated` and `service_role`
- **Read-only reference table:** GRANT SELECT to `authenticated`, full CRUD to `service_role`
- **Service-only (no client access):** GRANT only to `service_role`
- **Sequences:** If using SERIAL/BIGSERIAL, also GRANT USAGE, SELECT on the sequence

**Diagnosing missing grants:** Error code `42501` with message "permission denied for table X" — run the GRANT statement shown in the error hint.

### Other Database Conventions

- **Soft deletes only.** Deactivate records with `is_active = false`. Never hard delete business entities.
- **ON DELETE RESTRICT, not CASCADE** for business entities with historical data (area_requirements, profiles, etc.). CASCADE destroyed history early in the project.
- **Both USING and WITH CHECK clauses** on RLS policies. USING controls SELECT/DELETE. WITH CHECK controls INSERT/UPDATE. Missing WITH CHECK causes silent insert failures.
- **RLS uses user_sites lookup, never current_role().** `current_role()` returns the Postgres role, not the app role.
- **SECURITY DEFINER functions need explicit EXECUTE grants.** Revoking from PUBLIC can strip implicit grants.
- **Input validation at two layers.** UI prevents bad input. Database rejects it if it gets through (CHECK constraints, NOT NULL, UNIQUE).
- **Seed data runs immediately after schema creation.** Verify data exists before building UI that depends on it.
- **Run schema before UI.** Execute and verify all SQL before building components that query those tables.

---

## File Structure

```
src/
├── app/
│   ├── (auth)/              # Login, signup, forgot-password, update-password, select-site
│   ├── (platform)/          # Authenticated app (dashboard, history, review, admin/*)
│   ├── api/cron/            # Vercel cron endpoints (create-cycle, send-nudge, send-summary)
│   └── auth/callback/       # OAuth/magic link callback
├── components/              # All UI components (inspection-matrix, sidebar, admin panels, etc.)
├── lib/
│   ├── email/               # Resend helpers (send-summary, send-nudges, send-temp-password)
│   │   └── resend-client.ts # Resend instance + sleep() throttle helper
│   ├── site-context.ts      # Site cookie management, role helpers
│   ├── admin-guard.ts       # Auth + role guards for admin pages
│   ├── temp-password.ts     # Temp password generation (Cadence-XXXX-XXXX-XXXX format)
│   ├── validation.ts        # Email validation helpers
│   └── types.ts             # Shared TypeScript types
├── utils/supabase/          # Supabase client (browser, server, middleware)
└── middleware.ts             # Auth redirect middleware
```

---

## User Roles

Roles are assigned per-site via the `user_sites` junction table. A user can have different roles at different sites.

| Role | Dashboard | History | Review | Admin Pages | Upload | Approve | Manage Sites |
|---|---|---|---|---|---|---|---|
| super_admin | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| site_admin | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| inspector | ✓ | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ |
| viewer | ✓ (read-only) | ✓ (read-only) | ✗ | ✗ | ✗ | ✗ | ✗ |

**Controlled vocabulary:** Role strings must match exactly: `'super_admin'`, `'site_admin'`, `'inspector'`, `'viewer'`.

---

## Key Tables

| Table | Purpose | Gotchas |
|---|---|---|
| profiles | Synced from auth.users via trigger. Has `must_change_password` boolean. | Never insert directly — the trigger handles creation on signup. |
| sites | Multi-site support. Currently one: "Stepan Millsdale". | |
| user_sites | Junction: user + site + role. This is how roles work. | Role is per-site, not global. |
| areas | Plant areas (15 active + 1 test area). | Soft delete only. Sort order matters for display. |
| inspection_types | AVO, VEO, OEL, Baghouse, CT Samples. Per-site, auto-seeded on new site creation. | |
| area_requirements | Applicability matrix — which areas need which inspection types. | FK to areas and inspection_types uses ON DELETE RESTRICT. |
| area_requirement_owners | Primary/backup owners per requirement. | When primary is removed, backup auto-promotes via trigger. |
| inspection_cycles | One row per week (Sunday–Saturday). Auto-created by pg_cron. | UNIQUE on week_start prevents duplicate cycles. |
| inspection_tasks | One task per requirement per cycle. Status: pending → submitted → approved. | Status is a controlled vocabulary string. |
| documents | File references in Supabase Storage, linked to tasks. | Currently one document → one task. Multi-task linking is on the roadmap. |
| recipients | Email distribution list for weekly summary. Separate from app users. | Not the same as user_sites — someone can get the email without having a login. |

---

## RLS Policy Pattern

Cadence uses site-scoped RLS via the `user_sites` junction table:

```sql
-- CORRECT — Cadence pattern
EXISTS (
  SELECT 1 FROM user_sites
  WHERE user_sites.profile_id = auth.uid()
  AND user_sites.site_id = target_table.site_id
  AND user_sites.role = ANY(ARRAY['super_admin', 'site_admin'])
)

-- WRONG — returns Postgres role, not app role
current_role() = 'admin'

-- WRONG — old single-site pattern, doesn't scope to site
EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
```

The helper function `is_site_writer(site_id)` returns true for non-viewer roles and simplifies write policies.

---

## TypeScript Conventions

**Supabase joined query types — single FK relations return objects, not arrays:**
```typescript
// CORRECT
type Task = { areas: { name: string } | null }
// Access: task.areas?.name

// WRONG
type Task = { areas: { name: string }[] }
```

**Date handling — never pass Supabase date strings through `new Date()`:**
```typescript
// CORRECT — parse as local date
const [year, month, day] = dateStr.split('-')
const date = new Date(Number(year), Number(month) - 1, Number(day))

// WRONG — causes off-by-one day errors from UTC offset
const date = new Date(dateStr)
```

**Controlled vocabulary strings that must match exactly:**
- Roles: `'super_admin'`, `'site_admin'`, `'inspector'`, `'viewer'`
- Task status: `'pending'`, `'submitted'`, `'approved'`
- Cycle status: `'active'`, `'completed'`, `'archived'`
- Owner role: `'primary'`, `'backup'`

**All new files use TypeScript** (`.ts` / `.tsx`). No JavaScript files.

---

## Styling Conventions

- **Primary color:** Deep navy/slate (oklch 0.21 0.034 264.665)
- **Brand accent:** Stepan red (#C8102E) — used for active toggles and interactive highlights
- **Background:** #f4f5f7
- **Logo:** Stepan "S" mark in red square (at `/public/cadence-logo.png`)
- **Full OKLCH variable system** in globals.css (copied from Argus)
- **WCAG AA compliance required** — all interactive controls must meet 4.5:1 contrast ratio minimum
- **Switch/toggle colors:** Stepan red (#C8102E) when checked, gray-500 when unchecked
- **Truncate long text in JavaScript, not CSS.** Radix/shadcn internal layouts override CSS truncation. Clip strings before rendering, preserve full value in `title` attribute.
- **Radix Select with custom triggers:** Always set `position="popper"` on SelectContent. Default `position="item-aligned"` fails with custom trigger content.
- **Error messages use error styling (red/warning). Success messages use success styling (green).** Never mix them.

---

## Multi-Site Architecture

Cadence is multi-tenant. Each site has its own areas, inspection types, requirements, cycles, tasks, and recipients.

- **Site context** is stored in a cookie (`cadence-site-id`) set at the select-site page after login
- **Every data query must be scoped to the current site** — never return data across sites
- **Site switcher** is available for users who belong to multiple sites
- **Users can have different roles at different sites** via the `user_sites` junction table
- **Crons and triggers process all active sites**, not just one — the Sunday cycle creation loops over every active site
- **Currently one active site:** Stepan Millsdale. The architecture is ready for additional sites.

---

## Scheduled Jobs

Three automated jobs run weekly. The Sunday job has dual redundancy (pg_cron primary + Vercel cron backup).

| Job | Schedule | Endpoint/Function | What It Does |
|---|---|---|---|
| Create weekly cycle | Sunday 6:00 AM CT | pg_cron `create_weekly_cycle()` + `/api/cron/create-cycle` | Creates inspection_cycles row + inspection_tasks for every active requirement at every active site |
| Send nudge emails | Wednesday 9:00 AM CT | `/api/cron/send-nudge` | Emails owners who still have pending tasks |
| Send summary emails | Thursday 2:00 PM CT | `/api/cron/send-summary` | Emails the full recipient list with the week's status matrix |

**Cron endpoints are protected by `CRON_SECRET`** — the request must include the secret or it returns 401.

**Idempotency:** The cycle creation function checks for an existing cycle with the same `week_start` before creating. Running it twice is safe.

**Cron schedules are defined in `vercel.json`.**

---

## Email

**Service:** Resend
**Verified domain:** pesldar.com
**From address:** cadence@pesldar.com
**DNS:** Daniel Conrad manages DNS for pesldar.com. SPF record includes `send.pesldar.com` for Resend deliverability.

### Conventions

- **Per-recipient sending.** Never batch multiple recipients in one Resend call. One bad address in a batch fails the entire send.
- **250ms throttle between sends.** Resend rate limit is 5 req/s. `RESEND_SEND_INTERVAL_MS = 250` in `resend-client.ts` with a `sleep(ms)` helper. First iteration sends immediately, subsequent iterations await the delay.
- **Individual error handling.** Each send is wrapped in try/catch — one failure doesn't block the others.
- **Resend sandbox limitation.** Can only send to the signup email until the domain is verified. Plan for this in testing.
- **Test buttons on dashboard** (super_admin only): "Send test nudge" and "Send test summary" for verifying email flows without waiting for cron.
- **All links in emails use `appBaseUrl()`** which reads `NEXT_PUBLIC_APP_URL` with a fallback chain.

---

## Authentication

**Primary method:** Email/password login
**Alternative:** Magic link (button on login page)
**Invite flow:** Temp password (Cadence-XXXX-XXXX-XXXX format) — avoids one-time links that corporate email scanners consume

### Key Conventions

- **Server actions for sign-in, not client-side auth.** Browser-side `signInWithPassword` creates a race condition where cookies aren't committed before `router.push()` fires.
- **Don't double-call `getUser()` in middleware AND layout.** Middleware validates via `getUser()`. Layout uses `getSession()` (local cookie read, no network call).
- **`must_change_password` flag** on profiles forces password change on first login after invite/reset.
- **RecoveryHashRedirector** in root layout catches Supabase recovery hashes (`#access_token=...&type=recovery`) on any page and routes to update-password. Hash fragments don't reach the server.
- **Middleware must exclude all public auth pages:** `/login`, `/signup`, `/forgot-password`, `/update-password`, `/auth/callback`, `/select-site`.

### Supabase Auth Config (Dashboard)

- **Site URL:** https://cadence-woad-two.vercel.app
- **Redirect URLs:** `http://localhost:3000/auth/callback`, `https://cadence-woad-two.vercel.app/auth/callback`, `https://cadence-woad-two.vercel.app/update-password`
- **Confirm email:** Disabled (enable before full production launch)

---

## Environment Variables

| Variable | Where | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel + .env.local | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel + .env.local | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel + .env.local | Supabase service role key (server-side only) |
| `NEXT_PUBLIC_APP_URL` | Vercel + .env.local | Base URL for email links |
| `RESEND_API_KEY` | Vercel + .env.local | Resend API key |
| `CRON_SECRET` | Vercel + .env.local | Protects cron endpoints from unauthorized access |

**`NEXT_PUBLIC_` vars are baked at build time.** If missing during build, the compiled code has an empty value until the next build.

**Vercel "Sensitive" vars hide values after saving.** The value IS saved — the placeholder on re-edit is a display behavior, not a bug. Don't re-enter thinking it was lost.

---

## Git Conventions

- **Claude Code commits.** Use conventional commit messages describing the change.
- **Brian pushes.** Claude Code never runs `git push`.
- **Commits happen after each logical feature completion**, not at arbitrary points.
- **Branch:** Work on `main` unless Brian says otherwise.

---

## Build & Deploy

Vercel auto-deploys on push to main. Before committing:

```bash
npm run lint
npm run build
# If either fails, fix errors before committing
```

**Turbopack dev mode is more lenient than production TypeScript.** Code that compiles in `next dev` may fail `next build`. Always build-check before committing.

---

## QA/QC Protocol

### Tier 1 — Per-Feature Testing (Continuous)

After completing each feature, run three passes before moving on:

**Pass 1 — Technical verification (does it function?)**
- Hit the endpoint or server action and verify the response
- Query the database to confirm records were created/updated correctly
- Confirm the UI renders the data correctly
- Verify joins, filters, and sorting return expected results

**Pass 2 — User perspective (can someone actually use it?)**
- Navigate to the page as a user would
- Test as a different role — confirm access controls work
- Check that labels, messages, and feedback are clear
- Verify error messages use error styling and success messages use success styling

**Pass 3 — Adversarial (what breaks?)**
- Submit empty forms
- Enter invalid data (negative numbers, special characters, very long strings)
- Click buttons twice rapidly
- Navigate away mid-operation
- Test with zero data — empty states should look correct
- Test state transitions at each boundary

### Tier 2 — Sprint QA (On Demand)

**Trigger:** Brian says "run QA," "sprint review," or "pre-deploy check."

When triggered:
1. Generate user stories for all features built since last QA pass
2. Execute every test step and record pass/fail
3. Produce a QA summary with pass/fail counts, specific failures, and regressions
4. The user story suite is cumulative — old stories persist, new features add new stories

**Do not run Tier 2 unprompted.**

---

## Feature Roadmap

Features requested by Stepan (Mike Schmidt & Mo Khatib) as of May 13, 2026 meeting. Build order TBD by Brian.

| Feature | Description | Complexity |
|---|---|---|
| Email sender name | Change Resend `from` display name to project owner (Mo Khatib) per site | Low |
| Rejection email | When admin rejects a submission, auto-email the requirement owner with a "please resubmit" message | Medium |
| Inspector-filtered dashboard | Inspectors see their assigned areas highlighted/prominent; others collapsed | Medium |
| Week zip download | Download all approved documents for a completed week as a zip file, with files named by area + inspection type + week date | Medium |
| One document → multiple tasks | Upload once, associate with multiple inspection tasks (requires `document_tasks` junction table, schema change) | High |
| Multi-file upload with assignment | Upload multiple files at once, assign each to one or more inspections | High |

---

## What to Ask Brian Before Doing

- Any SQL (this is locked down — all SQL goes through Brian)
- Changes to `middleware.ts` or the auth flow
- Changes to `globals.css` or the OKLCH color system
- Changes to the sidebar navigation structure
- Changes to `vercel.json` (cron schedules)
- Changes to RLS policies or database triggers
- Adding, removing, or renaming environment variables
- Any change to the email sending flow (templates, throttling, recipient logic)
- Adding new npm dependencies
- Anything that touches the `profiles` table or `handle_new_user()` trigger
- Anything you're not sure about — ask first

---

## When Things Go Wrong

If something breaks — accidental file deletion, a build failure, RLS that locked someone out, an email that fired incorrectly — the rule is:

**Stop. Don't try to self-correct. Tell Brian what happened. Wait for instructions.**

When reporting a problem, include:
- What was attempted (the original goal)
- What command or change was actually run
- What the actual outcome was
- What state the system is in right now

Do not run additional remediation commands until Brian confirms the next step.

---

*Cadence is built and maintained by Brian Jones at Proactive Environmental Services using an AI-assisted development workflow (Claude + Claude Code). The codebase prioritizes compliance accuracy and data integrity.*