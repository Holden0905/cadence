⚠️ HISTORICAL — This was the original build spec. For current project guidance, see CLAUDE.md in the project root.

# Cadence — Architecture Specification

## Overview

**Cadence** is a weekly environmental inspection tracking and compliance workflow application built for Stepan Company's Millsdale, IL facility. It replaces a manual process where an environmental engineer (Mo Khatib) collects weekly inspection documents from various plant areas, tracks their completion in a spreadsheet, and emails a summary matrix to ~25 stakeholders every Thursday.

Cadence automates the entire workflow: auto-generating weekly inspection cycles, assigning tasks to responsible owners, accepting document uploads (including clipboard paste for screenshots), sending automated reminder and summary emails, and providing an admin review/approval interface.

This is a standalone application, separate from the Argus air compliance registry, but shares the same visual identity and tech stack conventions.

---

## Tech Stack

- **Framework:** Next.js 15 (App Router, TypeScript)
- **Database / Auth / Storage:** Supabase (free tier)
- **UI:** shadcn/ui + Tailwind CSS v4
- **Fonts:** Geist Sans / Geist Mono
- **Deployment:** Netlify
- **Email Service:** Resend (free tier — 100 emails/day)
- **Automation:** Supabase pg_cron + pg_net → Edge Functions

---

## Conventions (CRITICAL — Follow These Exactly)

1. You have full access to Supabase via the connected Supabase MCP server. **Run all SQL directly** — create tables, RLS policies, triggers, seed data, enable extensions, create storage buckets, schedule pg_cron jobs. The developer will not be running anything manually in the dashboard. Never use `npx supabase db push` or migrations via CLI — use the MCP connection instead.
2. RLS policies are **always generated alongside new tables** — no table ships without RLS.
3. Run `npm run build` locally before every git push to catch TypeScript errors that Turbopack misses in dev mode.
4. Git commits happen after each logical feature completion, not at arbitrary points.
5. When working on a specific feature: **do not modify any other files** outside the scope of that feature.
6. All new files use TypeScript (`.ts` / `.tsx`).
7. Single-file components where practical. No premature abstraction.

---

## Authentication

**Method:** Magic Link (passwordless email login via Supabase Auth)

- User enters their email on the login page
- Supabase sends a one-time magic link to their email
- User clicks the link and is authenticated
- Session persists via refresh tokens (configurable, default ~7 days)
- Users who open the app regularly will rarely see the login screen after initial auth

**Roles:**
- `admin` — Can manage areas, requirements, recipients, review/approve inspections, and view all data
- `inspector` — Can view the dashboard, see their assigned tasks, and upload documents

**Auth redirect flow:**
- Unauthenticated users → `/login`
- Authenticated users → `/dashboard`
- Magic link callback → `/auth/callback` (handles token exchange, redirects to `/dashboard`)

---

## Database Schema

All tables use `gen_random_uuid()` for primary keys and `now()` for timestamp defaults. All timestamps are `timestamptz`.

### profiles

Synced from `auth.users` via a trigger on signup.

```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'inspector' CHECK (role IN ('admin', 'inspector')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read profiles
CREATE POLICY "Authenticated users can view profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (true);

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid());

-- Admins can update any profile
CREATE POLICY "Admins can update any profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Trigger: auto-create profile on auth.users insert
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
```

### areas

The plant areas where inspections occur.

```sql
CREATE TABLE areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE areas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view active areas"
  ON areas FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage areas"
  ON areas FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
```

### inspection_types

The types of inspections performed (AVO, VEO, OEL, Baghouse, CT Samples).

```sql
CREATE TABLE inspection_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  abbreviation TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE inspection_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view inspection types"
  ON inspection_types FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage inspection types"
  ON inspection_types FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
```

### area_requirements

The applicability matrix — which areas require which inspection types. This is the source of truth for auto-generating weekly tasks.

```sql
CREATE TABLE area_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id UUID NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
  inspection_type_id UUID NOT NULL REFERENCES inspection_types(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(area_id, inspection_type_id)
);

-- RLS
ALTER TABLE area_requirements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view requirements"
  ON area_requirements FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage requirements"
  ON area_requirements FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
```

### area_requirement_owners

Junction table supporting multiple owners (primary + backup) per requirement.

```sql
CREATE TABLE area_requirement_owners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area_requirement_id UUID NOT NULL REFERENCES area_requirements(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  owner_role TEXT NOT NULL DEFAULT 'primary' CHECK (owner_role IN ('primary', 'backup')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(area_requirement_id, profile_id)
);

-- RLS
ALTER TABLE area_requirement_owners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view owners"
  ON area_requirement_owners FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage owners"
  ON area_requirement_owners FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
```

### inspection_cycles

One row per week. Auto-created by pg_cron every Sunday. Compliance cycle runs Sunday–Saturday.

```sql
CREATE TABLE inspection_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start DATE NOT NULL,  -- Always a Sunday
  week_end DATE NOT NULL,    -- Always the following Saturday
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  UNIQUE(week_start)
);

-- RLS
ALTER TABLE inspection_cycles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view cycles"
  ON inspection_cycles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage cycles"
  ON inspection_cycles FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
```

### inspection_tasks

Individual tasks auto-generated from `area_requirements` when a cycle is created. One task per active requirement per week.

```sql
CREATE TABLE inspection_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID NOT NULL REFERENCES inspection_cycles(id) ON DELETE CASCADE,
  area_requirement_id UUID NOT NULL REFERENCES area_requirements(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'approved')),
  submitted_by UUID REFERENCES profiles(id),
  submitted_at TIMESTAMPTZ,
  approved_by UUID REFERENCES profiles(id),
  approved_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(cycle_id, area_requirement_id)
);

-- RLS
ALTER TABLE inspection_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view tasks"
  ON inspection_tasks FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can update tasks"
  ON inspection_tasks FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage tasks"
  ON inspection_tasks FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
```

### documents

File references for uploaded inspection documents, stored in Supabase Storage.

```sql
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES inspection_tasks(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT,
  file_size BIGINT,
  uploaded_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view documents"
  ON documents FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert documents"
  ON documents FOR INSERT
  TO authenticated
  WITH CHECK (uploaded_by = auth.uid());

CREATE POLICY "Admins can manage documents"
  ON documents FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
```

### recipients

The email distribution list for the weekly summary email. These are NOT necessarily app users — they may be stakeholders who just receive the report.

```sql
CREATE TABLE recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  full_name TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(email)
);

-- RLS
ALTER TABLE recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage recipients"
  ON recipients FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can view recipients"
  ON recipients FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
```

---

## Supabase Storage

**Bucket:** `inspection-documents`
- Public: **No** (private bucket, accessed via signed URLs)
- File size limit: 10MB
- Allowed MIME types: `image/png`, `image/jpeg`, `image/gif`, `image/webp`, `application/pdf`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`

**Path pattern:** `{cycle_id}/{task_id}/{timestamp}_{filename}`

**Storage RLS policies:**
```sql
-- Authenticated users can upload to inspection-documents
CREATE POLICY "Authenticated users can upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'inspection-documents');

-- Authenticated users can view documents
CREATE POLICY "Authenticated users can read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'inspection-documents');

-- Admins can delete documents
CREATE POLICY "Admins can delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'inspection-documents'
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
```

---

## Automated Jobs

### 1. Create Weekly Cycle (Sunday 6:00 AM CT)

pg_cron job that creates a new `inspection_cycles` row and generates `inspection_tasks` from all active `area_requirements`.

```sql
-- Enable extensions (run once in SQL editor)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Function to create weekly cycle
CREATE OR REPLACE FUNCTION create_weekly_cycle()
RETURNS void AS $$
DECLARE
  cycle_id UUID;
  sunday_date DATE;
  saturday_date DATE;
BEGIN
  -- Calculate this Sunday (today if Sunday, otherwise next Sunday)
  sunday_date := date_trunc('week', CURRENT_DATE + INTERVAL '1 day')::date - INTERVAL '1 day';
  -- If today is Sunday, use today
  IF EXTRACT(DOW FROM CURRENT_DATE) = 0 THEN
    sunday_date := CURRENT_DATE;
  END IF;
  saturday_date := sunday_date + INTERVAL '6 days';

  -- Check if cycle already exists for this week
  IF EXISTS (SELECT 1 FROM inspection_cycles WHERE week_start = sunday_date) THEN
    RETURN;
  END IF;

  -- Create the cycle
  INSERT INTO inspection_cycles (week_start, week_end)
  VALUES (sunday_date, saturday_date)
  RETURNING id INTO cycle_id;

  -- Generate tasks from active requirements
  INSERT INTO inspection_tasks (cycle_id, area_requirement_id)
  SELECT cycle_id, ar.id
  FROM area_requirements ar
  JOIN areas a ON ar.area_id = a.id
  JOIN inspection_types it ON ar.inspection_type_id = it.id
  WHERE ar.is_active = true
    AND a.is_active = true
    AND it.is_active = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schedule: every Sunday at 6:00 AM CT (11:00 UTC during CDT, 12:00 UTC during CST)
SELECT cron.schedule(
  'create-weekly-cycle',
  '0 11 * * 0',  -- 11:00 UTC = 6:00 AM CDT
  $$SELECT create_weekly_cycle()$$
);
```

### 2. Wednesday Nudge Email (Wednesday 9:00 AM CT)

Calls a Supabase Edge Function that queries pending tasks for the active cycle and sends reminder emails to their owners.

```sql
-- Schedule nudge email Edge Function
SELECT cron.schedule(
  'send-nudge-emails',
  '0 14 * * 3',  -- 14:00 UTC = 9:00 AM CDT (Wednesday)
  $$SELECT net.http_post(
    url := '<SUPABASE_PROJECT_URL>/functions/v1/send-nudge',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <SUPABASE_SERVICE_ROLE_KEY>',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  )$$
);
```

### 3. Thursday Summary Email (Thursday 2:00 PM CT)

Calls a Supabase Edge Function that generates the weekly summary matrix and sends it to all active recipients.

```sql
SELECT cron.schedule(
  'send-weekly-summary',
  '0 19 * * 4',  -- 19:00 UTC = 2:00 PM CDT (Thursday)
  $$SELECT net.http_post(
    url := '<SUPABASE_PROJECT_URL>/functions/v1/send-summary',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <SUPABASE_SERVICE_ROLE_KEY>',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  )$$
);
```

---

## Edge Functions

### send-nudge

**Trigger:** pg_cron every Wednesday 9:00 AM CT

**Logic:**
1. Query the active cycle (status = 'active')
2. Find all `inspection_tasks` with status = 'pending'
3. For each pending task, look up the primary and backup owners via `area_requirement_owners`
4. Group pending tasks by owner email
5. Send one email per owner listing all their outstanding tasks
6. Primary owners are in TO, backup owners are CC'd
7. Email includes a direct link to the app dashboard

**Email content (plain text + HTML):**
```
Subject: Cadence — Outstanding Inspections for Week of {week_start}

Hi {owner_name},

The following inspections are still pending for the week of {week_start}:

- {area_name} — {inspection_type_name}
- {area_name} — {inspection_type_name}

Please upload your inspection documents at: {app_url}/dashboard

Thanks,
Cadence Automated System
```

### send-summary

**Trigger:** pg_cron every Thursday 2:00 PM CT

**Logic:**
1. Query the active cycle
2. Build the full matrix: all areas × applicable inspection types with task statuses
3. Render an HTML email that looks like Mo's original table but with color-coded status:
   - ✓ Green cell = approved
   - ⏳ Yellow cell = submitted, pending review
   - ✗ Red cell = not yet submitted
   - Gray cell = N/A (no requirement exists)
4. Include a summary line: "X of Y inspections complete"
5. Send to all active recipients

**Email content:**
```
Subject: Cadence — Weekly Inspection Status for Week of {week_start} – {week_end}

All,

This week's environmental inspection status is below. {X} of {Y} inspections have been completed.

[RENDERED HTML TABLE MATCHING DASHBOARD MATRIX]

— Cadence Automated System
Stepan Company — Millsdale, IL
```

### Email Integration (Resend)

Create a Resend account and add the API key as a Supabase Edge Function secret:

```bash
supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxxx
```

Both Edge Functions use a shared email utility:

```typescript
// Shared email helper used by Edge Functions
const sendEmail = async (to: string[], subject: string, html: string, cc?: string[]) => {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Cadence <cadence@yourdomain.com>',  // Replace with verified domain
      to,
      cc,
      subject,
      html,
    }),
  });
  return res.json();
};
```

**Note:** Resend requires a verified domain for the `from` address. During development, use `onboarding@resend.dev` as the from address (Resend's sandbox). For production, verify a domain like `cadence.proactiveenv.com` or similar.

---

## UI Architecture

### Route Structure

```
src/app/
├── (auth)/
│   ├── layout.tsx            # Minimal centered layout for auth pages
│   ├── login/
│   │   └── page.tsx          # Magic link login form
│   └── auth/
│       └── callback/
│           └── route.ts      # Handles magic link token exchange
├── (platform)/
│   ├── layout.tsx            # Sidebar + header layout (same pattern as Argus)
│   ├── dashboard/
│   │   └── page.tsx          # Main inspection matrix dashboard
│   ├── review/
│   │   └── page.tsx          # Admin: review & approve submitted inspections
│   ├── history/
│   │   └── page.tsx          # View past completed cycles
│   └── admin/
│       ├── areas/
│       │   └── page.tsx      # Manage areas (CRUD, activate/deactivate)
│       ├── requirements/
│       │   └── page.tsx      # Manage applicability matrix + assign owners
│       ├── recipients/
│       │   └── page.tsx      # Manage email distribution list
│       └── users/
│           └── page.tsx      # Manage user profiles and roles
├── globals.css
├── layout.tsx                # Root layout (fonts, metadata)
└── page.tsx                  # Redirect to /dashboard or /login
```

### Page Specifications

#### Login Page (`/login`)

- Clean centered card layout with Cadence logo
- Single input: email address
- "Send Magic Link" button
- Success state: "Check your email for a login link"
- Error handling for invalid email

#### Dashboard (`/dashboard`)

This is the heart of the app — a live version of Mo's weekly matrix.

**Header section:**
- Current cycle: "Week of May 4, 2026 — May 10, 2026"
- Progress indicator: "14 of 18 inspections complete" with a progress bar
- Days remaining in cycle
- Status badge: "Active" / "Completed"

**Matrix table:**
- Rows = active areas (sorted by `sort_order`)
- Columns = active inspection types (sorted by `sort_order`)
- Cell states:
  - **Green check (✓)** = task approved
  - **Yellow clock (⏳)** = task submitted, pending admin review
  - **Red X (✗)** = task pending, no document uploaded yet
  - **Gray dash (—)** = N/A, no requirement exists for this area/type combo
- Clicking a **pending (red)** cell opens an upload modal for that task
- Clicking a **submitted (yellow)** cell shows the uploaded document preview
- Clicking an **approved (green)** cell shows the approved document

**Upload Modal:**
- Triggered by clicking a pending cell or via a direct upload button
- **Clipboard paste support:** Listen for `paste` event on the modal/upload zone. When user does Ctrl+V (after a Win+Shift+S screenshot), capture the image blob from `clipboardData.items`, convert to File, and upload.
- **Drag and drop zone:** Standard HTML5 drag/drop with visual feedback
- **File picker button:** Accepts images (PNG, JPG, WebP), PDFs, DOCX
- Shows a preview of the uploaded file before submission
- "Submit" button → sets task status to `submitted`, records `submitted_by` and `submitted_at`
- Multiple documents can be attached to a single task

#### Review Page (`/review`) — Admin Only

**Purpose:** Let Mo (or any admin) quickly review and approve submitted inspections.

**Layout:**
- Filter/view options: current cycle only (default), or select a specific cycle
- List of all tasks with status = `submitted` for the selected cycle
- Each item shows:
  - Area name + inspection type
  - Submitted by (name) + timestamp
  - Thumbnail preview of the uploaded document(s)
  - Click thumbnail to view full-size in a lightbox/modal
  - Individual "Approve" button per task

**Bulk approve:**
- Checkbox on each submitted task row
- "Select All Submitted" button at the top
- "Bulk Approve ({n} selected)" button
- Confirmation dialog: "Approve {n} inspections?"
- On confirm: updates all selected tasks to `approved`, sets `approved_by` and `approved_at`

#### History Page (`/history`)

- List of past completed cycles, most recent first
- Click a cycle to see its matrix (same layout as dashboard, read-only)
- Shows completion stats and approval timestamps

#### Admin: Areas (`/admin/areas`)

- Table listing all areas with: name, sort order, active status
- Add new area (inline form or modal)
- Edit area name, sort order
- Toggle active/inactive (soft delete — deactivated areas won't generate new tasks but historical data is preserved)

#### Admin: Requirements (`/admin/requirements`)

- Matrix/grid view showing areas × inspection types
- Toggle cells on/off to define which inspections apply to which areas
- For each active requirement: assign primary and backup owners from a dropdown of active profiles
- Visual indicator of current owner assignments

#### Admin: Recipients (`/admin/recipients`)

- Table of all recipients with: name, email, active status
- Add / edit / deactivate recipients
- These are email-only contacts — they don't need app accounts

#### Admin: Users (`/admin/users`)

- Table of all profiles with: name, email, role, active status
- Change user roles (admin/inspector)
- Deactivate users

---

## Branding & Styling

### CSS Custom Properties

Copy the following color system directly from Argus. Drop this into `globals.css`:

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";

@custom-variant dark (&:is(.dark *));

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
  --color-sidebar-ring: var(--sidebar-ring);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar: var(--sidebar);
  --color-chart-5: var(--chart-5);
  --color-chart-4: var(--chart-4);
  --color-chart-3: var(--chart-3);
  --color-chart-2: var(--chart-2);
  --color-chart-1: var(--chart-1);
  --color-ring: var(--ring);
  --color-input: var(--input);
  --color-border: var(--border);
  --color-destructive: var(--destructive);
  --color-accent-foreground: var(--accent-foreground);
  --color-accent: var(--accent);
  --color-muted-foreground: var(--muted-foreground);
  --color-muted: var(--muted);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-secondary: var(--secondary);
  --color-primary-foreground: var(--primary-foreground);
  --color-primary: var(--primary);
  --color-popover-foreground: var(--popover-foreground);
  --color-popover: var(--popover);
  --color-card-foreground: var(--card-foreground);
  --color-card: var(--card);
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
  --radius-2xl: calc(var(--radius) + 8px);
  --radius-3xl: calc(var(--radius) + 12px);
  --radius-4xl: calc(var(--radius) + 16px);
}

:root {
  --radius: 0.625rem;
  --background: oklch(1 0 0);
  --foreground: oklch(0.13 0.028 261.692);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.13 0.028 261.692);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.13 0.028 261.692);
  --primary: oklch(0.21 0.034 264.665);
  --primary-foreground: oklch(0.985 0.002 247.839);
  --secondary: oklch(0.967 0.003 264.542);
  --secondary-foreground: oklch(0.21 0.034 264.665);
  --muted: oklch(0.967 0.003 264.542);
  --muted-foreground: oklch(0.551 0.027 264.364);
  --accent: oklch(0.967 0.003 264.542);
  --accent-foreground: oklch(0.21 0.034 264.665);
  --destructive: oklch(0.577 0.245 27.325);
  --border: oklch(0.928 0.006 264.531);
  --input: oklch(0.928 0.006 264.531);
  --ring: oklch(0.707 0.022 261.325);
  --chart-1: oklch(0.646 0.222 41.116);
  --chart-2: oklch(0.6 0.118 184.704);
  --chart-3: oklch(0.398 0.07 227.392);
  --chart-4: oklch(0.828 0.189 84.429);
  --chart-5: oklch(0.769 0.188 70.08);
  --sidebar: oklch(0.985 0.002 247.839);
  --sidebar-foreground: oklch(0.13 0.028 261.692);
  --sidebar-primary: oklch(0.21 0.034 264.665);
  --sidebar-primary-foreground: oklch(0.985 0.002 247.839);
  --sidebar-accent: oklch(0.967 0.003 264.542);
  --sidebar-accent-foreground: oklch(0.21 0.034 264.665);
  --sidebar-border: oklch(0.928 0.006 264.531);
  --sidebar-ring: oklch(0.707 0.022 261.325);
}

.dark {
  --background: oklch(0.13 0.028 261.692);
  --foreground: oklch(0.985 0.002 247.839);
  --card: oklch(0.21 0.034 264.665);
  --card-foreground: oklch(0.985 0.002 247.839);
  --popover: oklch(0.21 0.034 264.665);
  --popover-foreground: oklch(0.985 0.002 247.839);
  --primary: oklch(0.928 0.006 264.531);
  --primary-foreground: oklch(0.21 0.034 264.665);
  --secondary: oklch(0.278 0.033 256.848);
  --secondary-foreground: oklch(0.985 0.002 247.839);
  --muted: oklch(0.278 0.033 256.848);
  --muted-foreground: oklch(0.707 0.022 261.325);
  --accent: oklch(0.278 0.033 256.848);
  --accent-foreground: oklch(0.985 0.002 247.839);
  --destructive: oklch(0.704 0.191 22.216);
  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 15%);
  --ring: oklch(0.551 0.027 264.364);
  --chart-1: oklch(0.488 0.243 264.376);
  --chart-2: oklch(0.696 0.17 162.48);
  --chart-3: oklch(0.769 0.188 70.08);
  --chart-4: oklch(0.627 0.265 303.9);
  --chart-5: oklch(0.645 0.246 16.439);
  --sidebar: oklch(0.21 0.034 264.665);
  --sidebar-foreground: oklch(0.985 0.002 247.839);
  --sidebar-primary: oklch(0.488 0.243 264.376);
  --sidebar-primary-foreground: oklch(0.985 0.002 247.839);
  --sidebar-accent: oklch(0.278 0.033 256.848);
  --sidebar-accent-foreground: oklch(0.985 0.002 247.839);
  --sidebar-border: oklch(1 0 0 / 10%);
  --sidebar-ring: oklch(0.551 0.027 264.364);
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
    background-color: #f4f5f7;
  }
}

.dark body {
  background-color: var(--background);
}
```

### Additional Branding

- **App name:** Cadence
- **Logo:** Place the provided PNG at `/public/cadence-logo.png`. Use it in the sidebar header and login page.
- **Fonts:** Geist Sans (body) and Geist Mono (code/data), loaded via `next/font/local` — same as Argus.
- **Favicon:** Generate from the logo or use a simple "C" mark.

---

## Seed Data

Run this after all tables are created to populate the initial areas, inspection types, and applicability matrix.

```sql
-- ============================================
-- SEED DATA: Inspection Types
-- ============================================
INSERT INTO inspection_types (name, abbreviation, description, sort_order) VALUES
  ('Audio/Visual/Olfactory', 'AVO', 'Audio, visual, and olfactory inspections', 1),
  ('Visible Emissions Observation', 'VEO', 'Visible emissions observations (opacity readings)', 2),
  ('Open-Ended Lines', 'OEL', 'Open-ended line inspections', 3),
  ('Baghouse', 'Baghouse', 'Baghouse/fabric filter inspections', 4),
  ('Cooling Tower Samples', 'CT Samples', 'Cooling tower chromium sampling', 5);

-- ============================================
-- SEED DATA: Areas
-- ============================================
INSERT INTO areas (name, sort_order) VALUES
  ('Area 1 PA & Polyol', 1),
  ('Area 2 E Unit Sulfination', 2),
  ('Area 2 F Bldg Batch', 3),
  ('Area 2 F Bldg VN', 4),
  ('Area 2 F Bldg DRS', 5),
  ('Area 2 Hydrotropes', 6),
  ('Area 34 EO', 7),
  ('Area 34 Quats', 8),
  ('Area 34 A4', 9),
  ('Area 34 Amides', 10),
  ('Area 34 M-Blends DRS', 11),
  ('Area 34 Drum Dry', 12),
  ('Area 34 DRS Drum Out', 13),
  ('PTD & VN PTD', 14),
  ('Utilities', 15);

-- ============================================
-- SEED DATA: Applicability Matrix (area_requirements)
-- Run AFTER the above inserts so we can reference by name
-- ============================================
INSERT INTO area_requirements (area_id, inspection_type_id)
SELECT a.id, it.id
FROM areas a
CROSS JOIN inspection_types it
WHERE
  -- Area 1 PA & Polyol: AVO, VEO, OEL, Baghouse
  (a.name = 'Area 1 PA & Polyol' AND it.abbreviation IN ('AVO', 'VEO', 'OEL', 'Baghouse'))
  -- Area 2 E Unit Sulfination: AVO, VEO
  OR (a.name = 'Area 2 E Unit Sulfination' AND it.abbreviation IN ('AVO', 'VEO'))
  -- Area 2 F Bldg Batch: AVO, VEO
  OR (a.name = 'Area 2 F Bldg Batch' AND it.abbreviation IN ('AVO', 'VEO'))
  -- Area 2 F Bldg VN: AVO
  OR (a.name = 'Area 2 F Bldg VN' AND it.abbreviation IN ('AVO'))
  -- Area 2 F Bldg DRS: AVO
  OR (a.name = 'Area 2 F Bldg DRS' AND it.abbreviation IN ('AVO'))
  -- Area 2 Hydrotropes: AVO
  OR (a.name = 'Area 2 Hydrotropes' AND it.abbreviation IN ('AVO'))
  -- Area 34 EO: AVO, VEO, OEL
  OR (a.name = 'Area 34 EO' AND it.abbreviation IN ('AVO', 'VEO', 'OEL'))
  -- Area 34 Quats: VEO
  OR (a.name = 'Area 34 Quats' AND it.abbreviation IN ('VEO'))
  -- Area 34 A4: AVO, VEO, OEL
  OR (a.name = 'Area 34 A4' AND it.abbreviation IN ('AVO', 'VEO', 'OEL'))
  -- Area 34 Amides: AVO, VEO
  OR (a.name = 'Area 34 Amides' AND it.abbreviation IN ('AVO', 'VEO'))
  -- Area 34 M-Blends DRS: AVO
  OR (a.name = 'Area 34 M-Blends DRS' AND it.abbreviation IN ('AVO'))
  -- Area 34 Drum Dry: VEO, Baghouse
  OR (a.name = 'Area 34 Drum Dry' AND it.abbreviation IN ('VEO', 'Baghouse'))
  -- Area 34 DRS Drum Out: AVO
  OR (a.name = 'Area 34 DRS Drum Out' AND it.abbreviation IN ('AVO'))
  -- PTD & VN PTD: AVO, VEO
  OR (a.name = 'PTD & VN PTD' AND it.abbreviation IN ('AVO', 'VEO'))
  -- Utilities: CT Samples
  OR (a.name = 'Utilities' AND it.abbreviation IN ('CT Samples'));
```

---

## Supabase Client Setup

### File: `src/utils/supabase/client.ts`
```typescript
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

### File: `src/utils/supabase/server.ts`
```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server Component — ignore
          }
        },
      },
    }
  )
}
```

### File: `src/utils/supabase/middleware.ts`
```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Redirect unauthenticated users to login (except auth routes)
  if (
    !user &&
    !request.nextUrl.pathname.startsWith('/login') &&
    !request.nextUrl.pathname.startsWith('/auth')
  ) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
```

### File: `src/middleware.ts`
```typescript
import { type NextRequest } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

---

## Environment Variables

### `.env.local` (Next.js app)
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Supabase Edge Function Secrets
```bash
supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxxx
supabase secrets set APP_URL=https://cadence.yourdomain.com
```

The `SUPABASE_SERVICE_ROLE_KEY` is automatically available in Edge Functions as `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')`.

---

## Sidebar Navigation

The sidebar follows the same component pattern as Argus (`Sidebar.tsx`).

**All users see:**
- 🏠 Dashboard (`/dashboard`)
- 📋 History (`/history`)

**Admin users also see:**
- ✅ Review (`/review`)
- ⚙️ Admin section header
  - 📍 Areas (`/admin/areas`)
  - 🔗 Requirements (`/admin/requirements`)
  - 📧 Recipients (`/admin/recipients`)
  - 👥 Users (`/admin/users`)

**Sidebar footer:**
- User name + email
- Logout button

---

## Initial Setup Checklist for Claude Code

When Claude Code receives this spec, execute in this order:

1. **Scaffold the project:**
   ```bash
   cd ~/cadence
   npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
   ```

2. **Install dependencies:**
   ```bash
   npm install @supabase/supabase-js @supabase/ssr
   npx shadcn@latest init
   ```
   When prompted by shadcn init, select: New York style, Slate color, CSS variables: yes.

3. **Install shadcn components:**
   ```bash
   npx shadcn@latest add button card dialog dropdown-menu input label select separator table tabs badge sheet skeleton switch form toast checkbox
   ```

4. **Set up file structure** — create all directories and files per the route structure above.

5. **Set up Supabase client files** — `client.ts`, `server.ts`, `middleware.ts` as specified above.

6. **Set up middleware** for auth redirect.

7. **Replace `globals.css`** with the Cadence branding CSS (copied from Argus, specified above).

8. **Build the login page** with magic link flow.

9. **Build the sidebar layout** with role-based nav.

10. **Build the dashboard** with the inspection matrix.

11. **Build the upload modal** with clipboard paste, drag-drop, and file picker.

12. **Build the review page** with individual + bulk approve.

13. **Build admin pages** (areas, requirements, recipients, users).

14. **Build the history page.**

15. **Run `npm run build`** to verify zero TypeScript errors before committing.

16. **Commit:** `git init && git add . && git commit -m "Initial Cadence scaffold with full UI and auth"`

---

## Schema Setup Note

You have full access to Supabase via the connected MCP server. **Execute all SQL directly** — table creation, RLS policies, triggers, seed data, pg_cron schedules, storage bucket creation, extension enablement. Do not generate SQL for the developer to run manually. You are responsible for the complete database setup as part of the build process.

Run the schema setup BEFORE building the UI components so the app has real tables to query against from the start.

For Edge Functions (send-nudge, send-summary): generate the Edge Function code files and deploy them via the Supabase MCP or CLI as appropriate.

---

*Cadence v0.1 — Designed by Brian Jones & Claude | Proactive Environmental Services*
