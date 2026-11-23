import { useEffect, useState, type FormEvent } from "react";
import {
  CheckCircle2,
  KeyRound,
  Lock,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  UserPlus,
  Users as UsersIcon,
  XCircle,
} from "lucide-react";
import { api } from "../services/api";
import { useToast } from "../components/Toast";
import { EmptyState, Modal, PageHeader, TableSkeleton } from "../components/ui";

type UserRecord = {
  id: number;
  username: string;
  role: string;
  is_active: boolean;
};

type RoleRecord = {
  name: string;
  description: string;
};

export default function Users({ role }: { role: string }) {
  const toast = useToast();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [roles, setRoles] = useState<RoleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Create User Modal
  const [openCreate, setOpenCreate] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("salesman");
  const [submittingCreate, setSubmittingCreate] = useState(false);

  // Reset Password Modal
  const [resetTarget, setResetTarget] = useState<UserRecord | null>(null);
  const [resetPasswordVal, setResetPasswordVal] = useState("");
  const [submittingReset, setSubmittingReset] = useState(false);

  async function loadData() {
    setLoading(true);
    try {
      const data = await api<any>("/api/masters");
      setUsers(data.users || []);
      setRoles(data.roles || []);
      if (!newRole && data.roles?.length) {
        setNewRole(data.roles[0].name);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to load user accounts");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function handleCreateUser(e: FormEvent) {
    e.preventDefault();
    if (!newUsername || !newPassword || !newRole) {
      toast.error("Please fill in username, password and role");
      return;
    }

    setSubmittingCreate(true);
    try {
      await api("/api/users", {
        method: "POST",
        body: JSON.stringify({
          username: newUsername,
          password: newPassword,
          role: newRole,
        }),
      });

      toast.success(`User ${newUsername} created with role ${newRole}`);
      setOpenCreate(false);
      setNewUsername("");
      setNewPassword("");
      await loadData();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSubmittingCreate(false);
    }
  }

  async function toggleUserStatus(user: UserRecord) {
    try {
      await api(`/api/users/${user.id}`, {
        method: "PUT",
        body: JSON.stringify({ is_active: !user.is_active }),
      });

      toast.info(`Account ${user.username} is now ${!user.is_active ? "Active" : "Disabled"}`);
      await loadData();
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  async function handleResetPassword(e: FormEvent) {
    e.preventDefault();
    if (!resetTarget || !resetPasswordVal) return;

    setSubmittingReset(true);
    try {
      await api(`/api/users/${resetTarget.id}`, {
        method: "PUT",
        body: JSON.stringify({ password: resetPasswordVal }),
      });

      toast.success(`Password updated for ${resetTarget.username}`);
      setResetTarget(null);
      setResetPasswordVal("");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSubmittingReset(false);
    }
  }

  const filteredUsers = users.filter((u) => {
    const q = search.toLowerCase();
    return !q || u.username.toLowerCase().includes(q) || u.role.toLowerCase().includes(q);
  });

  const roleBadge = (r: string) => {
    switch (r) {
      case "admin":
        return <span className="status-badge status-active">Admin</span>;
      case "production":
        return <span className="status-badge status-pending">Production</span>;
      case "salesman":
        return <span className="status-badge status-draft">Sales Rep</span>;
      case "auditor":
        return <span className="status-badge status-reversal">Auditor</span>;
      case "owner":
        return <span className="status-badge status-completed">Owner</span>;
      default:
        return <span className="status-badge status-draft">{r}</span>;
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="SYSTEM GOVERNANCE"
        title="User & Access Management"
        description="Role-based access control (RBAC), credential management, active session policies, and factory operator accounts."
        actions={
          <div className="flex items-center gap-2">
            <button onClick={() => setOpenCreate(true)} className="primary-btn">
              <UserPlus size={15} /> Create User Account
            </button>
            <button onClick={() => void loadData()} className="secondary-btn">
              Refresh
            </button>
          </div>
        }
      />

      {/* KPI METRIC CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#657580] uppercase tracking-wider">Total Accounts</span>
            <div className="w-8 h-8 rounded bg-[#142B3B]/10 text-[#142B3B] flex items-center justify-center font-bold">
              <UsersIcon size={16} />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-[#142B3B]">{users.length}</div>
          <div className="text-[11px] text-[#657580] mt-1">Configured factory system identities</div>
        </div>

        <div className="card p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#657580] uppercase tracking-wider">Active Operators</span>
            <div className="w-8 h-8 rounded bg-[#21865B]/10 text-[#21865B] flex items-center justify-center font-bold">
              <UserCheck size={16} />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-[#21865B]">
            {users.filter((u) => u.is_active).length}
          </div>
          <div className="text-[11px] text-[#657580] mt-1">Enabled for authentication and transactions</div>
        </div>

        <div className="card p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#657580] uppercase tracking-wider">Configured Roles</span>
            <div className="w-8 h-8 rounded bg-[#087F8C]/10 text-[#087F8C] flex items-center justify-center font-bold">
              <ShieldCheck size={16} />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-[#087F8C]">{roles.length}</div>
          <div className="text-[11px] text-[#657580] mt-1">Granular RBAC permission tiers</div>
        </div>
      </div>

      {/* USERS TABLE */}
      <div className="card p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#DFE3E6]">
          <div>
            <h3 className="font-semibold text-[#142B3B] text-sm">Operator Directory</h3>
            <p className="text-xs text-[#657580]">Manage user permissions and security credentials</p>
          </div>

          <div className="relative w-full sm:w-64">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#657580]" />
            <input
              className="field pl-9 py-1 text-xs"
              placeholder="Search username, role..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <TableSkeleton rows={5} />
        ) : filteredUsers.length === 0 ? (
          <EmptyState
            title="No user accounts found"
            description="No users match your search criteria."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Username</th>
                  <th>Assigned Role</th>
                  <th>Account Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-[#F5F6F2]/60">
                    <td className="font-mono text-xs text-[#657580]">#{user.id}</td>
                    <td className="font-semibold text-[#142B3B]">{user.username}</td>
                    <td>{roleBadge(user.role)}</td>
                    <td>
                      {user.is_active ? (
                        <span className="inline-flex items-center gap-1 text-xs text-[#21865B] font-medium">
                          <CheckCircle2 size={13} /> Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-[#D64B4B] font-medium">
                          <XCircle size={13} /> Disabled
                        </span>
                      )}
                    </td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => setResetTarget(user)}
                          className="secondary-btn !py-1 text-xs"
                          title="Reset user password"
                        >
                          <KeyRound size={12} /> Reset Password
                        </button>

                        <button
                          onClick={() => toggleUserStatus(user)}
                          className={`secondary-btn !py-1 text-xs ${
                            user.is_active
                              ? "!text-[#D64B4B] hover:!bg-[#D64B4B]/10"
                              : "!text-[#21865B] hover:!bg-[#21865B]/10"
                          }`}
                          title={user.is_active ? "Disable account" : "Enable account"}
                        >
                          {user.is_active ? "Disable" : "Enable"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* CREATE USER MODAL */}
      <Modal
        open={openCreate}
        onClose={() => setOpenCreate(false)}
        title="Create New User Account"
        description="Provision a new credentialed login for factory floor or administrative staff."
      >
        <form onSubmit={handleCreateUser} className="space-y-4">
          <label className="field-label">
            Username *
            <input
              required
              className="field mt-1"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              placeholder="e.g. shift_lead_b"
            />
          </label>

          <label className="field-label">
            Assigned Role *
            <select
              className="field mt-1"
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              required
            >
              {roles.map((r) => (
                <option key={r.name} value={r.name}>
                  {r.name} — {r.description}
                </option>
              ))}
            </select>
          </label>

          <label className="field-label">
            Initial Password *
            <input
              type="password"
              required
              className="field mt-1"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••"
            />
          </label>

          <div className="flex justify-end gap-2 pt-3 border-t border-[#DFE3E6]">
            <button
              type="button"
              onClick={() => setOpenCreate(false)}
              className="secondary-btn"
            >
              Cancel
            </button>
            <button type="submit" disabled={submittingCreate} className="primary-btn">
              Create Account
            </button>
          </div>
        </form>
      </Modal>

      {/* RESET PASSWORD MODAL */}
      <Modal
        open={Boolean(resetTarget)}
        onClose={() => setResetTarget(null)}
        title={`Reset Password for ${resetTarget?.username}`}
        description="Assign a new password to this account."
      >
        <form onSubmit={handleResetPassword} className="space-y-4">
          <label className="field-label">
            New Password *
            <input
              type="password"
              required
              className="field mt-1"
              value={resetPasswordVal}
              onChange={(e) => setResetPasswordVal(e.target.value)}
              placeholder="Enter new password"
            />
          </label>

          <div className="flex justify-end gap-2 pt-3 border-t border-[#DFE3E6]">
            <button
              type="button"
              onClick={() => setResetTarget(null)}
              className="secondary-btn"
            >
              Cancel
            </button>
            <button type="submit" disabled={submittingReset} className="primary-btn">
              Update Password
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
