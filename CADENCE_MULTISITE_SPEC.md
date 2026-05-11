# Cadence — Multi-Site Migration Spec

## Overview

Cadence currently operates as a single-site app for Stepan Millsdale. This spec converts it to a multi-site (multi-tenant) application where each Stepan facility has its own areas, inspection types, requirements, cycles, and recipients. Users can belong to one or more sites with different roles at each.

**CRITICAL: You have full access to Supabase via the connected MCP server. Execute all SQL directly — create tables, alter existing tables, update RLS policies, migrate data. Do not generate SQL for the developer to run manually.**

**IMPORTANT: Run `npm run build` before committing to catch TypeScript errors.**

---

## New Tables

### sites

```sql
CREATE TABLE sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,                    -- e.g., "Stepan Millsdale"
  location TEXT,                         -- e.g., "Millsdale, IL"
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE sites ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can see active sites (needed for site picker)
CREATE POLICY "Authenticated users can view sites"
  ON sites FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Super admins can manage sites
CREATE POLICY "Super admins can manage sites"
  ON sites FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_sites
    WHERE user_sites.profile_id = auth.uid()
    AND user_sites.role = 'super_admin'
  ));

GRANT ALL ON sites TO authenticated;
GRANT ALL ON sites TO service_role;
```

### user_sites

Replaces the `role` column on `profiles`. Each row grants a user a specific role at a specific site.

```sql
CREATE TABLE user_sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'inspector' CHECK (role IN ('super_admin', 'site_admin', 'inspector')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(profile_id, site_id)
);

ALTER TABLE user_sites ENABLE ROW LEVEL SECURITY;

-- Users can see their own site memberships
CREATE POLICY "Users can view own memberships"
  ON user_sites FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid());

-- Super admins can see all memberships
CREATE POLICY "Super admins can view all memberships"
  ON user_sites FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_sites us
    WHERE us.profile_id = auth.uid()
    AND us.role = 'super_admin'
  ));

-- Site admins can see memberships for their sites
CREATE POLICY "Site admins can view site memberships"
  ON user_sites FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_sites us
    WHERE us.profile_id = auth.uid()
    AND us.site_id = user_sites.site_id
    AND us.role IN ('super_admin', 'site_admin')
  ));

-- Super admins can manage all memberships
CREATE POLICY "Super admins can manage memberships"
  ON user_sites FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_sites us
    WHERE us.profile_id = auth.uid()
    AND us.role = 'super_admin'
  ));

-- Site admins can add/edit users at their sites (but not super_admin role)
CREATE POLICY "Site admins can manage site memberships"
  ON user_sites FOR INSERT
  TO authenticated
  WITH CHECK (
    role != 'super_admin'
    AND EXISTS (
      SELECT 1 FROM user_sites us
      WHERE us.profile_id = auth.uid()
      AND us.site_id = user_sites.site_id
      AND us.role IN ('super_admin', 'site_admin')
    )
  );

CREATE POLICY "Site admins can update site memberships"
  ON user_sites FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_sites us
      WHERE us.profile_id = auth.uid()
      AND us.site_id = user_sites.site_id
      AND us.role IN ('super_admin', 'site_admin')
    )
  );

GRANT ALL ON user_sites TO authenticated;
GRANT ALL ON user_sites TO service_role;
```

---

## Altered Tables — Add site_id

Add a `site_id` foreign key to these existing tables. Each must reference `sites(id)`.

### areas
```sql
ALTER TABLE areas ADD COLUMN site_id UUID REFERENCES sites(id) ON DELETE CASCADE;
-- After migration, make NOT NULL:
-- ALTER TABLE areas ALTER COLUMN site_id SET NOT NULL;
```

### inspection_types
```sql
ALTER TABLE inspection_types ADD COLUMN site_id UUID REFERENCES sites(id) ON DELETE CASCADE;
-- After migration, make NOT NULL:
-- ALTER TABLE inspection_types ALTER COLUMN site_id SET NOT NULL;
```

### inspection_cycles
```sql
ALTER TABLE inspection_cycles ADD COLUMN site_id UUID REFERENCES sites(id) ON DELETE CASCADE;
-- After migration, make NOT NULL:
-- ALTER TABLE inspection_cycles ALTER COLUMN site_id SET NOT NULL;
```

### recipients
```sql
ALTER TABLE recipients ADD COLUMN site_id UUID REFERENCES sites(id) ON DELETE CASCADE;
-- After migration, make NOT NULL:
-- ALTER TABLE recipients ALTER COLUMN site_id SET NOT NULL;
```

**Note:** `area_requirements`, `area_requirement_owners`, `inspection_tasks`, and `documents` do NOT need `site_id` — they inherit site scope through their parent references (areas → site, cycles → site).

---

## Data Migration

Migrate all existing data to a "Stepan Millsdale" site. Execute in this order:

```sql
-- 1. Create the Millsdale site
INSERT INTO sites (id, name, location)
VALUES (gen_random_uuid(), 'Stepan Millsdale', 'Millsdale, IL')
RETURNING id;
-- Save this ID as MILLSDALE_SITE_ID for the following statements

-- 2. Assign site_id to existing areas
UPDATE areas SET site_id = '<MILLSDALE_SITE_ID>';
ALTER TABLE areas ALTER COLUMN site_id SET NOT NULL;

-- 3. Assign site_id to existing inspection_types
UPDATE inspection_types SET site_id = '<MILLSDALE_SITE_ID>';
ALTER TABLE inspection_types ALTER COLUMN site_id SET NOT NULL;

-- 4. Assign site_id to existing inspection_cycles
UPDATE inspection_cycles SET site_id = '<MILLSDALE_SITE_ID>';
ALTER TABLE inspection_cycles ALTER COLUMN site_id SET NOT NULL;

-- 5. Assign site_id to existing recipients (if any)
UPDATE recipients SET site_id = '<MILLSDALE_SITE_ID>' WHERE site_id IS NULL;
ALTER TABLE recipients ALTER COLUMN site_id SET NOT NULL;

-- 6. Migrate user roles to user_sites
-- For each existing user in profiles, create a user_sites row for Millsdale
INSERT INTO user_sites (profile_id, site_id, role)
SELECT id, '<MILLSDALE_SITE_ID>',
  CASE
    WHEN role = 'admin' THEN 'super_admin'  -- existing admins become super_admin
    ELSE 'inspector'
  END
FROM profiles
WHERE is_active = true;

-- 7. Drop the role column from profiles (no longer needed)
ALTER TABLE profiles DROP COLUMN role;
```

---

## Updated RLS Policies

All existing RLS policies that reference `profiles.role` must be updated to check `user_sites` instead. All data-access policies must be scoped to the user's site memberships.

### Pattern for site-scoped read access:
```sql
-- Users can view rows for sites they belong to
CREATE POLICY "Users can view [table] for their sites"
  ON [table] FOR SELECT
  TO authenticated
  USING (
    site_id IN (
      SELECT site_id FROM user_sites
      WHERE profile_id = auth.uid() AND is_active = true
    )
  );
```

### Pattern for site-scoped admin write access:
```sql
-- Site admins and super admins can manage rows for their sites
CREATE POLICY "Admins can manage [table] for their sites"
  ON [table] FOR ALL
  TO authenticated
  USING (
    site_id IN (
      SELECT site_id FROM user_sites
      WHERE profile_id = auth.uid()
      AND role IN ('super_admin', 'site_admin')
      AND is_active = true
    )
  );
```

Apply these patterns to: `areas`, `inspection_types`, `inspection_cycles`, `recipients`.

For `area_requirements`, `inspection_tasks`, `documents`, and `area_requirement_owners` — join through the parent table to check site scope:

```sql
-- Example for area_requirements (scoped through areas.site_id)
CREATE POLICY "Users can view requirements for their sites"
  ON area_requirements FOR SELECT
  TO authenticated
  USING (
    area_id IN (
      SELECT a.id FROM areas a
      WHERE a.site_id IN (
        SELECT site_id FROM user_sites
        WHERE profile_id = auth.uid() AND is_active = true
      )
    )
  );
```

**Drop ALL existing RLS policies first, then recreate them with site-scoped versions.** Do not leave old policies in place — they will conflict.

---

## Auto-Seed Inspection Types on New Site Creation

When a new site is created, automatically populate it with the standard inspection types.

```sql
CREATE OR REPLACE FUNCTION seed_inspection_types_for_site()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO inspection_types (name, abbreviation, description, sort_order, site_id) VALUES
    ('Audio/Visual/Olfactory', 'AVO', 'Audio, visual, and olfactory inspections', 1, NEW.id),
    ('Visible Emissions Observation', 'VEO', 'Visible emissions observations (opacity readings)', 2, NEW.id),
    ('Open-Ended Lines', 'OEL', 'Open-ended line inspections', 3, NEW.id),
    ('Baghouse', 'Baghouse', 'Baghouse/fabric filter inspections', 4, NEW.id),
    ('Cooling Tower Samples', 'CT Samples', 'Cooling tower chromium sampling', 5, NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_site_created
  AFTER INSERT ON sites
  FOR EACH ROW EXECUTE FUNCTION seed_inspection_types_for_site();
```

**Note:** This trigger should NOT fire for the initial Millsdale migration (Millsdale already has its inspection types). Create the trigger AFTER the migration is complete.

---

## UI Changes

### Site Context

Site selection is stored in the URL path or as a query parameter/cookie. Recommended approach: **cookie-based site context** with a site switcher in the sidebar.

- Store selected `site_id` in a cookie (`cadence-site-id`)
- All server components and server actions read this cookie to scope queries
- Create a helper: `getCurrentSiteId()` that reads the cookie and validates the user has access to that site

### Login → Site Picker Flow

After successful authentication:

1. Query `user_sites` for the authenticated user
2. If user belongs to **one site** → auto-select it, set cookie, redirect to `/dashboard`
3. If user belongs to **multiple sites** → show a site picker page (`/select-site`)
4. If user belongs to **zero sites** → show a "no access" message

### Site Picker Page (`/select-site`)

- Grid/list of sites the user belongs to
- Each card shows: site name, location, user's role at that site
- Click to select → sets cookie → redirects to `/dashboard`

### Site Switcher in Sidebar

- Below the Cadence logo/name in the sidebar header
- Dropdown showing the current site name
- Click to see other sites the user belongs to
- Selecting a different site updates the cookie and refreshes the page

### Updated Sidebar Navigation

**All users see:**
- 🏠 Dashboard
- 📋 History

**Site admins and super admins also see:**
- ✅ Review
- ⚙️ Admin section:
  - 📍 Areas
  - 🔗 Requirements
  - 📧 Recipients
  - 👥 Users

**Super admins also see:**
- 🏢 Sites (manage all sites — create new sites, edit site details)

### Admin → Users Page Updates

Site admins can:
- View all users at their current site
- **Invite new user:** Enter email + full name + role (inspector or site_admin). If the email doesn't exist in `auth.users`, create the account with a temporary password and add them to the current site. If the email already exists (user at another site), just add them to the current site with the specified role.
- Edit user roles at the current site
- Deactivate users at the current site

Super admins can additionally:
- Assign super_admin role
- View/manage users across all sites

### Admin → Sites Page (Super Admin Only)

- List all sites with name, location, active status
- Create new site (triggers auto-seed of inspection types)
- Edit site name/location
- Deactivate site

---

## Updated Queries

Every database query in the application must be scoped to the current site. Examples:

### Dashboard query (current cycle for current site):
```typescript
const siteId = getCurrentSiteId();

const { data: cycle } = await supabase
  .from('inspection_cycles')
  .select('*')
  .eq('site_id', siteId)
  .eq('status', 'active')
  .single();
```

### Areas query:
```typescript
const { data: areas } = await supabase
  .from('areas')
  .select('*')
  .eq('site_id', siteId)
  .eq('is_active', true)
  .order('sort_order');
```

### Inspection types query:
```typescript
const { data: types } = await supabase
  .from('inspection_types')
  .select('*')
  .eq('site_id', siteId)
  .eq('is_active', true)
  .order('sort_order');
```

Apply this pattern to ALL existing queries throughout the application.

---

## Updated pg_cron Jobs

The `create_weekly_cycle` function must now create cycles for ALL active sites:

```sql
CREATE OR REPLACE FUNCTION create_weekly_cycle()
RETURNS void AS $$
DECLARE
  site RECORD;
  cycle_id UUID;
  sunday_date DATE;
  saturday_date DATE;
BEGIN
  -- Calculate this Sunday
  sunday_date := date_trunc('week', CURRENT_DATE + INTERVAL '1 day')::date - INTERVAL '1 day';
  IF EXTRACT(DOW FROM CURRENT_DATE) = 0 THEN
    sunday_date := CURRENT_DATE;
  END IF;
  saturday_date := sunday_date + INTERVAL '6 days';

  -- Create cycles for each active site
  FOR site IN SELECT id FROM sites WHERE is_active = true LOOP
    -- Skip if cycle already exists for this site/week
    IF EXISTS (
      SELECT 1 FROM inspection_cycles
      WHERE week_start = sunday_date AND site_id = site.id
    ) THEN
      CONTINUE;
    END IF;

    -- Create the cycle for this site
    INSERT INTO inspection_cycles (week_start, week_end, site_id)
    VALUES (sunday_date, saturday_date, site.id)
    RETURNING id INTO cycle_id;

    -- Generate tasks from this site's active requirements
    INSERT INTO inspection_tasks (cycle_id, area_requirement_id)
    SELECT cycle_id, ar.id
    FROM area_requirements ar
    JOIN areas a ON ar.area_id = a.id
    JOIN inspection_types it ON ar.inspection_type_id = it.id
    WHERE ar.is_active = true
      AND a.is_active = true
      AND it.is_active = true
      AND a.site_id = site.id;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Nudge and Summary Emails

The `send-nudge` and `send-summary` Edge Functions must also loop through all active sites, generating separate emails per site. Each site's summary email goes to that site's recipients only.

---

## Updated Email Templates

### Summary email subject:
```
Cadence — Weekly Inspection Status for {site_name} — Week of {week_start} – {week_end}
```

### Nudge email subject:
```
Cadence — Outstanding Inspections at {site_name} for Week of {week_start}
```

---

## Helper Functions to Create

### `getCurrentSiteId()`
```typescript
// src/lib/site-context.ts
import { cookies } from 'next/headers';

export async function getCurrentSiteId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get('cadence-site-id')?.value || null;
}

export async function setCurrentSiteId(siteId: string) {
  const cookieStore = await cookies();
  cookieStore.set('cadence-site-id', siteId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365, // 1 year
    path: '/',
  });
}
```

### `getUserSiteRole()`
```typescript
// src/lib/site-context.ts
export async function getUserSiteRole(
  supabase: SupabaseClient,
  userId: string,
  siteId: string
): Promise<'super_admin' | 'site_admin' | 'inspector' | null> {
  const { data } = await supabase
    .from('user_sites')
    .select('role')
    .eq('profile_id', userId)
    .eq('site_id', siteId)
    .eq('is_active', true)
    .single();
  return data?.role || null;
}
```

### `requireSiteAdmin()`
```typescript
// src/lib/admin-guard.ts — update existing
export async function requireSiteAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const siteId = await getCurrentSiteId();
  if (!siteId) redirect('/select-site');

  const role = await getUserSiteRole(supabase, user.id, siteId);
  if (!role || role === 'inspector') redirect('/dashboard');

  return { user, siteId, role };
}
```

---

## Execution Order

1. Create the `sites` table
2. Create the `user_sites` table
3. Add `site_id` columns to areas, inspection_types, inspection_cycles, recipients (nullable at first)
4. Run the data migration (create Millsdale site, assign all existing data)
5. Make `site_id` columns NOT NULL
6. Drop `role` column from profiles
7. Drop all old RLS policies
8. Create all new site-scoped RLS policies
9. Create the auto-seed trigger for new sites
10. Update the `create_weekly_cycle` function
11. Build the site picker page and site context helpers
12. Add site switcher to sidebar
13. Update ALL existing queries to scope by site
14. Update the admin/users page with invite functionality
15. Add admin/sites page for super admins
16. Update the platform layout to require site selection
17. Run `npm run build` to verify zero errors
18. Commit and push

---

*Cadence Multi-Site Spec v1.0 — Proactive Environmental Services*
