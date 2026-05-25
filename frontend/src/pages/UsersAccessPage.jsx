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
   "Physical",
   "Scrum",
   "Signoff",
   ],
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

  const [userModalOpen, setUserModalOpen] =
    useState(false);

  const [editingUser, setEditingUser] =
    useState(null);

  const [userForm, setUserForm] =
    useState(initialUserForm);

  const [showPassword, setShowPassword] =
    useState(false);

  const generatePassword = (length = 12) => {
    const lower = "abcdefghijklmnopqrstuvwxyz";
    const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const digits = "0123456789";
    const symbols = "!@#$%^&*()-_=+[]{}<>?";
    const all = lower + upper + digits + symbols;

    let password = "";
    password += lower.charAt(
      Math.floor(Math.random() * lower.length)
    );
    password += upper.charAt(
      Math.floor(Math.random() * upper.length)
    );
    password += digits.charAt(
      Math.floor(Math.random() * digits.length)
    );
    password += symbols.charAt(
      Math.floor(Math.random() * symbols.length)
    );

    for (let i = 4; i < length; i += 1) {
      password += all.charAt(
        Math.floor(Math.random() * all.length)
      );
    }

    return password
      .split("")
      .sort(() => Math.random() - 0.5)
      .join("");
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
            user.email,
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
      email: user.email || "",
      password: "",
      status: user.status || "active",
      pagePermissions:
        user.pagePermissions || [],
    });

    setUserModalOpen(true);
  };

  const saveUser = async () => {
    if (
      !userForm.name.trim() ||
      !userForm.designation.trim() ||
      !userForm.email.trim() ||
      !userForm.circle.trim() ||
      !userForm.domain.trim() ||
      (!editingUser &&
        !userForm.password.trim())
    ) {
      toast.error(
        "All required user fields must be filled"
      );

      return;
    }

    const payload = {
      name: userForm.name.trim(),
      designation:
        userForm.designation.trim(),

      email: userForm.email
        .trim()
        .toLowerCase(),

      password: userForm.password,

      circle: userForm.circle,

      domain: userForm.domain,

      status: userForm.status,

      pagePermissions:
        userForm.pagePermissions || [],
    };

    try {
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

if (sessionUser?.id === editingUser.id) {
  localStorage.setItem(
    "sessionUser",
    JSON.stringify({
      ...sessionUser,
      pagePermissions: payload.pagePermissions,
      pageAccess: payload.pagePermissions
        .filter((p) => p.view)
        .map((p) => p.page),
    })
  );
}

      } else {
        await axios.post(
          buildApiUrl(
            "/api/access/users"
          ),
          payload,
          { headers }
        );

        toast.success(
          "User created successfully"
        );
      }

      await loadAccessData();

      setUserModalOpen(false);

      setEditingUser(null);

      setUserForm(initialUserForm);
    } catch (error) {
      toast.error(
        error.response?.data?.message ||
          "Failed to save user"
      );
    }
  };

  const deleteUser = async (userId) => {
    if (
      !window.confirm(
        "Delete this user?"
      )
    )
      return;

    try {
      await axios.delete(
        buildApiUrl(
          `/api/access/users/${userId}`
        ),
        { headers }
      );

      await loadAccessData();

      toast.success(
        "User deleted successfully"
      );
    } catch (error) {
      toast.error(
        error.response?.data?.message ||
          "Failed to delete user"
      );
    }
  };

  const toggleUserStatus = async (
    user
  ) => {
    const nextStatus =
      user.status === "active"
        ? "inactive"
        : "active";

    try {
      await axios.put(
        buildApiUrl(
          `/api/access/users/${user.id}/status`
        ),
        { status: nextStatus },
        { headers }
      );

      setUsers((prev) =>
        prev.map((item) =>
          item.id === user.id
            ? {
                ...item,
                status: nextStatus,
              }
            : item
        )
      );

      toast.success(
        "User status updated"
      );
    } catch (error) {
      toast.error(
        error.response?.data?.message ||
          "Failed to update status"
      );
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="app-surface overflow-hidden p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-text-primary">
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
    className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
    onClick={() => setUserModalOpen(false)}
  >
    <div
      className="app-surface flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl p-0 shadow-2xl"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between border-b border-border-color px-6 py-4">
        <h3 className="text-lg font-semibold text-text-primary">
          {editingUser
            ? "Edit User"
            : "Add User"}
        </h3>

    <button
      type="button"
      onClick={() =>
        setUserModalOpen(false)
      }
      className="text-lg text-text-muted hover:text-danger"
    >
      x
    </button>
  </div>

  <div className="flex-1 overflow-y-auto p-6">
    <div className="grid gap-4 md:grid-cols-2">

      <input
        type="text"
        placeholder="Name"
        value={userForm.name}
        onChange={(e) =>
          setUserForm((prev) => ({
            ...prev,
            name: e.target.value,
          }))
        }
        className="app-input rounded-xl"
      />

      <input
        type="text"
        placeholder="Designation"
        value={userForm.designation}
        onChange={(e) =>
          setUserForm((prev) => ({
            ...prev,
            designation:
              e.target.value,
          }))
        }
        className="app-input rounded-xl"
      />

      <select
        value={userForm.circle}
        onChange={(e) =>
          setUserForm((prev) => ({
            ...prev,
            circle:
              e.target.value,
          }))
        }
        className="app-select"
      >
        <option value="">
          Select Circle
        </option>

        <option value="ALL">
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
        value={userForm.domain}
        onChange={(e) =>
          setUserForm((prev) => ({
            ...prev,
            domain:
              e.target.value,
          }))
        }
        className="app-select"
      >
        <option value="">
          Select Domain
        </option>

        <option value="ALL">
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

      <input
        type="email"
        placeholder="Email"
        value={userForm.email}
        onChange={(e) =>
          setUserForm((prev) => ({
            ...prev,
            email:
              e.target.value,
          }))
        }
        className="app-input rounded-xl"
      />

      <div className="space-y-2">
        <div className="flex items-center gap-2">
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
                password:
                  e.target.value,
              }))
            }
            className="app-input rounded-xl flex-1"
          />

          <button
            type="button"
            onClick={handleGeneratePassword}
            className="app-button-ghost whitespace-nowrap"
          >
            Generate
          </button>

          <button
            type="button"
            onClick={() =>
              setShowPassword((prev) => !prev)
            }
            className="app-button-ghost whitespace-nowrap"
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>

        <p className="text-xs text-text-secondary">
          {editingUser
            ? "Leave blank to keep the current password."
            : "Generate a strong password automatically when creating a user."}
        </p>
      </div>

      <select
        value={userForm.status}
        onChange={(e) =>
          setUserForm((prev) => ({
            ...prev,
            status:
              e.target.value,
          }))
        }
        className="app-select"
      >
        <option value="active">
          Active
        </option>

        <option value="inactive">
          Inactive
        </option>
      </select>

<div className="md:col-span-2 rounded-2xl border border-gray-200 bg-white p-5">

  <div className="mb-5 text-lg font-semibold text-gray-900">
    Page Permissions
  </div>

  <div className="space-y-6">


{pageAccessList.map((section) => (
  <div
    key={section.title}
    className="rounded-2xl border border-gray-100 p-4"
  >

    <div className="mb-4 flex items-center justify-between">

      <div className="text-base font-semibold text-gray-800">
        {section.title}
      </div>

      <button
        type="button"
        className="rounded-lg bg-indigo-100 px-3 py-1 text-sm font-medium text-indigo-700 hover:bg-indigo-200"
        onClick={() => {
          setUserForm((prev) => {
            const updated = [
              ...(prev.pagePermissions || []),
            ];

            section.pages.forEach((page) => {
              const index =
                updated.findIndex(
                  (p) => p.page === page
                );

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

    <div className="space-y-3">

      {section.pages.map((page) => {
        const current =
          userForm.pagePermissions?.find(
            (p) => p.page === page
          ) || {};

        return (
          <div
            key={page}
            className="grid grid-cols-[240px_repeat(4,1fr)] gap-4 items-center border-b border-gray-100 pb-3"
          >

            <div className="font-medium text-gray-700">
              {page}
            </div>

            {[
              "view",
              "edit",
              "download",
              "delete",
            ].map((action) => (
              <label
                key={action}
                className="flex items-center gap-2 text-sm capitalize"
              >

                <input
                  type="checkbox"
                  checked={
                    current[action] || false
                  }
                  onChange={(e) => {
                    setUserForm((prev) => {
                      const updated = [
                        ...(prev.pagePermissions || []),
                      ];

                      const index =
                        updated.findIndex(
                          (p) =>
                            p.page === page
                        );

                      if (index >= 0) {
                        updated[index][action] =
                          e.target.checked;
                      } else {
                        updated.push({
                          page,
                          view: false,
                          edit: false,
                          download: false,
                          delete: false,
                          [action]:
                            e.target.checked,
                        });
                      }

                      return {
                        ...prev,
                        pagePermissions:
                          updated,
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

  <div className="flex justify-end gap-3 border-t border-border-color px-6 py-4">
    <button
      type="button"
      onClick={() =>
        setUserModalOpen(false)
      }
      className="app-button-ghost"
    >
      Cancel
    </button>

    <button
      type="button"
      onClick={saveUser}
      className="app-button-primary"
    >
      Save User
    </button>
  </div>
</div>

  </div>
) : null}


    </div>
  );
}

export default UsersAccessPage;