"use client";

import { useState, useTransition, useMemo, useRef, useEffect } from "react";
import {
  Shield,
  UserPlus,
  Users,
  KeyRound,
  Eye,
  EyeOff,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Check,
  X,
  Search,
  Filter,
  SlidersHorizontal,
  ChevronDown,
  ChevronRight,
  Lock,
  UserCheck,
  UserX,
  ArrowRight,
  Info,
  Loader2,
  Trash2,
} from "lucide-react";
import {
  createManagerAccountAction,
  updateUserPermissionsAction,
  updateUserAccountAction,
  adminResetUserPasswordAction,
  deleteUserAccountAction,
} from "@/lib/users/actions";
import { USER_STATUSES, USER_STATUS_LABELS } from "@/lib/users/constants";
import { ERP_MODULES, ModuleDefinition, PermissionItem } from "@/lib/permissions/modules";

interface UserRecord {
  id: string;
  name: string;
  email: string;
  status: string;
  created_at: string;
}

interface RoleRecord {
  id: string;
  name: string;
}

interface UserPermissionRecord {
  user_id: string;
  permission_id: string;
  allowed: boolean;
}

interface RolePermissionRecord {
  role_id: string;
  permission_id: string;
}

interface PermissionRecord {
  id: string;
  module: string;
  action: string;
  description?: string;
}

interface Props {
  currentUserId: string;
  currentUserRoleKey: string;
  users: UserRecord[];
  roles: RoleRecord[];
  userRoles: { user_id: string; role_id: string }[];
  allPermissions: PermissionRecord[];
  rolePermissions: RolePermissionRecord[];
  userPermissions: UserPermissionRecord[];
  highlightedUserId?: string;
}

export function UserManagementClient({
  currentUserId,
  currentUserRoleKey,
  users,
  roles,
  userRoles,
  allPermissions,
  rolePermissions,
  userPermissions,
  highlightedUserId,
}: Props) {
  // Password state for Create Manager
  const [managerPassword, setManagerPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [createPending, startCreateTransition] = useTransition();

  // Active modal for permissions
  const [editingPermissionsUser, setEditingPermissionsUser] = useState<UserRecord | null>(() => {
    if (highlightedUserId) {
      return users.find((u) => u.id === highlightedUserId) || null;
    }
    return null;
  });

  // Permission state map: permission_id -> boolean (allowed)
  const [permissionDraft, setPermissionDraft] = useState<Record<string, boolean>>({});
  const [permissionInput, setPermissionInput] = useState("");
  const [permissionSearch, setPermissionSearch] = useState("");
  const permSearchTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>("ALL");
  const [savePermsPending, startSavePermsTransition] = useTransition();

  // Password Reset modal state
  const [resetPasswordUser, setResetPasswordUser] = useState<UserRecord | null>(null);
  const [resetPasswordMode, setResetPasswordMode] = useState<"direct" | "email">("direct");
  const [resetPasswordInput, setResetPasswordInput] = useState("");
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);

  // Deletion modal state
  const [deletingUser, setDeletingUser] = useState<UserRecord | null>(null);
  const [deleteReason, setDeleteReason] = useState<string>("");
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Access Summary modal state
  const [accessSummaryUser, setAccessSummaryUser] = useState<UserRecord | null>(null);

  // Search and filter for user list
  const [userInput, setUserInput] = useState("");
  const [userQuery, setUserQuery] = useState("");
  const userSearchTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [statusFilter, setStatusFilter] = useState("ALL");

  // Clean up search debounce timers on unmount
  useEffect(() => {
    return () => {
      if (userSearchTimerRef.current) clearTimeout(userSearchTimerRef.current);
      if (permSearchTimerRef.current) clearTimeout(permSearchTimerRef.current);
    };
  }, []);

  const handleUserInputChange = (val: string) => {
    setUserInput(val);
    if (userSearchTimerRef.current) {
      clearTimeout(userSearchTimerRef.current);
      userSearchTimerRef.current = null;
    }
    if (!val.trim()) {
      setUserQuery("");
      return;
    }
    userSearchTimerRef.current = setTimeout(() => {
      setUserQuery(val.trim());
    }, 300);
  };

  const handlePermInputChange = (val: string) => {
    setPermissionInput(val);
    if (permSearchTimerRef.current) {
      clearTimeout(permSearchTimerRef.current);
      permSearchTimerRef.current = null;
    }
    if (!val.trim()) {
      setPermissionSearch("");
      return;
    }
    permSearchTimerRef.current = setTimeout(() => {
      setPermissionSearch(val.trim());
    }, 300);
  };
  const [activeTab, setActiveTab] = useState<"create_manager" | "invite_user">("create_manager");

  // Map user to their assigned role
  const userRoleMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const ur of userRoles) {
      map.set(ur.user_id, ur.role_id);
    }
    return map;
  }, [userRoles]);

  // Lookup role by id
  const roleById = useMemo(() => {
    const map = new Map<string, RoleRecord>();
    for (const r of roles) {
      map.set(r.id, r);
    }
    return map;
  }, [roles]);

  // Map db permission by "module.action"
  const permByModuleAction = useMemo(() => {
    const map = new Map<string, PermissionRecord>();
    for (const p of allPermissions) {
      map.set(`${p.module}.${p.action}`, p);
    }
    return map;
  }, [allPermissions]);

  // Role permissions set: "role_id:permission_id"
  const rolePermSet = useMemo(() => {
    const set = new Set<string>();
    for (const rp of rolePermissions) {
      set.add(`${rp.role_id}:${rp.permission_id}`);
    }
    return set;
  }, [rolePermissions]);

  // User overrides map: "user_id:permission_id" -> allowed (boolean)
  const userOverrideMap = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const up of userPermissions) {
      map.set(`${up.user_id}:${up.permission_id}`, up.allowed);
    }
    return map;
  }, [userPermissions]);

  // Saving state for permissions editor
  const [isSavingPermissions, setIsSavingPermissions] = useState(false);

  // Summary counts of enabled permissions by category
  const categoryCounts = useMemo(() => {
    const counts: Record<string, { total: number; enabled: number }> = {
      View: { total: 0, enabled: 0 },
      Create: { total: 0, enabled: 0 },
      Edit: { total: 0, enabled: 0 },
      Delete: { total: 0, enabled: 0 },
      Approve: { total: 0, enabled: 0 },
      Export: { total: 0, enabled: 0 },
    };

    for (const mod of ERP_MODULES) {
      for (const it of mod.items) {
        if (counts[it.category]) {
          counts[it.category].total++;
          const p = permByModuleAction.get(it.key);
          if (p && permissionDraft[p.id]) {
            counts[it.category].enabled++;
          }
        }
      }
    }
    return counts;
  }, [permissionDraft, permByModuleAction]);

  // Compute live access summary for a user across all 14 modules
  const getUserAccessSummary = (targetUser: UserRecord) => {
    const roleId = userRoleMap.get(targetUser.id) || "";
    let allowedCount = 0;
    let allowedModulesCount = 0;

    const moduleSummaries = ERP_MODULES.map((mod) => {
      let modAllowed = 0;
      const allowedActions: string[] = [];

      for (const item of mod.items) {
        const p = permByModuleAction.get(item.key);
        if (p) {
          const overrideKey = `${targetUser.id}:${p.id}`;
          let isAllowed = false;
          if (userOverrideMap.has(overrideKey)) {
            isAllowed = userOverrideMap.get(overrideKey)!;
          } else {
            isAllowed = rolePermSet.has(`${roleId}:${p.id}`);
          }

          if (isAllowed) {
            modAllowed++;
            allowedCount++;
            allowedActions.push(item.label);
          }
        }
      }

      if (modAllowed > 0) allowedModulesCount++;

      return {
        module: mod,
        allowedCount: modAllowed,
        totalCount: mod.items.length,
        status: modAllowed === mod.items.length ? "FULL" : modAllowed > 0 ? "PARTIAL" : "NONE",
        allowedActions,
      };
    });

    return {
      allowedCount,
      totalCount: allPermissions.length,
      allowedModulesCount,
      totalModulesCount: ERP_MODULES.length,
      moduleSummaries,
    };
  };

  // Password rules validation
  const pwCriteria = {
    length: managerPassword.length >= 12,
    lower: /[a-z]/.test(managerPassword),
    upper: /[A-Z]/.test(managerPassword),
    number: /[0-9]/.test(managerPassword),
    symbol: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(managerPassword),
  };
  const pwScore = Object.values(pwCriteria).filter(Boolean).length;
  const isPasswordValid = pwScore === 5;

  // Open modal and load user permissions into draft
  const handleOpenPermissions = (targetUser: UserRecord) => {
    const targetRoleId = userRoleMap.get(targetUser.id) || "";
    const draft: Record<string, boolean> = {};

    // For all permissions in DB, resolve state:
    // If user has explicit override, use that.
    // Otherwise use role permission default.
    for (const perm of allPermissions) {
      const overrideKey = `${targetUser.id}:${perm.id}`;
      if (userOverrideMap.has(overrideKey)) {
        draft[perm.id] = userOverrideMap.get(overrideKey)!;
      } else {
        const isRolePermitted = rolePermSet.has(`${targetRoleId}:${perm.id}`);
        draft[perm.id] = isRolePermitted;
      }
    }

    setPermissionDraft(draft);
    setEditingPermissionsUser(targetUser);
  };

  // Preset actions for permissions modal
  const handleApplyPreset = (preset: "ALL" | "NONE" | "ROLE_DEFAULT" | "OPERATIONS" | "SALES") => {
    if (!editingPermissionsUser) return;
    const targetRoleId = userRoleMap.get(editingPermissionsUser.id) || "";
    const updated = { ...permissionDraft };

    for (const perm of allPermissions) {
      const key = `${perm.module}.${perm.action}`;

      if (preset === "ALL") {
        updated[perm.id] = true;
      } else if (preset === "NONE") {
        updated[perm.id] = false;
      } else if (preset === "ROLE_DEFAULT") {
        updated[perm.id] = rolePermSet.has(`${targetRoleId}:${perm.id}`);
      } else if (preset === "OPERATIONS") {
        // Operations & Production focus
        const opModules = ["production", "inventory", "raw_materials", "delivery", "reports", "notifications"];
        updated[perm.id] = opModules.includes(perm.module);
      } else if (preset === "SALES") {
        // Sales & CRM focus
        const salesModules = ["customers", "orders", "products", "payments", "reports", "notifications"];
        updated[perm.id] = salesModules.includes(perm.module);
      }
    }
    setPermissionDraft(updated);
  };

  const handleToggleModuleAll = (moduleDef: ModuleDefinition, enable: boolean) => {
    const updated = { ...permissionDraft };
    for (const item of moduleDef.items) {
      const dbPerm = permByModuleAction.get(item.key);
      if (dbPerm) {
        updated[dbPerm.id] = enable;
      }
    }
    setPermissionDraft(updated);
  };

  // Filtered users
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchQuery =
        !userQuery ||
        u.name.toLowerCase().includes(userQuery.toLowerCase()) ||
        u.email.toLowerCase().includes(userQuery.toLowerCase());
      const matchStatus = statusFilter === "ALL" || u.status === statusFilter;
      return matchQuery && matchStatus;
    });
  }, [users, userQuery, statusFilter]);

  // Default manager role id
  const managerRoleId = roles.find((r) => r.name.toLowerCase().includes("manager"))?.id || "";

  return (
    <div className="space-y-8">
      {/* 1. Account Provisioning Section */}
      <section className="rounded-xl border border-[var(--line)] bg-white p-5 sm:p-6 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] pb-4">
          <div>
            <h2 className="text-lg font-semibold text-[var(--foreground)] flex items-center gap-2">
              <Shield className="h-5 w-5 text-[var(--accent)]" />
              Provision Manager & Staff Accounts
            </h2>
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              Admin-controlled direct account creation with strict password policies and initial credentials.
            </p>
          </div>

          {/* Toggle between Direct Creation and Legacy Invite */}
          <div className="inline-flex rounded-lg border border-[var(--line)] bg-[var(--background)] p-1 text-xs font-medium">
            <button
              type="button"
              onClick={() => setActiveTab("create_manager")}
              className={`rounded-md px-3 py-1.5 transition-colors ${
                activeTab === "create_manager"
                  ? "bg-white text-[var(--accent)] shadow-xs font-semibold"
                  : "text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              Direct Manager Creation
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("invite_user")}
              className={`rounded-md px-3 py-1.5 transition-colors ${
                activeTab === "invite_user"
                  ? "bg-white text-[var(--accent)] shadow-xs font-semibold"
                  : "text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              Email Invite
            </button>
          </div>
        </div>

        {activeTab === "create_manager" ? (
          <form
            action={createManagerAccountAction}
            className="mt-6 space-y-5"
            onSubmit={(e) => {
              if (!isPasswordValid) {
                e.preventDefault();
                alert("Please ensure the initial password satisfies all 5 strength requirements.");
              }
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <label className="grid gap-1.5 text-sm font-medium text-[var(--foreground)]">
                Manager Full Name
                <input
                  name="name"
                  required
                  maxLength={120}
                  placeholder="e.g. Robert Smith"
                  className="min-h-10 rounded-lg border border-[var(--line)] bg-white px-3.5 text-sm outline-none transition focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
                />
              </label>

              <label className="grid gap-1.5 text-sm font-medium text-[var(--foreground)]">
                Manager Email
                <input
                  type="email"
                  name="email"
                  required
                  maxLength={254}
                  placeholder="manager@company.com"
                  className="min-h-10 rounded-lg border border-[var(--line)] bg-white px-3.5 text-sm outline-none transition focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
                />
              </label>

              <label className="grid gap-1.5 text-sm font-medium text-[var(--foreground)]">
                Role Assignment
                <select
                  name="roleId"
                  defaultValue={managerRoleId}
                  required
                  className="min-h-10 rounded-lg border border-[var(--line)] bg-white px-3.5 text-sm outline-none transition focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
                >
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {/* Password input with live validation */}
            <div className="rounded-lg border border-[var(--line)] bg-[var(--background)] p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <span className="text-sm font-semibold text-[var(--foreground)] flex items-center gap-1.5">
                    <KeyRound className="h-4 w-4 text-[var(--accent)]" />
                    Initial Secure Password
                  </span>
                  <p className="text-xs text-[var(--muted)]">
                    The manager will use this initial password to sign in. Password is securely hashed in Supabase Auth.
                  </p>
                </div>
                <div className="flex items-center gap-1.5 text-xs font-semibold">
                  <span>Strength:</span>
                  <span
                    className={
                      pwScore <= 2
                        ? "text-red-600"
                        : pwScore <= 4
                        ? "text-amber-600"
                        : "text-emerald-700"
                    }
                  >
                    {pwScore <= 2 ? "Weak" : pwScore <= 4 ? "Medium" : "Strong (Ready)"}
                  </span>
                </div>
              </div>

              <div className="relative mt-3">
                <input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  value={managerPassword}
                  onChange={(e) => setManagerPassword(e.target.value)}
                  placeholder="Enter a secure password (min 12 chars, upper, lower, number, symbol)"
                  required
                  className="min-h-11 w-full rounded-lg border border-[var(--line)] bg-white px-3.5 pr-11 text-sm font-mono outline-none transition focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--foreground)]"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              {/* Strength Checklist */}
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
                <div className={`flex items-center gap-1.5 ${pwCriteria.length ? "text-emerald-700" : "text-[var(--muted)]"}`}>
                  {pwCriteria.length ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                  <span>12+ chars</span>
                </div>
                <div className={`flex items-center gap-1.5 ${pwCriteria.lower ? "text-emerald-700" : "text-[var(--muted)]"}`}>
                  {pwCriteria.lower ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                  <span>Lowercase</span>
                </div>
                <div className={`flex items-center gap-1.5 ${pwCriteria.upper ? "text-emerald-700" : "text-[var(--muted)]"}`}>
                  {pwCriteria.upper ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                  <span>Uppercase</span>
                </div>
                <div className={`flex items-center gap-1.5 ${pwCriteria.number ? "text-emerald-700" : "text-[var(--muted)]"}`}>
                  {pwCriteria.number ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                  <span>Number</span>
                </div>
                <div className={`flex items-center gap-1.5 ${pwCriteria.symbol ? "text-emerald-700" : "text-[var(--muted)]"}`}>
                  {pwCriteria.symbol ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                  <span>Symbol (!@#$)</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end">
              <button
                type="submit"
                disabled={!isPasswordValid}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-5 text-sm font-semibold text-white shadow-xs transition hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <UserPlus className="h-4 w-4" />
                Create Manager Account
              </button>
            </div>
          </form>
        ) : (
          <form action="/api/users/invite" method="POST" className="mt-6 space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="grid gap-1.5 text-sm font-medium">
                Name
                <input
                  name="name"
                  required
                  maxLength={120}
                  className="min-h-10 rounded-lg border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)]"
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                Email
                <input
                  type="email"
                  name="email"
                  required
                  maxLength={254}
                  className="min-h-10 rounded-lg border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)]"
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                Role
                <select
                  name="roleId"
                  required
                  className="min-h-10 rounded-lg border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)]"
                >
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                className="min-h-10 rounded-lg bg-[var(--accent)] px-5 text-sm font-semibold text-white hover:bg-[var(--accent-strong)]"
              >
                Send Invite Email
              </button>
            </div>
          </form>
        )}
      </section>

      {/* 2. User Accounts Management Directory */}
      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[var(--foreground)] flex items-center gap-2">
              <Users className="h-5 w-5 text-[var(--accent)]" />
              Company Accounts & Permissions
            </h2>
            <p className="text-xs text-[var(--muted)]">
              Manage accounts, activate/deactivate, and configure granular permissions across 14 modules.
            </p>
          </div>

          {/* Search & Filter Bar */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1 sm:w-64">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--muted)]" />
              <input
                type="text"
                placeholder="Search by name or email..."
                value={userInput}
                onChange={(e) => handleUserInputChange(e.target.value)}
                className="min-h-9 w-full rounded-lg border border-[var(--line)] bg-white pl-9 pr-3 text-xs outline-none focus:border-[var(--accent)]"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="min-h-9 rounded-lg border border-[var(--line)] bg-white px-2.5 text-xs outline-none focus:border-[var(--accent)]"
            >
              <option value="ALL">All Statuses</option>
              {USER_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {USER_STATUS_LABELS[st] ?? st}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Desktop / Tablet View (Table) */}
        <div className="hidden md:block overflow-hidden rounded-xl border border-[var(--line)] bg-white shadow-xs">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="border-b border-[var(--line)] bg-[#f8fafc] text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3.5">User</th>
                <th className="px-4 py-3.5">Assigned Role</th>
                <th className="px-4 py-3.5">Account Status</th>
                <th className="px-4 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {filteredUsers.map((user) => {
                const roleId = userRoleMap.get(user.id) || "";
                const role = roleById.get(roleId);
                const roleName = role?.name || "Unassigned";
                const isSelf = user.id === currentUserId;
                const isSuperAdmin = roleName.toLowerCase().includes("super admin");
                const hasOverrides = userPermissions.some((up) => up.user_id === user.id);

                return (
                  <tr
                    key={user.id}
                    className={`transition-colors hover:bg-[var(--background)] ${
                      highlightedUserId === user.id ? "bg-teal-50/50" : ""
                    }`}
                  >
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent)]/10 font-bold text-[var(--accent)] text-xs">
                          {user.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-[var(--foreground)] truncate">{user.name}</p>
                          <p className="text-xs text-[var(--muted)] truncate">{user.email}</p>
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3.5">
                      <span className="inline-flex items-center rounded-md border border-[var(--line)] bg-[var(--background)] px-2.5 py-1 text-xs font-medium text-[var(--foreground)]">
                        {roleName}
                      </span>
                    </td>

                    <td className="px-4 py-3.5">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          user.status === "ACTIVE"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : user.status === "INACTIVE"
                            ? "bg-slate-100 text-slate-700 border border-slate-300"
                            : "bg-amber-50 text-amber-700 border border-amber-200"
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            user.status === "ACTIVE" ? "bg-emerald-600" : "bg-slate-400"
                          }`}
                        />
                        {user.status}
                      </span>
                    </td>

                    <td className="px-4 py-3.5 text-right">
                      {isSelf ? (
                        <span className="text-xs italic text-[var(--muted)]">Current Account</span>
                      ) : isSuperAdmin ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500">
                          <Lock className="h-3 w-3 text-slate-400" /> Protected (Super Admin)
                        </span>
                      ) : currentUserRoleKey === "manager" ? (
                        <span className="text-xs text-[var(--muted)]">View only</span>
                      ) : (
                        <div className="inline-flex items-center justify-end gap-1.5">
                          {/* Access Summary Button */}
                          <button
                            type="button"
                            onClick={() => setAccessSummaryUser(user)}
                            className="inline-flex items-center gap-1 rounded-lg border border-[var(--line)] bg-white px-2.5 py-1.5 text-xs font-semibold text-[var(--foreground)] shadow-2xs hover:bg-[var(--background)] transition"
                            title="View enabled modules and permissions summary"
                          >
                            <Info className="h-3.5 w-3.5 text-teal-600" />
                            <span>Summary</span>
                          </button>

                          {/* Manage Access Button */}
                          <button
                            type="button"
                            onClick={() => handleOpenPermissions(user)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line)] bg-white px-2.5 py-1.5 text-xs font-semibold text-[var(--foreground)] shadow-2xs hover:bg-[var(--background)] hover:border-[var(--accent)] transition"
                          >
                            <SlidersHorizontal className="h-3.5 w-3.5 text-[var(--accent)]" />
                            <span>Manage Access</span>
                            {hasOverrides && (
                              <span className="rounded-full bg-teal-100 px-1.5 py-0.2 text-[10px] font-bold text-[var(--accent)]">
                                Custom
                              </span>
                            )}
                          </button>

                          {/* Secure Password Reset Button */}
                          <button
                            type="button"
                            onClick={() => {
                              setResetPasswordUser(user);
                              setResetPasswordInput("");
                              setResetPasswordMode("direct");
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50/60 px-2.5 py-1.5 text-xs font-semibold text-amber-800 shadow-2xs hover:bg-amber-100/70 transition"
                            title="Reset user password"
                          >
                            <KeyRound className="h-3.5 w-3.5 text-amber-600" />
                            <span>Reset PW</span>
                          </button>

                          {/* Delete Account Button */}
                          <button
                            type="button"
                            onClick={() => {
                              setDeletingUser(user);
                              setDeleteReason("");
                              setIsDeleting(false);
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50/70 px-2.5 py-1.5 text-xs font-semibold text-red-700 shadow-2xs hover:bg-red-100 transition cursor-pointer"
                            title="Delete or deactivate account"
                          >
                            <Trash2 className="h-3.5 w-3.5 text-red-600" />
                            <span>Delete</span>
                          </button>

                          {/* Quick Role & Status Update Form */}
                          <form action={updateUserAccountAction} className="inline-flex items-center gap-1.5">
                            <input type="hidden" name="userId" value={user.id} />
                            <select
                              name="roleId"
                              defaultValue={roleId}
                              disabled={isSuperAdmin}
                              className="rounded-lg border border-[var(--line)] bg-white px-2 py-1 text-xs outline-none focus:border-[var(--accent)] disabled:opacity-50"
                            >
                              {roles.map((r) => (
                                <option key={r.id} value={r.id}>
                                  {r.name}
                                </option>
                              ))}
                            </select>

                            <select
                              name="status"
                              defaultValue={user.status}
                              className="rounded-lg border border-[var(--line)] bg-white px-2 py-1 text-xs outline-none focus:border-[var(--accent)]"
                            >
                              {USER_STATUSES.map((st) => (
                                <option key={st} value={st}>
                                  {USER_STATUS_LABELS[st] ?? st}
                                </option>
                              ))}
                            </select>

                            <button
                              type="submit"
                              className="rounded-lg bg-[var(--background)] border border-[var(--line)] px-2.5 py-1 text-xs font-semibold text-[var(--foreground)] hover:bg-slate-100 transition"
                            >
                              Save
                            </button>
                          </form>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-sm text-[var(--muted)]">
                    No users matching criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile View: Adaptive Cards (360px+ Friendly, No Horizontal Overflow) */}
        <div className="grid gap-3 md:hidden">
          {filteredUsers.map((user) => {
            const roleId = userRoleMap.get(user.id) || "";
            const role = roleById.get(roleId);
            const roleName = role?.name || "Unassigned";
            const isSelf = user.id === currentUserId;
            const isSuperAdmin = roleName.toLowerCase().includes("super admin");
            const hasOverrides = userPermissions.some((up) => up.user_id === user.id);

            return (
              <div
                key={user.id}
                className="rounded-xl border border-[var(--line)] bg-white p-4 shadow-xs space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent)]/10 font-bold text-[var(--accent)] text-sm">
                      {user.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-[var(--foreground)] truncate">{user.name}</p>
                      <p className="text-xs text-[var(--muted)] truncate">{user.email}</p>
                    </div>
                  </div>

                  <span
                    className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      user.status === "ACTIVE"
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : "bg-slate-100 text-slate-700 border border-slate-300"
                    }`}
                  >
                    {user.status}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs text-[var(--muted)] pt-1 border-t border-[var(--line)]">
                  <span>Role: <strong className="text-[var(--foreground)]">{roleName}</strong></span>
                  {hasOverrides && (
                    <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-semibold text-[var(--accent)] border border-teal-200">
                      Custom Matrix
                    </span>
                  )}
                </div>

                {isSelf ? (
                  <p className="text-center text-xs italic text-[var(--muted)] pt-1">
                    Logged in account
                  </p>
                ) : isSuperAdmin ? (
                  <p className="flex items-center justify-center gap-1 text-xs font-semibold text-slate-500 pt-1">
                    <Lock className="h-3.5 w-3.5 text-slate-400" /> Super Admin Protected
                  </p>
                ) : currentUserRoleKey === "manager" ? (
                  <p className="text-center text-xs text-[var(--muted)] pt-1">
                    View only
                  </p>
                ) : (
                  <div className="space-y-2 pt-1">
                    <button
                      type="button"
                      onClick={() => handleOpenPermissions(user)}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--line)] bg-white py-2 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--background)] transition"
                    >
                      <SlidersHorizontal className="h-3.5 w-3.5 text-[var(--accent)]" />
                      Manage Access
                    </button>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setAccessSummaryUser(user)}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--line)] bg-white py-1.5 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--background)] transition"
                      >
                        <Info className="h-3.5 w-3.5 text-teal-600" />
                        Summary
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setResetPasswordUser(user);
                          setResetPasswordInput("");
                          setResetPasswordMode("direct");
                        }}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50/70 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 transition"
                      >
                        <KeyRound className="h-3.5 w-3.5 text-amber-600" />
                        Reset PW
                      </button>
                    </div>

                    {/* Delete Account Mobile Button */}
                    <button
                      type="button"
                      onClick={() => {
                        setDeletingUser(user);
                        setDeleteReason("");
                        setIsDeleting(false);
                      }}
                      className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-red-50/70 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 transition cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-red-600" />
                      <span>Delete Account</span>
                    </button>

                    <form action={updateUserAccountAction} className="grid grid-cols-2 gap-2">
                      <input type="hidden" name="userId" value={user.id} />
                      <select
                        name="roleId"
                        defaultValue={roleId}
                        disabled={isSuperAdmin}
                        className="rounded-lg border border-[var(--line)] bg-white px-2 py-1.5 text-xs outline-none focus:border-[var(--accent)] disabled:opacity-50"
                      >
                        {roles.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>

                      <div className="flex gap-1.5">
                        <select
                          name="status"
                          defaultValue={user.status}
                          className="flex-1 rounded-lg border border-[var(--line)] bg-white px-2 py-1.5 text-xs outline-none focus:border-[var(--accent)]"
                        >
                          {USER_STATUSES.map((st) => (
                            <option key={st} value={st}>
                              {USER_STATUS_LABELS[st] ?? st}
                            </option>
                          ))}
                        </select>
                        <button
                          type="submit"
                          className="rounded-lg bg-[var(--background)] border border-[var(--line)] px-2.5 py-1.5 text-xs font-semibold text-[var(--foreground)] hover:bg-slate-100"
                        >
                          Save
                        </button>
                      </div>
                    </form>
                  </div>
                )}
              </div>
            );
          })}
          {filteredUsers.length === 0 && (
            <div className="rounded-xl border border-[var(--line)] bg-white p-6 text-center text-sm text-[var(--muted)]">
              No users found.
            </div>
          )}
        </div>
      </section>

      {/* 3. Granular Access Control Modal (Full Matrix across 14 modules) */}
      {editingPermissionsUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2 sm:p-4 backdrop-blur-xs">
          <div className="flex max-h-[92vh] w-full max-w-4xl flex-col rounded-2xl border border-[var(--line)] bg-white shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4 sm:px-6">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-[var(--foreground)]">
                    Granular Access Control
                  </h3>
                  <span className="rounded-md bg-teal-50 border border-teal-200 px-2 py-0.5 text-xs font-semibold text-[var(--accent)]">
                    {roleById.get(userRoleMap.get(editingPermissionsUser.id) || "")?.name || "User"}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-[var(--muted)]">
                  Configuring permissions for <strong>{editingPermissionsUser.name}</strong> ({editingPermissionsUser.email})
                </p>
              </div>

              <button
                type="button"
                onClick={() => setEditingPermissionsUser(null)}
                className="rounded-lg p-1.5 text-[var(--muted)] hover:bg-slate-100 hover:text-[var(--foreground)]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Quick Action Presets & Filter */}
            <div className="border-b border-[var(--line)] bg-[var(--background)] px-5 py-3 sm:px-6 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                  Quick Presets:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleApplyPreset("ALL")}
                    className="rounded-md border border-[var(--line)] bg-white px-2.5 py-1 text-xs font-medium text-[var(--foreground)] hover:bg-slate-50"
                  >
                    Grant All
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyPreset("OPERATIONS")}
                    className="rounded-md border border-[var(--line)] bg-white px-2.5 py-1 text-xs font-medium text-[var(--foreground)] hover:bg-slate-50"
                  >
                    Operations Focus
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyPreset("SALES")}
                    className="rounded-md border border-[var(--line)] bg-white px-2.5 py-1 text-xs font-medium text-[var(--foreground)] hover:bg-slate-50"
                  >
                    Sales Focus
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyPreset("ROLE_DEFAULT")}
                    className="rounded-md border border-[var(--line)] bg-white px-2.5 py-1 text-xs font-medium text-[var(--accent)] hover:bg-slate-50"
                  >
                    Reset to Role Defaults
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyPreset("NONE")}
                    className="rounded-md border border-[var(--line)] bg-white px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                  >
                    Revoke All
                  </button>
                </div>
              </div>

              {/* Category Filter & Search */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <div className="relative flex-1 min-w-[160px]">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--muted)]" />
                  <input
                    type="text"
                    placeholder="Filter permissions..."
                    value={permissionInput}
                    onChange={(e) => handlePermInputChange(e.target.value)}
                    className="min-h-8 w-full rounded-md border border-[var(--line)] bg-white pl-8 pr-2.5 text-xs outline-none focus:border-[var(--accent)]"
                  />
                </div>

                <div className="flex flex-wrap gap-1">
                  {["ALL", "View", "Create", "Edit", "Delete", "Approve", "Export"].map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategoryFilter(cat)}
                      className={`rounded px-2 py-1 text-[11px] font-semibold transition ${
                        selectedCategoryFilter === cat
                          ? "bg-[var(--accent)] text-white"
                          : "bg-white border border-[var(--line)] text-[var(--muted)] hover:text-[var(--foreground)]"
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Action Category Summary Badges */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs border-t border-[var(--line)]/60">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)] mr-1">
                  Summary:
                </span>
                {Object.entries(categoryCounts).map(([cat, counts]) => (
                  <span
                    key={cat}
                    className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                      counts.enabled === counts.total && counts.total > 0
                        ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                        : counts.enabled === 0
                        ? "bg-slate-100 text-slate-600 border border-slate-200"
                        : "bg-teal-50 text-teal-800 border border-teal-200"
                    }`}
                  >
                    {cat}: {counts.enabled}/{counts.total}
                  </span>
                ))}
              </div>
            </div>

            {/* Modal Body: Scrollable Modules List */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
              {ERP_MODULES.map((moduleDef) => {
                // Filter items based on search and category
                const filteredItems = moduleDef.items.filter((item) => {
                  const matchSearch =
                    !permissionSearch ||
                    item.label.toLowerCase().includes(permissionSearch.toLowerCase()) ||
                    item.description.toLowerCase().includes(permissionSearch.toLowerCase()) ||
                    item.key.toLowerCase().includes(permissionSearch.toLowerCase());
                  const matchCategory =
                    selectedCategoryFilter === "ALL" || item.category === selectedCategoryFilter;
                  return matchSearch && matchCategory;
                });

                if (filteredItems.length === 0) return null;

                // Calculate allowed count for this module
                const enabledCount = moduleDef.items.filter((item) => {
                  const dbPerm = permByModuleAction.get(item.key);
                  return dbPerm ? Boolean(permissionDraft[dbPerm.id]) : false;
                }).length;

                return (
                  <div
                    key={moduleDef.id}
                    className="rounded-xl border border-[var(--line)] bg-white p-4 shadow-2xs"
                  >
                    {/* Module Header */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] pb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-sm text-[var(--foreground)]">
                            {moduleDef.name}
                          </h4>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              enabledCount === moduleDef.items.length
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : enabledCount === 0
                                ? "bg-slate-100 text-slate-600 border border-slate-200"
                                : "bg-amber-50 text-amber-700 border border-amber-200"
                            }`}
                          >
                            {enabledCount === moduleDef.items.length
                              ? "All Enabled"
                              : enabledCount === 0
                              ? "All Disabled"
                              : `${enabledCount} of ${moduleDef.items.length} Enabled`}
                          </span>
                        </div>
                        <p className="text-xs text-[var(--muted)] mt-0.5">{moduleDef.description}</p>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleToggleModuleAll(moduleDef, true)}
                          className="rounded border border-[var(--line)] bg-[var(--background)] px-2.5 py-1 text-[11px] font-semibold text-[var(--foreground)] hover:bg-slate-100 transition"
                        >
                          Select All
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleModuleAll(moduleDef, false)}
                          className="rounded border border-[var(--line)] bg-[var(--background)] px-2.5 py-1 text-[11px] font-semibold text-[var(--muted)] hover:text-red-600 transition"
                        >
                          Clear All
                        </button>
                      </div>
                    </div>

                    {/* Module Permissions Grid */}
                    <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                      {filteredItems.map((item) => {
                        const dbPerm = permByModuleAction.get(item.key);
                        if (!dbPerm) return null;

                        const isAllowed = Boolean(permissionDraft[dbPerm.id]);
                        const targetRoleId = userRoleMap.get(editingPermissionsUser.id) || "";
                        const roleHasIt = rolePermSet.has(`${targetRoleId}:${dbPerm.id}`);
                        const isOverridden = isAllowed !== roleHasIt;

                        return (
                          <label
                            key={item.key}
                            className={`flex cursor-pointer items-start gap-3 rounded-lg border p-2.5 transition select-none ${
                              isAllowed
                                ? "border-teal-200 bg-teal-50/30"
                                : "border-[var(--line)] bg-[var(--background)] opacity-75"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isAllowed}
                              onChange={(e) => {
                                setPermissionDraft((prev) => ({
                                  ...prev,
                                  [dbPerm.id]: e.target.checked,
                                }));
                              }}
                              className="mt-1 h-4 w-4 rounded border-gray-300 text-[var(--accent)] focus:ring-[var(--accent)]"
                            />

                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-semibold text-xs text-[var(--foreground)]">
                                  {item.label}
                                </span>
                                <span
                                  className={`rounded px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wider ${
                                    item.category === "View"
                                      ? "bg-blue-100 text-blue-700"
                                      : item.category === "Create"
                                      ? "bg-emerald-100 text-emerald-700"
                                      : item.category === "Edit"
                                      ? "bg-amber-100 text-amber-700"
                                      : item.category === "Delete"
                                      ? "bg-rose-100 text-rose-700"
                                      : item.category === "Approve"
                                      ? "bg-purple-100 text-purple-700"
                                      : "bg-indigo-100 text-indigo-700"
                                  }`}
                                >
                                  {item.category}
                                </span>

                                {isOverridden && (
                                  <span className="rounded bg-teal-100 px-1 py-0.2 text-[9px] font-semibold text-[var(--accent)]">
                                    Override
                                  </span>
                                )}
                              </div>
                              <p className="mt-0.5 text-[11px] text-[var(--muted)] leading-tight">
                                {item.description}
                              </p>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Modal Footer */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] bg-[#f8fafc] px-5 py-4 sm:px-6">
              <div className="text-xs text-[var(--muted)]">
                <strong className="text-[var(--foreground)]">{Object.values(permissionDraft).filter(Boolean).length}</strong> of {allPermissions.length} actions permitted ({Math.round((Object.values(permissionDraft).filter(Boolean).length / (allPermissions.length || 1)) * 100)}%)
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isSavingPermissions}
                  onClick={() => setEditingPermissionsUser(null)}
                  className="rounded-lg border border-[var(--line)] bg-white px-4 py-2 text-xs font-semibold text-[var(--foreground)] hover:bg-slate-50 transition disabled:opacity-50"
                >
                  Cancel
                </button>

                <form
                  action={updateUserPermissionsAction}
                  onSubmit={() => setIsSavingPermissions(true)}
                >
                  <input type="hidden" name="userId" value={editingPermissionsUser.id} />
                  <input
                    type="hidden"
                    name="permissions"
                    value={JSON.stringify(permissionDraft)}
                  />
                  <button
                    type="submit"
                    disabled={isSavingPermissions}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[var(--accent-strong)] transition disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {isSavingPermissions ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Saving Changes...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4" />
                        Save Permissions
                      </>
                    )}
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. Manager Access Summary Modal */}
      {accessSummaryUser && (() => {
        const summary = getUserAccessSummary(accessSummaryUser);
        const roleId = userRoleMap.get(accessSummaryUser.id) || "";
        const roleName = roleById.get(roleId)?.name || "User";

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2 sm:p-4 backdrop-blur-xs">
            <div className="flex max-h-[92vh] w-full max-w-3xl flex-col rounded-2xl border border-[var(--line)] bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4 sm:px-6">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-[var(--foreground)]">
                      Manager Access Summary
                    </h3>
                    <span className="rounded-md bg-teal-50 border border-teal-200 px-2 py-0.5 text-xs font-semibold text-[var(--accent)]">
                      {roleName}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-[var(--muted)]">
                    Active permissions for <strong>{accessSummaryUser.name}</strong> ({accessSummaryUser.email})
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAccessSummaryUser(null)}
                  className="rounded-lg p-1.5 text-[var(--muted)] hover:bg-slate-100"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Summary Stats Overview */}
              <div className="border-b border-[var(--line)] bg-[var(--background)] px-5 py-3 sm:px-6">
                <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div>
                    <span className="text-[var(--muted)]">Modules Permitted: </span>
                    <strong className="text-[var(--foreground)]">
                      {summary.allowedModulesCount} of {summary.totalModulesCount}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[var(--muted)]">Actions Permitted: </span>
                    <strong className="text-[var(--accent)]">
                      {summary.allowedCount} of {summary.totalCount} ({Math.round((summary.allowedCount / (summary.totalCount || 1)) * 100)}%)
                    </strong>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const target = accessSummaryUser;
                      setAccessSummaryUser(null);
                      handleOpenPermissions(target);
                    }}
                    className="rounded-md bg-[var(--accent)] px-3 py-1 text-xs font-semibold text-white hover:bg-[var(--accent-strong)] transition"
                  >
                    Edit in Matrix
                  </button>
                </div>
              </div>

              {/* Module Summary Cards */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3">
                {summary.moduleSummaries.map(({ module: mod, allowedCount, totalCount, status, allowedActions }) => (
                  <div
                    key={mod.id}
                    className="rounded-xl border border-[var(--line)] bg-white p-3.5 transition"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-[var(--foreground)]">{mod.name}</h4>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            status === "FULL"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : status === "PARTIAL"
                              ? "bg-amber-50 text-amber-700 border border-amber-200"
                              : "bg-slate-100 text-slate-500 border border-slate-200"
                          }`}
                        >
                          {status === "FULL"
                            ? "Full Access"
                            : status === "PARTIAL"
                            ? `${allowedCount}/${totalCount} Actions Allowed`
                            : "Restricted (No Access)"}
                        </span>
                      </div>
                      <span className="text-xs text-[var(--muted)]">{mod.description}</span>
                    </div>

                    {allowedActions.length > 0 ? (
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {allowedActions.map((actionLabel) => (
                          <span
                            key={actionLabel}
                            className="inline-flex items-center gap-1 rounded-md bg-teal-50 border border-teal-200 px-2 py-0.5 text-[11px] font-medium text-teal-800"
                          >
                            <Check className="h-3 w-3 text-teal-600" />
                            {actionLabel}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-1.5 text-xs italic text-[var(--muted)]">
                        No actions permitted for this module.
                      </p>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex justify-end border-t border-[var(--line)] bg-[#f8fafc] px-5 py-3 sm:px-6">
                <button
                  type="button"
                  onClick={() => setAccessSummaryUser(null)}
                  className="rounded-lg border border-[var(--line)] bg-white px-4 py-2 text-xs font-semibold text-[var(--foreground)] hover:bg-slate-50"
                >
                  Close Summary
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 5. Secure Password Reset Modal */}
      {resetPasswordUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2 sm:p-4 backdrop-blur-xs">
          <div className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-2xl border border-[var(--line)] bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4 sm:px-6">
              <div>
                <h3 className="text-lg font-bold text-[var(--foreground)] flex items-center gap-2">
                  <KeyRound className="h-5 w-5 text-amber-600" />
                  Secure Password Reset
                </h3>
                <p className="mt-0.5 text-xs text-[var(--muted)]">
                  Reset credentials for <strong>{resetPasswordUser.name}</strong> ({resetPasswordUser.email})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setResetPasswordUser(null)}
                className="rounded-lg p-1.5 text-[var(--muted)] hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form
              action={adminResetUserPasswordAction}
              onSubmit={() => setIsResettingPassword(true)}
              className="p-5 sm:p-6 space-y-4"
            >
              <input type="hidden" name="userId" value={resetPasswordUser.id} />
              <input type="hidden" name="mode" value={resetPasswordMode} />

              <div className="flex rounded-lg border border-[var(--line)] bg-[var(--background)] p-1 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setResetPasswordMode("direct")}
                  className={`flex-1 rounded-md py-1.5 transition ${
                    resetPasswordMode === "direct"
                      ? "bg-white text-[var(--foreground)] shadow-xs"
                      : "text-[var(--muted)] hover:text-[var(--foreground)]"
                  }`}
                >
                  Set Direct Password
                </button>
                <button
                  type="button"
                  onClick={() => setResetPasswordMode("email")}
                  className={`flex-1 rounded-md py-1.5 transition ${
                    resetPasswordMode === "email"
                      ? "bg-white text-[var(--foreground)] shadow-xs"
                      : "text-[var(--muted)] hover:text-[var(--foreground)]"
                  }`}
                >
                  Send Recovery Link
                </button>
              </div>

              {resetPasswordMode === "direct" ? (
                <div className="space-y-3">
                  <label className="grid gap-1.5 text-xs font-semibold text-[var(--foreground)]">
                    New Secure Password
                    <div className="relative">
                      <input
                        type={showResetPassword ? "text" : "password"}
                        name="newPassword"
                        value={resetPasswordInput}
                        onChange={(e) => setResetPasswordInput(e.target.value)}
                        required
                        placeholder="Min 12 chars, upper, lower, number, symbol"
                        className="min-h-10 w-full rounded-lg border border-[var(--line)] bg-white px-3 pr-10 text-xs font-mono outline-none focus:border-[var(--accent)]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowResetPassword(!showResetPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"
                      >
                        {showResetPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </label>

                  <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-800 space-y-1">
                    <p className="font-semibold flex items-center gap-1.5">
                      <AlertCircle className="h-4 w-4 text-amber-600" />
                      Session Termination Protocol:
                    </p>
                    <p className="text-[11px] text-amber-700 leading-relaxed">
                      Setting a new password will terminate all active sessions for this account immediately. The manager will be required to change their temporary password upon next login.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-[var(--line)] bg-[var(--background)] p-4 text-xs text-[var(--foreground)] space-y-2">
                  <p className="font-semibold">Dispatch Recovery Email</p>
                  <p className="text-[var(--muted)] text-[11px] leading-relaxed">
                    A secure, single-use password recovery token will be dispatched to <strong>{resetPasswordUser.email}</strong> through Supabase Auth.
                  </p>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--line)]">
                <button
                  type="button"
                  disabled={isResettingPassword}
                  onClick={() => setResetPasswordUser(null)}
                  className="rounded-lg border border-[var(--line)] px-4 py-2 text-xs font-semibold text-[var(--foreground)] hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isResettingPassword || (resetPasswordMode === "direct" && resetPasswordInput.length < 12)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white hover:bg-[var(--accent-strong)] transition disabled:opacity-50"
                >
                  {isResettingPassword ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <KeyRound className="h-4 w-4" />
                      {resetPasswordMode === "direct" ? "Update Password" : "Send Recovery Link"}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. Secure Account Deletion Confirmation Modal */}
      {deletingUser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-2xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-account-title"
        >
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-red-100 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-red-100 px-5 py-4 bg-red-50/60">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-100 text-red-700">
                  <Trash2 className="h-5 w-5" />
                </div>
                <div>
                  <h3 id="delete-account-title" className="text-sm font-bold text-slate-900">
                    Delete User Account
                  </h3>
                  <p className="text-xs text-red-700/80 font-medium">Permanent access revocation</p>
                </div>
              </div>
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeletingUser(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Form */}
            <form
              action={deleteUserAccountAction}
              onSubmit={() => setIsDeleting(true)}
              className="p-5 space-y-4"
            >
              <input type="hidden" name="userId" value={deletingUser.id} />

              {/* Target User Summary Card */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-1.5">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Target Account</p>
                <p className="text-sm font-bold text-slate-900">{deletingUser.name}</p>
                <p className="text-xs text-slate-600 font-mono">{deletingUser.email}</p>
                <p className="text-xs text-slate-500">
                  Role: <span className="font-semibold text-slate-700">{roleById.get(userRoleMap.get(deletingUser.id) || "")?.name || "Manager"}</span>
                </p>
              </div>

              {/* Warning Notice */}
              <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-900 space-y-1">
                <p className="font-bold flex items-center gap-1.5 text-amber-800">
                  <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                  Security & Accounting Notice:
                </p>
                <p className="text-[11px] text-amber-800/90 leading-relaxed">
                  Authentication access for <strong>{deletingUser.email}</strong> will be revoked immediately and all active sessions will be terminated. Historical orders, payments, stock movements, and audit records created by this user will remain preserved for business integrity.
                </p>
              </div>

              {/* Reason Input */}
              <label className="block text-xs font-semibold text-slate-700">
                Reason for Deletion <span className="text-slate-400 font-normal">(Optional)</span>
                <input
                  type="text"
                  name="reason"
                  maxLength={200}
                  value={deleteReason}
                  onChange={(e) => setDeleteReason(e.target.value)}
                  placeholder="e.g. Employee offboarding / resignation"
                  className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
                />
              </label>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => setDeletingUser(null)}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isDeleting}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-red-700 transition disabled:opacity-50 cursor-pointer"
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Deleting Account...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-4 w-4" />
                      <span>Confirm Deletion</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
