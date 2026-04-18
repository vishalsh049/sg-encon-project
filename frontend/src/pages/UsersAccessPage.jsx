import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import axios from "axios";
import {
  BadgeCheck,
  Mail,
  Pencil,
  Plus,
  Search,
  Shield,
  Trash2,
  Users,
} from "lucide-react";
import { buildApiUrl, getAuthHeaders } from "../lib/api";

const initialUserForm = {
  name: "",
  designation: "",
  circle: "ALL",
  domain: "ALL",
  email: "",
  password: "",
  roleId: "",
  permissionIds: [],
  status: "active",
};

const initialRoleForm = {
  name: "",
  description: "",
  permissionIds: [],
  pageAccess: [], 
};

const circleOptions = [
  "Delhi",
  "Haryana",
  "Punjab",
  "Uttar Pradesh East",
];

const domainOptions = ["Fiber", "Utility", "FTTX", "HR", "Commercial"];
const pageAccessList = [
  { id: "dashboard", label: "Dashboard" },
  { id: "reports", label: "Reports" },
  { id: "billing", label: "Billing" },
  { id: "manpower", label: "Manpower" },
];

function UsersAccessPage() {
  const [activeTab, setActiveTab] = useState("users");
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [circleFilter, setCircleFilter] = useState("");
  const [domainFilter, setDomainFilter] = useState("");
  const [sortDirection, setSortDirection] = useState("desc");
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [editingRole, setEditingRole] = useState(null);
  const [userForm, setUserForm] = useState(initialUserForm);
  const [roleForm, setRoleForm] = useState(initialRoleForm);
  const [loading, setLoading] = useState(false);
  
  useEffect(() => {
  if (userModalOpen || roleModalOpen) {
    document.body.style.overflow = "hidden";
  } else {
    document.body.style.overflow = "auto";
  }
}, [userModalOpen, roleModalOpen]);

  const headers = useMemo(() => getAuthHeaders(), []);

  const permissionGroups = useMemo(() => {
    return permissions.reduce((acc, permission) => {
      const key = permission.category || "general";
      if (!acc[key]) acc[key] = [];
      acc[key].push(permission);
      return acc;
    }, {});
  }, [permissions]);

  const loadAccessData = async () => {
    setLoading(true);
    try {
      const [usersRes, rolesRes, permissionsRes] = await Promise.all([
        axios.get(buildApiUrl("/api/access/users"), { headers }),
        axios.get(buildApiUrl("/api/access/roles"), { headers }),
        axios.get(buildApiUrl("/api/access/permissions"), { headers }),
      ]);

      setUsers(usersRes.data?.rows || []);
      setRoles(rolesRes.data?.rows || []);
      setPermissions(permissionsRes.data?.rows || []);
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to load access data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAccessData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredUsers = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return [...users]
      .filter((user) => {
        const matchesSearch =
          !normalizedSearch ||
          [user.name, user.email, user.designation, user.circle, user.domain]
            .filter(Boolean)
            .some((value) =>
              String(value).toLowerCase().includes(normalizedSearch)
            );

        const matchesCircle = !circleFilter || user.circle === circleFilter;
        const matchesDomain = !domainFilter || user.domain === domainFilter;
        return matchesSearch && matchesCircle && matchesDomain;
      })
      .sort((a, b) => {
        const first = new Date(a.createdAt).getTime();
        const second = new Date(b.createdAt).getTime();
        return sortDirection === "desc" ? second - first : first - second;
      });
  }, [users, searchTerm, circleFilter, domainFilter, sortDirection]);

  const openAddUser = () => {
  console.log("OPEN USER MODAL");

  setEditingUser(null);
  setUserForm({
  ...initialUserForm,
  circle: "ALL",
  domain: "ALL",
 });
  setUserModalOpen(true);
};

  const openEditUser = (user) => {
    setEditingUser(user);
    setUserForm({
      name: user.name || "",
      designation: user.designation || "",
      circle: user.circle || "",
      domain: user.domain || "",
      email: user.email || "",
      password: "",
      roleId: String(user.roleId || ""),
      permissionIds: (user.permissions || []).map((permission) => permission.id),
      status: user.status || "active",
    });
    setUserModalOpen(true);
  };

  const openAddRole = () => {
    setEditingRole(null);
    setRoleForm(initialRoleForm);
    setRoleModalOpen(true);
  };

  const openEditRole = (role) => {
    setEditingRole(role);
    setRoleForm({
      name: role.name || "",
      description: role.description || "",
      permissionIds: (role.permissions || []).map((permission) => permission.id),
      pageAccess: role.pageAccess || [],
    });
    setRoleModalOpen(true);
  };

const handleGiveAllAccess = () => {
  // take all permission IDs from backend list
  const allPermissionIds = permissions.map((p) => p.id);

  setUserForm((prev) => ({
    ...prev,
    permissionIds: allPermissionIds,
  }));

  toast.success("All permissions selected");
};

const saveUser = async () => {
    console.log("SAVE CLICKED", userForm);
  // ✅ VALIDATION
if (
  !userForm.name ||
  !userForm.designation ||
  (!userForm.circle && userForm.circle !== "ALL") ||
  (!userForm.domain && userForm.domain !== "ALL") ||
  !userForm.email ||
  (!editingUser && !userForm.password)
) {
    console.log("VALIDATION FAILED", userForm);
    toast.error("All fields are required");
    return;
  }

  try {
    console.log("BEFORE API CALL");
    const payload = {
  ...userForm,
  roleId: userForm.roleId ? Number(userForm.roleId) : null,
  };
console.log("PAYLOAD", payload);

    if (editingUser) {
      await axios.put(
        buildApiUrl(`/api/access/users/${editingUser.id}`),
        payload,
        { headers }
      );
      toast.success("User updated successfully");
    } else {
      const res = await axios.post(
  buildApiUrl("/api/access/users"),
  payload,
  { headers }
);

toast.success("User created successfully");

// ✅ INSTANT UI UPDATE
setUsers((prev) => [
  {
    ...payload,
    id: res.data?.id || Date.now(),
    createdAt: new Date(),
  },
  ...prev,
]);
    }

    setUserModalOpen(false);
    setUserForm(initialUserForm);

  } catch (error) {
      console.log("ERROR FROM API", error); 
    toast.error(error.response?.data?.message || "Failed to save user");
  }
};

  const saveRole = async () => {
    try {
      if (editingRole) {
        await axios.put(buildApiUrl(`/api/access/roles/${editingRole.id}`), roleForm, {
          headers,
        });
      } else {
        await axios.post(buildApiUrl("/api/access/roles"), {
  ...roleForm,
  pageAccess: roleForm.pageAccess,
}, { headers });
      }

      setRoleModalOpen(false);
      setRoleForm(initialRoleForm);
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to save role");
    }
  };

  const deleteUser = async (userId) => {
  if (!window.confirm("Delete this user?")) return;

  try {
    await axios.delete(buildApiUrl(`/api/access/users/${userId}`), { headers });

    // ✅ REMOVE FROM UI
    setUsers((prev) => prev.filter((u) => u.id !== userId));

    toast.success("User deleted successfully");
  } catch (error) {
    toast.error(error.response?.data?.message || "Failed to delete user");
  }
};

  const deleteRole = async (roleId) => {
    if (!window.confirm("Delete this role?")) return;
    try {
      await axios.delete(buildApiUrl(`/api/access/roles/${roleId}`), { headers });
      toast.success("User deleted successfully");
      toast.success("Role deleted successfully");
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to delete role");
    }
  };

  const toggleUserStatus = async (user) => {
  const nextStatus = user.status === "active" ? "inactive" : "active";

  try {
    await axios.put(
      buildApiUrl(`/api/access/users/${user.id}/status`),
      { status: nextStatus },
      { headers }
    );

    // ✅ UPDATE UI INSTANTLY
    setUsers((prev) =>
      prev.map((u) =>
        u.id === user.id ? { ...u, status: nextStatus } : u
      )
    );

    toast.success("User status updated");
  } catch (error) {
    toast.error(error.response?.data?.message || "Failed to update status");
  }
};

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="app-surface overflow-hidden p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.28em] text-text-muted">
              Roles & Permissions
            </div>
            <h1 className="mt-2 text-3xl font-semibold text-text-primary">
              Users & Access
            </h1>
          </div>

          <button
  type="button"
  disabled={loading}
  onClick={() => {
    console.log("CLICK WORKING");

    if (loading) return;

    if (activeTab === "users") {
      openAddUser();
    } else {
      openAddRole();
    }
  }}
  className="app-button-primary gap-2 disabled:opacity-50"
>
  <Plus size={16} />
  {loading ? "Loading..." : activeTab === "users" ? "Add User" : "Add Role"}
</button>
        </div>

      </div>

      <div className="flex gap-3">
        {[
          { id: "users", label: "Users", icon: Users },
          { id: "roles", label: "Roles & Permissions", icon: Shield },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium transition ${
                active
                  ? "bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-md"
                  : "app-button-ghost"
              }`}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === "users" ? (
        <>
          <div className="app-surface p-4">
            <div className="grid gap-4 md:grid-cols-[1fr_220px_220px_180px]">
              <label className="relative block">
                <Search
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
                />
                <input
                  type="text"
                  placeholder="Search by name, email, designation, circle, or domain"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="app-input w-full pl-10"
                />
              </label>

              <select
                value={circleFilter}
                onChange={(e) => setCircleFilter(e.target.value)}
                className="app-select"
              >
                <option value="">All Circles</option>
                {circleOptions.map((circle) => (
                  <option key={circle} value={circle}>
                    {circle}
                  </option>
                ))}
              </select>

              <select
                value={domainFilter}
                onChange={(e) => setDomainFilter(e.target.value)}
                className="app-select"
              >
                <option value="">All Domains</option>
                {domainOptions.map((domain) => (
                  <option key={domain} value={domain}>
                    {domain}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() =>
                  setSortDirection((prev) => (prev === "desc" ? "asc" : "desc"))
                }
                className="app-button-ghost"
              >
                Sort: {sortDirection === "desc" ? "Newest" : "Oldest"}
              </button>
            </div>
          </div>

          <div className="app-table-wrap">
            <table className="app-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Designation</th>
                  <th>Circle</th>
                  <th>Domain</th>
                  <th>Status</th>
                  <th>Created Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7}>Loading...</td>
                  </tr>
                ) : filteredUsers.length ? (
                  filteredUsers.map((user) => (
                    <tr key={user.id}>
                      <td className="text-text-primary">
                        <div className="font-medium text-text-primary">{user.name}</div>
                        <div className="mt-1 inline-flex items-center gap-1 text-xs text-text-secondary">
                          <Mail size={12} />
                          {user.email}
                        </div>
                      </td>
                      <td>{user.designation || "-"}</td>
                      <td>{user.circle || "-"}</td>
                      <td>{user.domain || "-"}</td>
                      <td>
                        <button
                          type="button"
                          onClick={() => toggleUserStatus(user)}
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            user.status === "active"
                              ? "bg-success/15 text-success"
                              : "bg-danger/15 text-danger"
                          }`}
                        >
                          {user.status === "active" ? "Active" : "Inactive"}
                        </button>
                      </td>
                      <td>
                        {user.createdAt
                          ? new Date(user.createdAt).toLocaleDateString("en-GB")
                          : "-"}
                      </td>
                      <td>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => openEditUser(user)}
                            className="text-primary"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteUser(user.id)}
                            className="text-danger"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7}>No users found</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
          <div className="app-surface p-6">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">Roles</h2>
                <p className="mt-1 text-sm text-text-secondary">
                  Create permission bundles for common access patterns.
                </p>
              </div>
              <button type="button" onClick={openAddRole} className="app-button-primary gap-2">
                <Plus size={16} />
                Add Role
              </button>
            </div>

            <div className="space-y-4">
              {roles.map((role) => (
                <div key={role.id} className="rounded-2xl border border-border-color bg-surface-muted p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-base font-semibold text-text-primary">
                        {role.name}
                      </div>
                      <div className="mt-1 text-sm text-text-secondary">
                        {role.description || "No description"}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => openEditRole(role)}
                        className="text-primary"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteRole(role.id)}
                        className="text-danger"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {(role.permissions || []).map((permission) => (
                      <span
                        key={permission.id}
                        className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
                      >
                        {permission.name}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="app-surface p-6">
            <div className="mb-4 flex items-center gap-2">
              <BadgeCheck size={18} className="text-primary" />
              <h2 className="text-lg font-semibold text-text-primary">
                Permission Library
              </h2>
            </div>

            <div className="space-y-4">
              {Object.entries(permissionGroups).map(([group, groupPermissions]) => (
                <div key={group} className="rounded-2xl border border-border-color bg-surface-muted p-4">
                  <div className="mb-3 text-xs font-semibold uppercase tracking-[0.24em] text-text-muted">
                    {group.replace("_", " ")}
                  </div>
                  <div className="space-y-2">
                    {groupPermissions.map((permission) => (
                      <div key={permission.id} className="text-sm text-text-secondary">
                        {permission.displayName}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

 {userModalOpen ? (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
    onClick={() => setUserModalOpen(false)}
>
         <div
  className="app-surface w-full max-w-4xl p-0 max-h-[90vh] flex flex-col rounded-2xl shadow-2xl"
  onClick={(e) => e.stopPropagation()}
>
  {/* HEADER */}
<div className="flex items-center justify-between border-b border-border-color px-6 py-4">
  <h3 className="text-lg font-semibold text-text-primary">
    {editingUser ? "Edit User" : "Add User"}
  </h3>

  <button
    onClick={() => setUserModalOpen(false)}
    className="text-text-muted hover:text-danger text-lg"
  >
    ✕
  </button>
</div>

{/* BODY START */}
<div className="p-6 overflow-y-auto flex-1">
            
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <input
                type="text"
                placeholder="Name"
                value={userForm.name}
                onChange={(e) =>
                  setUserForm((prev) => ({ ...prev, name: e.target.value }))
                }
                className="app-input rounded-xl focus:ring-2 focus:ring-indigo-500/30"
              />
              <input
                type="text"
                placeholder="Designation"
                value={userForm.designation}
                onChange={(e) =>
                  setUserForm((prev) => ({ ...prev, designation: e.target.value }))
                }
                className="app-input rounded-xl focus:ring-2 focus:ring-indigo-500/30"
              />
              <select
                value={userForm.circle}
                onChange={(e) =>
                  setUserForm((prev) => ({ ...prev, circle: e.target.value }))
                }
                className="app-select"
              >
                <option value="">Select Circle</option>
                <option value="ALL">All Circles</option>
                {circleOptions.filter(c => c !== "ALL").map((circle) => (
                  <option key={circle} value={circle}>
                    {circle}
                  </option>
                ))}
              </select>
              <select
                value={userForm.domain}
                onChange={(e) =>
                  setUserForm((prev) => ({ ...prev, domain: e.target.value }))
                }
                className="app-select"
              >
                <option value="">Select Domain</option>
                <option value="ALL">All Domains</option>
                {domainOptions.map((domain) => (
                  <option key={domain} value={domain}>
                    {domain}
                  </option>
                ))}
              </select>
              <input
                type="email"
                placeholder="Email"
                value={userForm.email}
                onChange={(e) =>
                  setUserForm((prev) => ({ ...prev, email: e.target.value }))
                }
                className="app-input rounded-xl focus:ring-2 focus:ring-indigo-500/30"
              />
              <input
                type="password"
                placeholder={editingUser ? "Leave blank to keep password" : "Password"}
                value={userForm.password}
                onChange={(e) =>
                  setUserForm((prev) => ({ ...prev, password: e.target.value }))
                }
                className="app-input rounded-xl focus:ring-2 focus:ring-indigo-500/30"
              />
              <select
                value={userForm.roleId}
                onChange={(e) =>
                  setUserForm((prev) => ({ ...prev, roleId: e.target.value }))
                }
                className="app-select"
              >
                <option value="">No Role Bundle</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
              <select
                value={userForm.status}
                onChange={(e) =>
                  setUserForm((prev) => ({ ...prev, status: e.target.value }))
                }
                className="app-select"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>

              <div className="md:col-span-2 rounded-2xl border border-border-color bg-gradient-to-br from-gray-50 to-white p-4 shadow-sm border border-gray-100">
                <div className="mb-3 flex items-center justify-between">
             <div className="text-sm font-semibold tracking-wide text-gray-600 text-text-primary">
             Direct Permissions
             </div>

             <button          
             type="button"
            onClick={handleGiveAllAccess}
             className="text-xs bg-indigo-600 text-white px-3 py-1 rounded-md hover:bg-indigo-700"
                >
            Give All Access
            </button>
              </div>
                <div className="grid gap-4 md:grid-cols-2">
                  {Object.entries(permissionGroups).map(([group, groupPermissions]) => (
                    <div key={group} className="rounded-2xl border border-border-color bg-surface p-4">
                      <div className="mb-3 text-xs font-semibold uppercase tracking-[0.24em] text-text-muted">
                        {group.replace("_", " ")}
                      </div>
                      <div className="space-y-3">
                        {groupPermissions.map((permission) => (
                          <label
                            key={permission.id}
                            className="flex items-center gap-3 text-sm text-text-secondary"
                          >
                            <input
                              type="checkbox"
                              checked={userForm.permissionIds.includes(permission.id)}
                              onChange={(e) =>
                                setUserForm((prev) => ({
                                  ...prev,
                                  permissionIds: e.target.checked
                                    ? [...prev.permissionIds, permission.id]
                                    : prev.permissionIds.filter((id) => id !== permission.id),
                                }))
                              }
                            />
                            <span>{permission.displayName}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            </div>
            <div className="border-t border-border-color px-6 py-4 flex justify-end gap-3">
              <button type="button" onClick={() => setUserModalOpen(false)} className="app-button-ghost">
                Cancel
              </button>
              <button type="button" onClick={saveUser} className="app-button-primary">
                Save User
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {roleModalOpen ? (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center bg-overlay/45 p-4 overflow-y-auto"
    onClick={() => setRoleModalOpen(false)}
>
          <div
  className="app-surface w-full max-w-3xl p-6 max-h-[90vh] overflow-y-auto"
  onClick={(e) => e.stopPropagation()}
>
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border-color bg-surface px-6 py-4">
  <h3 className="text-lg font-semibold text-text-primary">
    {editingUser ? "Edit User" : "Add User"}
  </h3>

  <button
    onClick={() => setUserModalOpen(false)}
    className="text-text-muted hover:text-danger text-lg"
  >
    ✕
  </button>
</div>
            <div className="mt-5 grid gap-4">
              <input
                type="text"
                placeholder="Role Name"
                value={roleForm.name}
                onChange={(e) =>
                  setRoleForm((prev) => ({ ...prev, name: e.target.value }))
                }
                className="app-input rounded-xl focus:ring-2 focus:ring-indigo-500/30"
              />
              <textarea
                placeholder="Description"
                value={roleForm.description}
                onChange={(e) =>
                  setRoleForm((prev) => ({ ...prev, description: e.target.value }))
                }
                className="min-h-[90px] rounded-xl border border-border-color bg-surface px-4 py-3 text-sm text-text-primary outline-none focus:border-primary"
              />

              <div className="rounded-2xl border border-border-color bg-gradient-to-br from-gray-50 to-white p-4 shadow-sm border border-gray-100">
  <div className="mb-3 text-sm font-semibold tracking-wide text-gray-600 text-text-primary">
    Page Access
  </div>

  <div className="grid grid-cols-2 gap-3">
    {pageAccessList.map((page) => (
      <label key={page.id} className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={roleForm.pageAccess?.includes(page.id)}
          onChange={(e) =>
            setRoleForm((prev) => ({
              ...prev,
              pageAccess: e.target.checked
                ? [...(prev.pageAccess || []), page.id]
                : prev.pageAccess.filter((p) => p !== page.id),
            }))
          }
        />
        {page.label}
      </label>
    ))}
  </div>
</div>

              <div className="grid gap-4 md:grid-cols-2">
                {Object.entries(permissionGroups).map(([group, groupPermissions]) => (
                  <div key={group} className="rounded-2xl border border-border-color bg-gradient-to-br from-gray-50 to-white p-4 shadow-sm border border-gray-100">
                    <div className="mb-3 text-xs font-semibold uppercase tracking-[0.24em] text-text-muted">
                      {group.replace("_", " ")}
                    </div>
                    <div className="space-y-3">
                      {groupPermissions.map((permission) => (
                        <label key={permission.id} className="flex items-center gap-3 text-sm text-text-secondary">
                          <input
                            type="checkbox"
                            checked={roleForm.permissionIds.includes(permission.id)}
                            onChange={(e) =>
                              setRoleForm((prev) => ({
                                ...prev,
                                permissionIds: e.target.checked
                                  ? [...prev.permissionIds, permission.id]
                                  : prev.permissionIds.filter((id) => id !== permission.id),
                              }))
                            }
                          />
                          <span>{permission.displayName}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="sticky bottom-0 bg-surface border-t border-border-color px-6 py-4 flex justify-end gap-3">
              <button type="button" onClick={() => setRoleModalOpen(false)} className="app-button-ghost">
                Cancel
              </button>
              <button type="button" onClick={saveRole} className="app-button-primary">
                Save Role
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default UsersAccessPage;
