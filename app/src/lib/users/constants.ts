export const USER_STATUSES = ["ACTIVE", "INACTIVE", "PENDING", "SUSPENDED"] as const;
export type ManagedUserStatus = (typeof USER_STATUSES)[number];

export const USER_STATUS_LABELS: Record<ManagedUserStatus, string> = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  PENDING: "Pending",
  SUSPENDED: "Suspended",
};

export const ROLE_RANK: Record<string, number> = {
  manager: 1,
  admin: 2,
  super_admin: 3,
};
