export type SiteRole = "super_admin" | "site_admin" | "inspector" | "viewer";

export type Site = {
  id: string;
  name: string;
  location: string | null;
  email_sender_name: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type UserSite = {
  id: string;
  profile_id: string;
  site_id: string;
  role: SiteRole;
  is_active: boolean;
  created_at: string;
};

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  is_active: boolean;
  must_change_password: boolean;
  created_at: string;
  updated_at: string;
};

export type Area = {
  id: string;
  site_id: string;
  name: string;
  area_group: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type InspectionType = {
  id: string;
  site_id: string;
  name: string;
  abbreviation: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
};

export type AreaRequirement = {
  id: string;
  area_id: string;
  inspection_type_id: string;
  is_active: boolean;
  created_at: string;
};

export type OwnerRole = "primary" | "backup";

export type AreaRequirementOwner = {
  id: string;
  area_requirement_id: string;
  profile_id: string;
  owner_role: OwnerRole;
  created_at: string;
};

export type CycleStatus = "active" | "completed" | "archived";

export type InspectionCycle = {
  id: string;
  site_id: string;
  week_start: string;
  week_end: string;
  status: CycleStatus;
  created_at: string;
  completed_at: string | null;
};

export type TaskStatus = "pending" | "submitted" | "approved";

export type InspectionTask = {
  id: string;
  cycle_id: string;
  area_requirement_id: string;
  status: TaskStatus;
  submitted_by: string | null;
  submitted_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  notes: string | null;
  created_at: string;
};

export type DocumentRow = {
  id: string;
  /** Deprecated: kept for legacy reads only. New code links documents
   *  to tasks via the document_tasks junction table. */
  task_id: string | null;
  file_path: string;
  file_name: string;
  file_type: string | null;
  file_size: number | null;
  uploaded_by: string;
  created_at: string;
};

export type DocumentTask = {
  id: string;
  document_id: string;
  task_id: string;
  created_at: string;
};

export type Recipient = {
  id: string;
  site_id: string;
  email: string;
  full_name: string | null;
  is_active: boolean;
  created_at: string;
};

export type SiteMembership = {
  site: Site;
  role: SiteRole;
};
