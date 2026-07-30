import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import {
  Mail,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";

import { buildApiUrl } from "../lib/api";

const initialUserForm = {
   name: "",
  designation: "",
  circle: "ALL",
  domain: "ALL",
  username: "",
  email: "",
  password: "",
  status: "active",
  pagePermissions: [],
};

const circleOptions = [
  "Delhi",
  "Haryana",
  "Punjab",
  "Uttar Pradesh East",
];

const domainOptions = [
  "Fiber",
  "Utility",
  "FTTX",
  "HR",
  "Commercial",
];

const pageAccessList = [
  {
    title: "Dashboard",
    pages: ["dashboard"],
  },

  {
    title: "Billing",
    pages: [
      "billing-dashboard",
      "billing-status",
      "revenue",
    ],
  },

  {
    title: "Penalty",
    pages: [
      "kpis-penalty",
      "general-penalties",
    ],
  },

{
  title: "Manpower",
 pages: [
 "HR Dashboard",
 "HR Analytics V2",
 "Physical",
 "Scrum",
 "Scrum Dashboard",
 "New Joining",
 "Signoff",
],
},

  {
    title: "Training",
    pages: ["Training"],
  },

  {
    title: "Reports",
    pages: ["tower-reports", "kpi-dashboard"],
  },

  {
    title: "Fiber Reports",
    pages: [
      "nso-reports",
      "fiber-reports",
    ],
  },

  {
    title: "Users & Access",
    pages: ["users"],
  },
];


function UsersAccessPage() {
  const [users, setUsers] = useState([]);
  const [searchTerm, setSearchTerm] =
    useState("");

  const [circleFilter, setCircleFilter] =
    useState("");

  const [domainFilter, setDomainFilter] =
    useState("");

  const [sortDirection, setSortDirection] =
    useState("desc");

  const [loading, setLoading] =
    useState(false);

   const [saving, setSaving] = useState(false);

  const [userModalOpen, setUserModalOpen] =
    useState(false);

  const [editingUser, setEditingUser] =
    useState(null);

  const [userForm, setUserForm] =
    useState(initialUserForm);

  const [showPassword, setShowPassword] =
    useState(false);

const generatePassword = () => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

  const p1 =
    chars[Math.floor(Math.random() * chars.length)];

  const p2 =
    Math.floor(Math.random() * 10);

  const p3 =
    chars[Math.floor(Math.random() * chars.length)];

  const p4 =
    Math.floor(Math.random() * 10);

  const p5 =
    chars[Math.floor(Math.random() * chars.length)];

  return `SGE@${p1}${p2}${p3}${p4}${p5}`;
};

  const handleGeneratePassword = () => {
    setUserForm((prev) => ({
      ...prev,
      password: generatePassword(12),
    }));
    setShowPassword(true);
  };

  const headers = useMemo(
    () => ({
      Authorization: `Bearer ${localStorage.getItem(
        "token"
      )}`,
    }),
    []
  );

  useEffect(() => {
    document.body.style.overflow =
      userModalOpen ? "hidden" : "auto";

    return () => {
      document.body.style.overflow =
        "auto";
    };
  }, [userModalOpen]);

  const loadAccessData = async () => {
    setLoading(true);

    try {
      const usersRes = await axios.get(
        buildApiUrl("/api/access/users"),
        { headers }
      );

      setUsers(usersRes.data?.rows || []);
    } catch (error) {
      toast.error(
        error.response?.data?.message ||
          "Failed to load users"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAccessData();
  }, []);

  const filteredUsers = useMemo(() => {
    const normalizedSearch =
      searchTerm.trim().toLowerCase();

    return [...users]
      .filter((user) => {
        const matchesSearch =
          !normalizedSearch ||
         [
           user.name,
           user.username,
           user.designation,
           user.circle,
           user.domain,
        ]
            .filter(Boolean)
            .some((value) =>
              String(value)
                .toLowerCase()
                .includes(normalizedSearch)
            );

        const matchesCircle =
          !circleFilter ||
          user.circle === circleFilter;

        const matchesDomain =
          !domainFilter ||
          user.domain === domainFilter;

        return (
          matchesSearch &&
          matchesCircle &&
          matchesDomain
        );
      })
      .sort((a, b) => {
        const firstDate = new Date(
          a.createdAt || 0
        ).getTime();

        const secondDate = new Date(
          b.createdAt || 0
        ).getTime();

        return sortDirection === "desc"
          ? secondDate - firstDate
          : firstDate - secondDate;
      });
  }, [
    users,
    searchTerm,
    circleFilter,
    domainFilter,
    sortDirection,
  ]);

  const openAddUser = () => {
    setEditingUser(null);

    setUserForm(initialUserForm);
    setShowPassword(false);

    setUserModalOpen(true);
  };

  const openEditUser = (user) => {
    setEditingUser(user);
    setShowPassword(false);

    setUserForm({
      name: user.name || "",
      designation:
        user.designation || "",
      circle: user.circle || "ALL",
      domain: user.domain || "ALL",
      username: user.username || "",
      email: user.email || "",
      password: "",
      status: user.status || "active",
      pagePermissions:
        user.pagePermissions || [],
    });

    setUserModalOpen(true);
  };

  const saveUser = async () => {
  setSaving(true);

  try {
    if (
      !userForm.name.trim() ||
      !userForm.designation.trim() ||
      !userForm.username.trim() ||
      !userForm.email.trim() ||
      !userForm.circle.trim() ||
      !userForm.domain.trim() ||
      (!editingUser && !userForm.password.trim())
    ) {
      toast.error(
        "All required user fields must be filled"
      );
      return;
    }

    const payload = {
      name: userForm.name.trim(),
      designation: userForm.designation.trim(),
      username: userForm.username.trim(),
      email: userForm.email.trim().toLowerCase(),
      password: userForm.password,
      circle: userForm.circle,
      domain: userForm.domain,
      status: userForm.status,
      pagePermissions:
        userForm.pagePermissions || [],
    };

    if (editingUser) {
      await axios.put(
        buildApiUrl(
          `/api/access/users/${editingUser.id}`
        ),
        payload,
        { headers }
      );

      toast.success(
        "User updated successfully"
      );

      // Refresh logged-in session if editing current user
      const sessionUser = JSON.parse(
        localStorage.getItem("sessionUser")
      );

      if (
        sessionUser?.id === editingUser.id
      ) {
        localStorage.setItem(
          "sessionUser",
          JSON.stringify({
            ...sessionUser,
            pagePermissions:
              payload.pagePermissions,
            pageAccess:
              payload.pagePermissions
                .filter((p) => p.view)
                .map((p) => p.page),
          })
        );
      }
    } else {
      await axios.post(
        buildApiUrl("/api/access/users"),
        payload,
        { headers }
      );

      toast.success(
        "User created successfully"
      );
    }

    // Close popup immediately
    setUserModalOpen(false);
    setEditingUser(null);
    setUserForm(initialUserForm);

    // Refresh users in background
    loadAccessData();

  } catch (error) {
    toast.error(
      error.response?.data?.message ||
      "Failed to save user"
    );
  } finally {
    setSaving(false);
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

    toast.success(
      nextStatus === "active" ? "User activated" : "User deactivated"
    );

    loadAccessData();
  } catch (error) {
    toast.error(
      error.response?.data?.message || "Failed to update user status"
    );
  }
};

const deleteUser = async (id) => {
  const confirmDelete = window.confirm(
    "Delete this user? This cannot be undone."
  );
  if (!confirmDelete) return;

  try {
    await axios.delete(
      buildApiUrl(`/api/access/users/${id}`),
      { headers }
    );

    toast.success("User deleted successfully");
    loadAccessData();
  } catch (error) {
    toast.error(
      error.response?.data?.message || "Failed to delete user"
    );
  }
};

  return (
    <div className="mx-auto max-w-7xl">
      <div className="app-surface overflow-hidden mb-2">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between px-4 py-2">
          <div>
            <h1 className="text-xl font-semibold text-text-primary">
              Users & Access
            </h1>
          </div>

          <button
            type="button"
            disabled={loading}
            onClick={openAddUser}
            className="app-button-primary gap-2 disabled:opacity-50"
          >
            <Plus size={16} />
            Add User
          </button>
        </div>
      </div>

      <div className="app-surface p-2 mb-2">
        <div className="grid gap-4 md:grid-cols-[1fr_220px_220px_180px]">

          <label className="relative block">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
            />

            <input
              type="text"
              placeholder="Search by name, username, designation, circle, or domain"
              value={searchTerm}
              onChange={(e) =>
                setSearchTerm(
                  e.target.value
                )
              }
              className="app-input w-full pl-10"
            />
          </label>

          <select
            value={circleFilter}
            onChange={(e) =>
              setCircleFilter(
                e.target.value
              )
            }
            className="app-select"
          >
            <option value="">
              All Circles
            </option>

            {circleOptions.map(
              (circle) => (
                <option
                  key={circle}
                  value={circle}
                >
                  {circle}
                </option>
              )
            )}
          </select>

          <select
            value={domainFilter}
            onChange={(e) =>
              setDomainFilter(
                e.target.value
              )
            }
            className="app-select"
          >
            <option value="">
              All Domains
            </option>

            {domainOptions.map(
              (domain) => (
                <option
                  key={domain}
                  value={domain}
                >
                  {domain}
                </option>
              )
            )}
          </select>

          <button
            type="button"
            onClick={() =>
              setSortDirection(
                (prev) =>
                  prev === "desc"
                    ? "asc"
                    : "desc"
              )
            }
            className="app-button-ghost"
          >
            Sort:{" "}
            {sortDirection === "desc"
              ? "Newest"
              : "Oldest"}
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
                <td colSpan={7}>
                  Loading...
                </td>
              </tr>
            ) : filteredUsers.length ? (
              filteredUsers.map(
                (user) => (
                  <tr key={user.id}>
                    <td>
                      <div className="font-medium text-text-primary">
                        {user.name || "-"}
                      </div>

                      <div className="mt-1 text-xs text-text-secondary">
                       Username: {user.username || "-"}
                     </div>

<div className="mt-1 inline-flex items-center gap-1 text-xs text-text-secondary">
  <Mail size={12} />
  {user.email || "-"}
</div>
                    </td>

                    <td>
                      {user.designation || "-"}
                    </td>

                    <td>
                      {user.circle || "-"}
                    </td>

                    <td>
                      {user.domain || "-"}
                    </td>

                    <td>
                      <button
                        type="button"
                        onClick={() =>
                          toggleUserStatus(
                            user
                          )
                        }
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          user.status ===
                          "active"
                            ? "bg-success/15 text-success"
                            : "bg-danger/15 text-danger"
                        }`}
                      >
                        {user.status ===
                        "active"
                          ? "Active"
                          : "Inactive"}
                      </button>
                    </td>

                    <td>
                      {user.createdAt
                        ? new Date(
                            user.createdAt
                          ).toLocaleDateString(
                            "en-GB"
                          )
                        : "-"}
                    </td>

                    <td>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() =>
                            openEditUser(
                              user
                            )
                          }
                          className="text-primary"
                        >
                          <Pencil size={16} />
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            deleteUser(
                              user.id
                            )
                          }
                          className="text-danger"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              )
            ) : (
              <tr>
                <td colSpan={7}>
                  No users found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

{userModalOpen ? (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center bg-overlay/40 p-4 backdrop-blur-sm"
    onClick={() => setUserModalOpen(false)}
  >
    <div
  className="relative flex h-[95vh] w-full max-w-8xl flex-col overflow-hidden rounded-[22px] border border-border-color/70 bg-surface shadow-[0_40px_90px_rgba(15,23,42,0.18)]"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="relative overflow-hidden bg-gradient-to-r from-purple-600 via-violet-600 to-indigo-600 px-6 py-4 sm:px-6 sm:py-2 flex items-center">

  <div className="relative flex items-center justify-between w-full">
    <div className="flex items-start gap-4">
      <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-surface/15 text-white shadow-slate-950/20 ring-1 ring-white/30">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4 text-white" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 12c2.761 0 5-2.239 5-5s-2.239-5-5-5-5 2.239-5 5 2.239 5 5 5z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 21c0-4.418 3.582-8 8-8s8 3.582 8 8" />
        </svg>
      </div>
      <div>
      
       <h3 className="text-lg font-semibold text-white">
          {editingUser ? "Edit User" : "Add User"}
        </h3>
       <p className=" text-sm text-white/80">
          Create and manage user access permissions
        </p>
      </div>
    </div>

    <button
      type="button"
      onClick={() => setUserModalOpen(false)}
      className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/20 bg-surface/10 text-white transition hover:bg-surface/20"
      aria-label="Close modal"
    >
      ✕
    </button>
  </div>
</div>

<div className="grid flex-1 min-h-0 gap-2 bg-surface-muted px-4 py-2 md:grid-cols-[32%_68%] overflow-hidden">
    <div className="h-full overflow-y-auto rounded-[18px] border border-border-color/80 bg-surface px-4 py-3 shadow-sm">
      <div>
        <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-text-muted">
          User Information
        </p>
        <p className=" text-xs text-text-muted">
          Add the user details to create the account.
        </p>
      </div>

      <div className="mt-2 space-y-2 flex-1 overflow-y-auto pr-2">
        <label className="block space-y-0">
          <span className="text-sm px-1 font-semibold text-text-secondary">Name</span>
          <input
            type="text"
            placeholder="Enter User Name"
            value={userForm.name}
            onChange={(e) =>
              setUserForm((prev) => ({
                ...prev,
                name: e.target.value,
              }))
            }
            className="h-9 w-full rounded-xl border border-border-color bg-surface-muted px-4 text-sm text-text-primary transition focus:border-indigo-500 focus:bg-surface focus:ring-4 focus:ring-indigo-100"
          />
        </label>

        <label className="block space-y-0">
          <span className="text-sm px-1 font-semibold text-text-secondary">Designation</span>
          <input
            type="text"
            placeholder="Enter Designation"
            value={userForm.designation}
            onChange={(e) =>
              setUserForm((prev) => ({
                ...prev,
                designation: e.target.value,
              }))
            }
            className="h-9 w-full rounded-xl border border-border-color bg-surface-muted px-4 text-sm text-text-primary transition focus:border-indigo-500 focus:bg-surface focus:ring-4 focus:ring-indigo-100"
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-0">
            <span className="text-sm px-1 font-semibold text-text-secondary">Circle</span>
            <select
              value={userForm.circle}
              onChange={(e) =>
                setUserForm((prev) => ({
                  ...prev,
                  circle: e.target.value,
                }))
              }
              className="h-9 w-full rounded-xl border border-border-color bg-surface-muted px-4 text-sm text-text-primary focus:border-indigo-500 focus:bg-surface focus:ring-4 focus:ring-indigo-100"
            >
              <option value="">Select Circle</option>
              <option value="ALL">All Circles</option>
              {circleOptions.map((circle) => (
                <option key={circle} value={circle}>
                  {circle}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-0">
            <span className="text-sm px-1 font-semibold text-text-secondary">Domain</span>
            <select
              value={userForm.domain}
              onChange={(e) =>
                setUserForm((prev) => ({
                  ...prev,
                  domain: e.target.value,
                }))
              }
              className="h-9 w-full rounded-xl border border-border-color bg-surface-muted px-4 text-sm text-text-primary focus:border-indigo-500 focus:bg-surface focus:ring-4 focus:ring-indigo-100"
            >
              <option value="">Select Domain</option>
              <option value="ALL">All Domains</option>
              {domainOptions.map((domain) => (
                <option key={domain} value={domain}>
                  {domain}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block space-y-0">
          <span className="text-sm px-1 font-semibold text-text-secondary">Username</span>
          <input
            type="text"
            placeholder="Username"
            value={userForm.username}
            onChange={(e) =>
              setUserForm((prev) => ({
                ...prev,
                username: e.target.value,
              }))
            }
            className="h-9 w-full rounded-xl border border-border-color bg-surface-muted px-4 text-sm text-text-primary focus:border-indigo-500 focus:bg-surface focus:ring-4 focus:ring-indigo-100"
          />
        </label>

        <label className="block space-y-0">
          <span className="text-sm px-1 font-semibold text-text-secondary">Email</span>
          <input
            type="email"
            placeholder="Enter Email"
            value={userForm.email}
            onChange={(e) =>
              setUserForm((prev) => ({
                ...prev,
                email: e.target.value,
              }))
            }
            className="h-9 w-full rounded-xl border border-border-color bg-surface-muted px-4 text-sm text-text-primary focus:border-indigo-500 focus:bg-surface focus:ring-4 focus:ring-indigo-100"
          />
        </label>

        <div className="space-y-2">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              type={showPassword ? "text" : "password"}
              placeholder={
                editingUser
                  ? "Leave blank to keep password"
                  : "Password"
              }
              value={userForm.password}
              onChange={(e) =>
                setUserForm((prev) => ({
                  ...prev,
                  password: e.target.value,
                }))
              }
              className="h-9 min-w-0 flex-1 rounded-xl border border-border-color bg-surface-muted px-4 text-sm text-text-primary transition focus:border-indigo-500 focus:bg-surface focus:ring-4 focus:ring-indigo-100"
            />
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={handleGeneratePassword}
                className="h-9 rounded-xl border border-border-color bg-surface px-4 text-sm font-semibold text-text-secondary transition hover:bg-surface-muted"
              >
                Generate Password
              </button>
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="h-9 rounded-xl border border-border-color bg-surface px-4 text-sm font-semibold text-text-secondary transition hover:bg-surface-muted"
              >
                {showPassword ? "Hide Password" : "Show Password"}
              </button>
            </div>
          </div>
          <p className="text-xs text-text-muted">
            {editingUser
              ? "Leave blank to keep the current password."
              : "Generate a strong password automatically when creating a user."}
          </p>
        </div>

        <label className="block space-y-0">
          <span className="text-sm font-semibold text-text-secondary">Status</span>
          <select
            value={userForm.status}
            onChange={(e) =>
              setUserForm((prev) => ({
                ...prev,
                status: e.target.value,
              }))
            }
            className="h-9 w-full rounded-xl border border-border-color bg-surface-muted px-4 text-sm text-text-primary focus:border-indigo-500 focus:bg-surface focus:ring-4 focus:ring-indigo-100"
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>
      </div>
    </div>

   

 <div className="h-full min-h-0 overflow-hidden">
<div className="h-full min-h-0 rounded-[18px] border border-border-color/80 bg-surface px-4 py-3 flex flex-col">
        <div>
          <p className="text-[13px] font-semibold uppercase tracking-[0.24em] text-text-muted">
            Page Permissions
          </p>
          <p className=" text-xs text-text-muted">
            Control access for each module.
          </p>
        </div>

        <div className="mt-2 flex-1 overflow-y-auto space-y-1 pr-2">
          {pageAccessList.map((section) => (
            <div key={section.title} className="rounded-[14px] border border-border-color bg-surface-muted px-4 py-2">
              <div className="mb-1 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm px-2 font-semibold text-text-primary">{section.title}</div>
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-3 py-1 text-xs font-semibold text-white transition hover:scale-[1.02]"
                  onClick={() => {
                    setUserForm((prev) => {
                      const updated = [...(prev.pagePermissions || [])];
                      section.pages.forEach((page) => {
                        const index = updated.findIndex((p) => p.page === page);
                        if (index >= 0) {
                          updated[index] = {
                            ...updated[index],
                            view: true,
                            edit: true,
                            download: true,
                            delete: true,
                          };
                        } else {
                          updated.push({
                            page,
                            view: true,
                            edit: true,
                            download: true,
                            delete: true,
                          });
                        }
                      });
                      return {
                        ...prev,
                        pagePermissions: updated,
                      };
                    });
                  }}
                >
                  Select All
                </button>
              </div>

              <div className="space-y-2">
                {section.pages.map((page) => {
                  const current = userForm.pagePermissions?.find((p) => p.page === page) || {};
                  return (
                    <div key={page} className="grid grid-cols-[220px_repeat(4,1fr)] gap-4 rounded-xl bg-surface px-4 py-2 shadow-sm ring-1 ring-border-strong">
                      <div className="flex items-center text-sm font-medium text-text-secondary">{page}</div>
                      {['view', 'edit', 'download', 'delete'].map((action) => (
                        <label key={action} className="flex items-center gap-2 text-sm capitalize text-text-secondary">
                          <input
                            type="checkbox"
                            className="h-3 w-3 rounded-md border-border-strong text-indigo-600 dark:text-indigo-400 focus:ring-indigo-500"
                            checked={current[action] || false}
                            onChange={(e) => {
                              setUserForm((prev) => {
                                const updated = [...(prev.pagePermissions || [])];
                                const index = updated.findIndex((p) => p.page === page);
                                if (index >= 0) {
                                  updated[index][action] = e.target.checked;
                                } else {
                                  updated.push({
                                    page,
                                    view: false,
                                    edit: false,
                                    download: false,
                                    delete: false,
                                    [action]: e.target.checked,
                                  });
                                }
                                return {
                                  ...prev,
                                  pagePermissions: updated,
                                };
                              });
                            }}
                          />
                          {action}
                        </label>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>

 <div className="sticky bottom-0 flex items-center justify-end gap-3 border-t border-border-color/80 bg-surface px-4 py-1.5">
    <button
      type="button"
      onClick={() => setUserModalOpen(false)}
      className=" rounded-xl border border-border-strong bg-surface px-4 py-2 text-sm font-semibold text-text-secondary transition hover:bg-surface-muted"
    >
      Cancel
    </button>
  <button
  type="button"
  onClick={saveUser}
  disabled={saving}
  className="rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-indigo-500/20 transition hover:shadow-xl disabled:opacity-50"
>
  {saving ? "Saving..." : "Save User"}
</button>
  </div>
</div>

  </div>
) : null}


    </div>
  );
}

export default UsersAccessPage;