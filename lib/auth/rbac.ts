export type DashboardRole = "super_admin" | "company_admin";

// Whitelisted resources for each role; extend as new dashboard sections are built.
const rolePermissions: Record<DashboardRole, string[]> = {
  super_admin: [
    "overview",
    "companies",
    "users",
    "analytics",
    "surveys",
    "settings",
    "activity_logs",
  ],
  company_admin: ["overview", "users", "analytics", "surveys"],
};

export const roleLabels: Record<DashboardRole, string> = {
  super_admin: "Super Admin",
  company_admin: "Company Admin",
};

export function canAccess(role: DashboardRole, resource: string): boolean {
  const normalized = resource.toLowerCase();
  return rolePermissions[role]?.includes(normalized) ?? false;
}

export interface DashboardUserProfile {
  id: string;
  email: string;
  full_name: string | null;
  role: DashboardRole;
  company_id: string | null;
  // Optional company metadata helpers for client-side flows
  referral_code?: string | null;
  company_slug?: string | null;
  company_name?: string | null;
}

export interface AuthenticatedUser extends DashboardUserProfile {
  token: string;
}
