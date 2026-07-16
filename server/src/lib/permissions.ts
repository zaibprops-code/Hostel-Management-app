import { Role } from "@prisma/client";

// All permission keys in the system. Keys use "module.action" naming.
export const PERMISSIONS = [
  "dashboard.view",
  "hostels.view",
  "hostels.manage",
  "rooms.view",
  "rooms.manage",
  "residents.view",
  "residents.manage",
  "admissions.manage",
  "payments.view",
  "payments.manage",
  "deposits.view",
  "deposits.manage",
  "deposits.refund",
  "expenses.view",
  "expenses.manage",
  "income.view",
  "income.manage",
  "finance.viewProfit", // sensitive: P&L, revenue totals
  "capital.view", // owner investment, loans
  "capital.manage",
  "food.view",
  "food.manage",
  "inventory.view",
  "inventory.manage",
  "suppliers.view",
  "suppliers.manage",
  "staff.view",
  "staff.manage",
  "maintenance.view",
  "maintenance.manage",
  "complaints.view",
  "complaints.manage",
  "visitors.view",
  "visitors.manage",
  "notices.view",
  "notices.manage",
  "reports.view",
  "users.manage",
  "audit.view",
  "settings.manage",
  "portal.view", // resident self-service portal
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ALL: Permission[] = [...PERMISSIONS];

// Default permission sets by role. The owner may grant additional permissions
// to individual users via per-user overrides (User.permissions).
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  OWNER: ALL,
  MANAGER: [
    "dashboard.view",
    "hostels.view",
    "rooms.view",
    "rooms.manage",
    "residents.view",
    "residents.manage",
    "admissions.manage",
    "payments.view",
    "payments.manage",
    "deposits.view",
    "deposits.manage",
    "expenses.view",
    "expenses.manage",
    "income.view",
    "income.manage",
    "food.view",
    "food.manage",
    "inventory.view",
    "inventory.manage",
    "suppliers.view",
    "suppliers.manage",
    "staff.view",
    "maintenance.view",
    "maintenance.manage",
    "complaints.view",
    "complaints.manage",
    "visitors.view",
    "visitors.manage",
    "notices.view",
    "notices.manage",
    "reports.view",
    // NOTE: finance.viewProfit, capital.view, deposits.refund, users.manage,
    // audit.view and settings.manage are intentionally NOT granted by default.
  ],
  ACCOUNTANT: [
    "dashboard.view",
    "residents.view",
    "payments.view",
    "payments.manage",
    "deposits.view",
    "deposits.manage",
    "expenses.view",
    "expenses.manage",
    "income.view",
    "income.manage",
    "finance.viewProfit",
    "reports.view",
  ],
  KITCHEN: [
    "dashboard.view",
    "food.view",
    "food.manage",
    "inventory.view",
    "inventory.manage",
    "suppliers.view",
    "suppliers.manage",
    "expenses.view",
  ],
  STAFF: [
    "dashboard.view",
    "maintenance.view",
    "complaints.view",
    "visitors.view",
    "visitors.manage",
    "notices.view",
  ],
  RESIDENT: ["portal.view"],
};

export type UserPermissions = Record<string, boolean> | null | undefined;

// Resolve whether a user has a permission: per-user override wins, otherwise
// the role default applies.
export function hasPermission(
  role: Role,
  overrides: UserPermissions,
  permission: Permission
): boolean {
  if (overrides && typeof overrides === "object" && permission in overrides) {
    return Boolean(overrides[permission]);
  }
  return ROLE_PERMISSIONS[role].includes(permission);
}

// The full effective permission set for a user (used by the frontend to build
// the sidebar and hide unauthorised modules).
export function effectivePermissions(role: Role, overrides: UserPermissions): Permission[] {
  return ALL.filter((p) => hasPermission(role, overrides, p));
}
