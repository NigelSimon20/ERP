-- Seed data for the RBAC foundation tables (roles / permissions /
-- role_permissions), created by migration.sql in this same folder.
--
-- This seed deliberately mirrors what middleware.ts's ROLE_GUARDS and
-- DASHBOARD_ACCESS allowlists actually enforce TODAY (after the same-day
-- fix to the /hr and /bd prefix mismatches) -- it is a snapshot of real
-- current behavior, not an aspirational permission model. Nothing reads
-- from these tables yet; middleware.ts is still the live enforcement path.
--
-- Safe to re-run: every insert is keyed on a natural unique column via
-- ON CONFLICT DO NOTHING.

-- ── Roles (mirrors the 10 values of the existing `Role` enum) ──────────
INSERT INTO "roles" ("id", "key", "label", "isSystem", "companyId", "createdAt", "updatedAt") VALUES
  ('role-super-admin',        'SUPER_ADMIN',        'Super Admin',              true, NULL, now(), now()),
  ('role-admin',              'ADMIN',              'Admin',                    true, NULL, now(), now()),
  ('role-finance-manager',    'FINANCE_MANAGER',    'Finance Manager',          true, NULL, now(), now()),
  ('role-operations-manager', 'OPERATIONS_MANAGER', 'Operations Manager',       true, NULL, now(), now()),
  ('role-hr-manager',         'HR_MANAGER',         'HR Manager',               true, NULL, now(), now()),
  ('role-bd-manager',         'BD_MANAGER',         'Business Dev. Manager',    true, NULL, now(), now()),
  ('role-staff',              'STAFF',              'Staff',                    true, NULL, now(), now()),
  ('role-guard',              'GUARD',              'Guard',                    true, NULL, now(), now()),
  ('role-client',             'CLIENT',             'Client',                   true, NULL, now(), now()),
  ('role-read-only',          'READ_ONLY',          'Read Only',                true, NULL, now(), now())
ON CONFLICT ("key") DO NOTHING;

-- ── Permissions (module-level access + dashboard-view, matching what's
--    actually enforced today — no per-action/CRUD granularity invented) ──
INSERT INTO "permissions" ("id", "key", "module", "label", "createdAt") VALUES
  ('perm-finance-access',        'finance.access',                 'Finance',               'Access the Finance module',              now()),
  ('perm-hr-access',              'human_resources.access',         'Human Resources',       'Access the Human Resources module',      now()),
  ('perm-operations-access',      'operations.access',              'Operations',            'Access the Operations module',           now()),
  ('perm-bd-access',              'business_development.access',    'Business Development',  'Access the Business Development module', now()),
  ('perm-settings-access',        'settings.access',                'Settings',              'Access company Settings',                now()),
  ('perm-dash-executive',         'dashboard.executive.view',       'Dashboard',             'View the Executive dashboard',           now()),
  ('perm-dash-finance',           'dashboard.finance.view',         'Dashboard',             'View the Finance dashboard',              now()),
  ('perm-dash-operations',        'dashboard.operations.view',      'Dashboard',             'View the Operations dashboard',           now()),
  ('perm-dash-hr',                'dashboard.hr.view',              'Dashboard',             'View the HR dashboard',                   now()),
  ('perm-dash-bd',                'dashboard.business_development.view', 'Dashboard',        'View the Business Development dashboard', now()),
  ('perm-dash-guard',             'dashboard.guard.view',           'Dashboard',             'View the Guard dashboard',                now()),
  ('perm-dash-staff',             'dashboard.staff.view',           'Dashboard',             'View the Staff dashboard',                now()),
  ('perm-dash-readonly',          'dashboard.readonly.view',        'Dashboard',             'View the Read-Only dashboard',            now())
ON CONFLICT ("key") DO NOTHING;

-- ── Role → Permission mappings ──────────────────────────────────────────
-- SUPER_ADMIN and ADMIN: everything (matches every ROLE_GUARDS/
-- DASHBOARD_ACCESS entry listing both roles today).
INSERT INTO "role_permissions" ("id", "roleId", "permissionId", "createdAt")
SELECT 'rp-' || r."key" || '-' || p."key", r."id", p."id", now()
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."key" IN ('SUPER_ADMIN', 'ADMIN')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- FINANCE_MANAGER
INSERT INTO "role_permissions" ("id", "roleId", "permissionId", "createdAt") VALUES
  ('rp-finance-manager-finance-access', 'role-finance-manager', 'perm-finance-access', now()),
  ('rp-finance-manager-dash-finance',   'role-finance-manager', 'perm-dash-finance',   now())
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- OPERATIONS_MANAGER
INSERT INTO "role_permissions" ("id", "roleId", "permissionId", "createdAt") VALUES
  ('rp-operations-manager-ops-access',  'role-operations-manager', 'perm-operations-access', now()),
  ('rp-operations-manager-dash-ops',    'role-operations-manager', 'perm-dash-operations',   now())
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- HR_MANAGER
INSERT INTO "role_permissions" ("id", "roleId", "permissionId", "createdAt") VALUES
  ('rp-hr-manager-hr-access', 'role-hr-manager', 'perm-hr-access', now()),
  ('rp-hr-manager-dash-hr',   'role-hr-manager', 'perm-dash-hr',   now())
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- BD_MANAGER
INSERT INTO "role_permissions" ("id", "roleId", "permissionId", "createdAt") VALUES
  ('rp-bd-manager-bd-access', 'role-bd-manager', 'perm-bd-access', now()),
  ('rp-bd-manager-dash-bd',   'role-bd-manager', 'perm-dash-bd',   now())
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- GUARD / STAFF / READ_ONLY: dashboard view only, no module access
INSERT INTO "role_permissions" ("id", "roleId", "permissionId", "createdAt") VALUES
  ('rp-guard-dash-guard',         'role-guard',     'perm-dash-guard',    now()),
  ('rp-staff-dash-staff',         'role-staff',     'perm-dash-staff',    now()),
  ('rp-read-only-dash-readonly',  'role-read-only', 'perm-dash-readonly', now())
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- CLIENT: intentionally zero rows -- the Client Portal (/portal/client) is
-- an entirely separate code path, not gated by ROLE_GUARDS/DASHBOARD_ACCESS.
