import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Select from "react-select";
import toast from "react-hot-toast";
import {
  BriefcaseBusiness,
  CalendarClock,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  Download,
  FileSpreadsheet,
  Filter,
  MapPin,
  Building2,
  BadgeCheck,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserPlus2,
  Users,
  UserX,
  X,
  User,
  CreditCard,
  Upload,
} from "lucide-react";
import { authFetch, buildApiUrl } from "../lib/api";
import { getStoredSession } from "../lib/session";
import useDesignationOptions from "../hooks/useDesignationOptions";

const selectStyles = {
  control: (provided, state) => ({
    ...provided,
    minHeight: "40px",
    height: "40px",
    borderRadius: "14px",
    borderColor: state.isFocused ? "rgb(var(--color-primary))" : "rgb(var(--color-border))",
    boxShadow: state.isFocused ? "0 0 0 4px rgba(99,102,241,0.15)" : "none",
    fontSize: "13px",
    backgroundColor: "rgb(var(--color-surface))",
    "&:hover": { borderColor: "rgb(var(--color-border-strong))" },
  }),
  valueContainer: (provided) => ({
    ...provided,
    height: "38px",
    padding: "0 10px",
  }),
  indicatorsContainer: (provided) => ({
    ...provided,
    height: "38px",
  }),
  menu: (provided) => ({
    ...provided,
    zIndex: 9999,
    marginTop: 2,
    borderRadius: "12px",
    overflow: "hidden",
    backgroundColor: "rgb(var(--color-surface-elevated))",
  }),
  menuList: (provided) => ({
    ...provided,
    maxHeight: "260px",
  }),
  input: (provided) => ({
    ...provided,
    fontSize: "13px",
    margin: 0,
    color: "rgb(var(--color-text-primary))",
  }),
  placeholder: (provided) => ({
    ...provided,
    fontSize: "13px",
    color: "rgb(var(--color-text-muted))",
  }),
  singleValue: (provided) => ({
    ...provided,
    fontSize: "13px",
    color: "rgb(var(--color-text-primary))",
  }),
  option: (provided, state) => ({
    ...provided,
    fontSize: "13px",
    cursor: "pointer",
    color: state.isSelected ? "#ffffff" : "rgb(var(--color-text-primary))",
    backgroundColor: state.isSelected
      ? "#3b82f6"
      : state.isFocused
        ? "rgba(99,102,241,0.1)"
        : "rgb(var(--color-surface-elevated))",
  }),
};

// The approved Designation list is fetched from the backend at runtime (see
// useDesignationOptions / GET /api/designations) so it can never drift out of
// sync with the server-side validation.

function getDesignationSelectStyles(hasError) {
  return {
    ...selectStyles,
    control: (provided, state) => ({
      ...selectStyles.control(provided, state),
      minHeight: "36px",
      height: "36px",
      borderRadius: "16px",
      borderColor: hasError
        ? "#ef4444"
        : state.isFocused
          ? "rgb(var(--color-primary))"
          : "rgb(var(--color-border))",
      boxShadow: hasError
        ? "0 0 0 4px rgba(239,68,68,0.08)"
        : state.isFocused
          ? "0 0 0 4px rgba(59,130,246,0.08)"
          : "none",
    }),
    valueContainer: (provided) => ({
      ...provided,
      height: "34px",
      padding: "0 10px 0 30px",
    }),
    indicatorsContainer: (provided) => ({
      ...provided,
      height: "34px",
    }),
  };
}

function FilterField({ icon: Icon, label, children }) {
  return (
    <div className="min-w-[150px] flex-1">
      <label className="mb-1 flex items-center gap-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
        {Icon ? <Icon className="h-3 w-3" /> : null}
        {label}
      </label>
      {children}
    </div>
  );
}

const ALL_CIRCLE_VALUES = new Set(["ALL", "ALL CIRCLE", "ALL CIRCLES"]);

function isAllCircleAccess(circle) {
  return ALL_CIRCLE_VALUES.has(String(circle || "").trim().toUpperCase());
}

function formatDateTime(d) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      weekday: "long",
      month: "long",
      day: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(d);
  } catch {
    return d.toLocaleString();
  }
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// uploaded_at arrives as "YYYY-MM-DD HH:MM:SS" (dateStrings: true on the
// backend pool); Safari cannot parse the space-separated form, so normalize
// to ISO "T" before handing it to Date.
function parseUploadedAt(value) {
  if (!value) return null;
  const normalized = String(value).trim().replace(" ", "T");
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatUploadedAt(value) {
  const parsed = parseUploadedAt(value);
  if (!parsed) return null;
  const hours24 = parsed.getHours();
  const hours12 = hours24 % 12 || 12;
  return {
    date: `${String(parsed.getDate()).padStart(2, "0")}-${
      MONTH_NAMES[parsed.getMonth()]
    }-${parsed.getFullYear()}`,
    time: `${String(hours12).padStart(2, "0")}:${String(
      parsed.getMinutes()
    ).padStart(2, "0")} ${hours24 >= 12 ? "PM" : "AM"}`,
  };
}

function MetricCard({ icon: Icon, label, value, accent, note }) {
  return (
    <motion.div
      whileHover={{ y: -3 }}
      className="group relative overflow-hidden rounded-[18px] border border-white/70 bg-surface/85 px-4 py-3 backdrop-blur-2xl"
    >
      <div
        className={`absolute inset-x-5 top-0 h-14 rounded-b-[32px] bg-gradient-to-br ${accent} opacity-20 blur-2xl transition duration-500 group-hover:opacity-30`}
      />
      <div className="relative flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div
            className={`flex h-9 w-9 items-center justify-center rounded-[20px] bg-gradient-to-br ${accent} text-white`}
          >
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-medium text-text-muted">{label}</p>
            <p className="mt-1 text-[14px] font-semibold tracking-[-0.04em] text-text-primary">
              {value}
            </p>
          </div>
        </div>
       
      </div>
      <p className="relative mt-1 text-xs text-text-muted">{note}</p>
    </motion.div>
  );
}

function StatusPill({ variant, children }) {
  const styles = {
    pending:
      "border border-amber-200 dark:border-amber-500/20/80 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400",
    active:
      "border border-emerald-200 dark:border-emerald-500/20/80 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    joined:
      "border border-cyan-200 dark:border-cyan-500/20/80 bg-cyan-50 dark:bg-cyan-500/10 text-cyan-700 dark:text-cyan-400",
    not_joined:
      "border border-rose-200 dark:border-rose-500/20/80 bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400",
  };

  return (
    <span
      className={`inline-flex rounded-full px-3.5 py-1.5 text-xs font-semibold ${styles[variant] || styles.pending}`}
    >
      {children}
    </span>
  );
}

function LoadingSkeletonRows({ rows = 6, cols = 10 }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, row) => (
        <tr key={row} className="animate-pulse">
          {Array.from({ length: cols }).map((__, col) => (
            <td
              key={col}
              className="border-b border-border-color px-4 py-5"
            >
              <div className="h-4 rounded-xl bg-surface-muted" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function TableActionButton({
  className,
  children,
  disabled,
  onClick,
  icon: Icon,
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex w-full items-center justify-center gap-1.5 whitespace-normal break-words rounded-2xl px-2 py-2 text-center text-xs font-semibold leading-tight transition disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
      {children}
    </button>
  );
}

export default function NewJoining() {
  const [data, setData] = useState([]);
  const [tableLoading, setTableLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [circleFilter, setCircleFilter] = useState("");
  const [cmpFilter, setCmpFilter] = useState("");
  const [designationFilter, setDesignationFilter] = useState("");
  const [joiningStatusFilter, setJoiningStatusFilter] = useState("");
  const [l2StatusFilter, setL2StatusFilter] = useState("");
  const [employeeStatusFilter, setEmployeeStatusFilter] = useState("");
  const [selectedRows, setSelectedRows] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [excelFile, setExcelFile] = useState(null);
  const [uploadingExcel, setUploadingExcel] = useState(false);
  const [savingEmployee, setSavingEmployee] = useState(false);
  // null = existing default order (id DESC); "desc" = latest uploaded first
  const [uploadedSort, setUploadedSort] = useState(null);
  const [now, setNow] = useState(() => new Date());

  const { options: designationSelectOptions } = useDesignationOptions();

  const isAllCircleUser = useMemo(
    () => isAllCircleAccess(getStoredSession()?.circle),
    []
  );

  // Per-page delete flag from pagePermissions; an empty/missing list means an
  // unrestricted (admin) user, matching utils/access.js. Permissions may store
  // the page as the slug ("new-joining") or display name ("New Joining"), so
  // normalize whitespace to hyphens before comparing.
  const canDelete = useMemo(() => {
    const perms = getStoredSession()?.pagePermissions;
    if (!Array.isArray(perms) || perms.length === 0) return true;
    const entry = perms.find(
      (p) =>
        String(p?.page || "").trim().toLowerCase().replace(/\s+/g, "-") ===
        "new-joining"
    );
    return Boolean(entry?.delete);
  }, []);

  const circleCmpData = {
    Delhi: [
      "Delhi SHQ",
      "Delhi-1 (West)",
      "Delhi-2 (South)",
      "Delhi-3 (Central-East)",
      "Delhi-4 (North)",
      "Faridabad (NCR)",
      "Ghaziabad (NCR)",
      "Gurgaon (NCR)",
      "Noida (NCR)",
    ],
    Haryana: [
      "Haryana SHQ",
      "Ambala",
      "Hissar",
      "Karnal",
      "Panipat",
      "Palwal",
      "Rewari",
      "Rohtak",
    ],
    Punjab: [
      "Punjab SHQ",
      "Amritsar",
      "Bathinda",
      "Chandigarh",
      "Jalandhar",
      "Ludhiana-1",
      "Ludhiana-2",
      "Pathankot",
      "Patiala",
      "Sangrur",
    ],
    "UP East": [
      "UP East SHQ",
      "Allahabad",
      "Azamgarh",
      "Faizabad",
      "Gorakhpur",
      "Nanded",
      "Raibareilly",
      "Varanasi",
    ],
  };

 const [employeeForm, setEmployeeForm] = useState({
  employee_code: "",
  employee_name: "",
  circle: "",
  cmp: "",
  designation: "",
  aadhaar_no: "",
  nth_salary: "",
  joining_status: "Pending",
  l2_status: "Pending",
  employee_status: "Inactive",
});

  const [formErrors, setFormErrors] = useState({});
  const employeeFieldRefs = useRef({});
  const [isEmployeeCodeAuto, setIsEmployeeCodeAuto] = useState(true);
  const [generatingEmployeeCode, setGeneratingEmployeeCode] = useState(false);

  const clearFieldError = (field) => {
    setFormErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const generateEmployeeCode = useCallback(async () => {
    try {
      setGeneratingEmployeeCode(true);
      const response = await authFetch(
        buildApiUrl("/api/new-joining/next-employee-code")
      );
      const result = await response.json();

      if (!response.ok || !result.success) {
        toast.error(result.message || "Failed to generate employee code");
        return;
      }

      setEmployeeForm((prev) => ({
        ...prev,
        employee_code: result.employeeCode,
      }));
      setIsEmployeeCodeAuto(true);
      clearFieldError("employee_code");
    } catch (error) {
      console.log(error);
      toast.error("Failed to generate employee code");
    } finally {
      setGeneratingEmployeeCode(false);
    }
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (showModal) {
      generateEmployeeCode();
    }
  }, [showModal, generateEmployeeCode]);

  const loadData = async () => {
    try {
      setTableLoading(true);
      const response = await authFetch(buildApiUrl("/api/new-joining"));
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error("Failed");
      }

      setData(result.data || result.rows || []);
    } catch (error) {
      console.log(error);
    } finally {
      setTableLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const circleOptions = useMemo(() => {
    const unique = [...new Set(data.map((item) => item.circle))]
      .filter(Boolean)
      .sort();
    return [
      { value: "", label: "All Circles" },
      ...unique.map((circle) => ({ value: circle, label: circle })),
    ];
  }, [data]);

  const cmpOptions = useMemo(() => {
    const unique = [
      ...new Set(
        data
          .filter((item) => !circleFilter || item.circle === circleFilter)
          .map((item) => item.cmp || item.cluster)
      ),
    ]
      .filter(Boolean)
      .sort();
    return [
      { value: "", label: "All Clusters" },
      ...unique.map((cmp) => ({ value: cmp, label: cmp })),
    ];
  }, [data, circleFilter]);

  const designationOptions = useMemo(() => {
    const unique = [...new Set(data.map((item) => item.designation))]
      .filter(Boolean)
      .sort();
    return [
      { value: "", label: "All Designations" },
      ...unique.map((designation) => ({
        value: designation,
        label: designation,
      })),
    ];
  }, [data]);

  const joiningStatusOptions = [
    { value: "", label: "All Joining Status" },
    { value: "Pending", label: "Pending" },
    { value: "Joined", label: "Joined" },
    { value: "Not Joined", label: "Not Joined" },
  ];

  const l2StatusOptions = [
    { value: "", label: "All L2 Status" },
    { value: "Pending", label: "Pending" },
    { value: "Approved", label: "Approved" },
    { value: "Rejected", label: "Rejected" },
  ];

  const employeeStatusOptions = [
    { value: "", label: "All Employee Status" },
    { value: "Active", label: "Active" },
    { value: "Inactive", label: "Inactive" },
  ];

  const filteredData = useMemo(() => {
    const searchTerm = search.trim().toLowerCase();

    return data.filter((item) => {
      const matchesSearch =
        !searchTerm ||
        [
          item.employee_code,
          item.employee_name,
          item.aadhaar_no,
          item.circle,
          item.cmp || item.cluster,
          item.designation,
          item.joining_status,
          item.l2_status,
          item.employee_status,
        ].some((value) =>
          String(value || "").toLowerCase().includes(searchTerm)
        );

      const matchesCircle = !circleFilter || item.circle === circleFilter;

      const matchesCmp =
        !cmpFilter || (item.cmp || item.cluster) === cmpFilter;

      const matchesDesignation =
        !designationFilter || item.designation === designationFilter;

      const matchesJoiningStatus =
        !joiningStatusFilter ||
        (item.joining_status || "Pending") === joiningStatusFilter;

      const matchesL2Status =
        !l2StatusFilter || (item.l2_status || "Pending") === l2StatusFilter;

      const matchesEmployeeStatus =
        !employeeStatusFilter ||
        (item.employee_status || "Active") === employeeStatusFilter;

      return (
        matchesSearch &&
        matchesCircle &&
        matchesCmp &&
        matchesDesignation &&
        matchesJoiningStatus &&
        matchesL2Status &&
        matchesEmployeeStatus
      );
    });
  }, [
    data,
    search,
    circleFilter,
    cmpFilter,
    designationFilter,
    joiningStatusFilter,
    l2StatusFilter,
    employeeStatusFilter,
  ]);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    search,
    circleFilter,
    cmpFilter,
    designationFilter,
    joiningStatusFilter,
    l2StatusFilter,
    employeeStatusFilter,
  ]);

  const resetFilters = useCallback(() => {
    setSearch("");
    setCircleFilter("");
    setCmpFilter("");
    setDesignationFilter("");
    setJoiningStatusFilter("");
    setL2StatusFilter("");
    setEmployeeStatusFilter("");
    setCurrentPage(1);
  }, []);

  const handleExport = useCallback(() => {
    const header = [
      "Employee Code",
      "Employee Name",
      "Circle",
      "CMP / Cluster",
      "Designation",
      "Aadhaar Number",
      "NTH Salary",
      "L2 Status",
      "Joining Status",
      "Employee Status",
      "Upload At",
    ];
    const csv = [
      header.join(","),
      ...filteredData.map((row) => {
        const uploaded = formatUploadedAt(row.uploaded_at);
        return [
          row.employee_code || "",
          row.employee_name || "",
          row.circle || "",
          row.cmp || row.cluster || "",
          row.designation || "",
          row.aadhaar_no || "",
          row.nth_salary || "",
          row.l2_status || "",
          row.joining_status || "",
          row.employee_status || "",
          uploaded ? `${uploaded.date} ${uploaded.time}` : "--",
        ]
          .map((value) => `"${String(value).replaceAll('"', '""')}"`)
          .join(",");
      }),
    ].join("\n");

    // UTF-8 BOM so Excel opens the CSV as UTF-8 instead of ANSI (prevents
    // names from being corrupted if the export is edited and re-uploaded)
    const blob = new Blob([String.fromCharCode(0xfeff), csv], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `new-joining-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [filteredData]);

  const sortedData = useMemo(() => {
    if (!uploadedSort) return filteredData;

    const getTime = (item) => {
      const parsed = parseUploadedAt(item.uploaded_at);
      return parsed ? parsed.getTime() : null;
    };

    return [...filteredData].sort((a, b) => {
      const timeA = getTime(a);
      const timeB = getTime(b);
      // Records without uploaded_at always sink to the bottom
      if (timeA === null && timeB === null) return 0;
      if (timeA === null) return 1;
      if (timeB === null) return -1;
      return uploadedSort === "desc" ? timeB - timeA : timeA - timeB;
    });
  }, [filteredData, uploadedSort]);

  const totalPages = Math.max(1, Math.ceil(filteredData.length / pageSize));

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const paginatedData = sortedData.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const joinedCount = filteredData.filter(
    (item) => String(item.joining_status || "").trim() === "Joined"
  ).length;
  // Business rule: Joined + Not Joined must always equal Total Employees.
  // Anything not "Joined" (Pending, Not Joined, null, empty) counts as Not Joined.
  const notJoinedCount = filteredData.length - joinedCount;
  const activeCount = filteredData.filter(
    (item) => String(item.employee_status || "Active") !== "Inactive"
  ).length;
  const inactiveCount = filteredData.filter(
    (item) => String(item.employee_status || "") === "Inactive"
  ).length;

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedRows(paginatedData.map((item) => item.id));
      return;
    }

    setSelectedRows([]);
  };

  const handleSelectRow = (id) => {
    if (selectedRows.includes(id)) {
      setSelectedRows(selectedRows.filter((item) => item !== id));
      return;
    }

    setSelectedRows([...selectedRows, id]);
  };

  const openSingleDelete = (item) => {
    setDeleteTarget({ type: "single", item });
  };

  const openBulkDelete = () => {
    if (selectedRows.length === 0) {
      toast.error("Please select at least one record");
      return;
    }
    setDeleteTarget({ type: "bulk", count: selectedRows.length });
  };

  const closeDeleteModal = () => {
    if (deleting) return;
    setDeleteTarget(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget || deleting) return;

    try {
      setDeleting(true);

      if (deleteTarget.type === "single") {
        const response = await authFetch(
          buildApiUrl(`/api/new-joining/delete/${deleteTarget.item.id}`),
          { method: "DELETE" }
        );

        const result = await response.json();

        if (!response.ok || !result.success) {
          toast.error(result.message || "Failed to delete record");
          return;
        }

        toast.success("Employee deleted successfully");
        setSelectedRows((prev) =>
          prev.filter((id) => id !== deleteTarget.item.id)
        );
      } else {
        const response = await authFetch(
          buildApiUrl("/api/new-joining/bulk-delete"),
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids: selectedRows }),
          }
        );

        const result = await response.json();

        if (!response.ok || !result.success) {
          toast.error(result.message || "Failed to delete records");
          return;
        }

        toast.success(
          `${result.deletedCount ?? selectedRows.length} record(s) deleted successfully`
        );
        setSelectedRows([]);
      }

      setDeleteTarget(null);
      await loadData();
    } catch (error) {
      console.log(error);
      toast.error("Something went wrong while deleting");
    } finally {
      setDeleting(false);
    }
  };

  const handleStatusUpdate = async (id, status, item) => {
    const confirmUpdate = window.confirm(
      `Are you sure you want to mark this employee as ${status}?`
    );

    if (!confirmUpdate) return;

    try {
      const employee_status = status === "Joined" ? "Active" : "Inactive";

      const response = await authFetch(
        buildApiUrl(`/api/new-joining/update-status/${id}`),
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            joining_status: status === "Joined" ? "Joined" : "Not Joined",
              employee_status,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        alert("Status update failed");
        return;
      }

      if (status === "Joined") {
        const goPhysical = window.confirm(
          "Employee Joined Successfully.\n\nGo To Physical Page?"
        );

        if (goPhysical) {
          localStorage.setItem("newJoiningEmployee", JSON.stringify(item));
          window.location.href = "/dashboard/manpower/physical";
        }
      }

      await loadData();
    } catch (error) {
      console.log(error);
      alert("Something went wrong");
    }
  };

  const handleL2Approval = async (id, status) => {
    const confirmUpdate = window.confirm(
  `Are you sure you want to ${status} this employee?`
);

if (!confirmUpdate) return;
  try {
    const response = await authFetch(
      buildApiUrl(`/api/new-joining/l2-status/${id}`),
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          l2_status: status,
        }),
      }
    );

    const result = await response.json();

    if (!response.ok || !result.success) {
      alert(result.message || "Failed");
      return;
    }

    loadData();

  } catch (error) {
    console.log(error);
    alert("Something went wrong");
  }
};

 const validateEmployeeForm = () => {
  const errors = {};

  if (!String(employeeForm.employee_code || "").trim()) {
    errors.employee_code = "Employee Code is required.";
  }

  if (!String(employeeForm.employee_name || "").trim()) {
    errors.employee_name = "Employee Name is required.";
  }

  if (!String(employeeForm.circle || "").trim()) {
    errors.circle = "Please select Circle.";
  }

  if (!String(employeeForm.cmp || "").trim()) {
    errors.cmp = "Please select CMP.";
  }

  if (!String(employeeForm.designation || "").trim()) {
    errors.designation = "Designation is required.";
  }

  const aadhaar = String(employeeForm.aadhaar_no || "").trim();

  if (!aadhaar) {
    errors.aadhaar_no = "Aadhaar Number is required.";
  } else if (!/^\d{12}$/.test(aadhaar)) {
    errors.aadhaar_no = "Aadhaar Number must contain exactly 12 digits.";
  }

  return errors;
};

 const handleAddEmployee = async () => {
  const errors = validateEmployeeForm();

  if (Object.keys(errors).length > 0) {
    setFormErrors(errors);

    const fieldOrder = [
      "employee_code",
      "employee_name",
      "circle",
      "cmp",
      "designation",
      "aadhaar_no",
    ];
    const firstInvalidField = fieldOrder.find((field) => errors[field]);
    employeeFieldRefs.current[firstInvalidField]?.focus();

    toast.error("Please fill all required fields.");
    return;
  }

  setFormErrors({});

  try {
    setSavingEmployee(true);

    const response = await authFetch(
      buildApiUrl("/api/new-joining/add-employee"),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...employeeForm,
          employee_code_auto: isEmployeeCodeAuto,
        }),
      }
    );

    const result = await response.json();

    if (!response.ok || !result.success) {
      const message = result.message || "Failed";
      toast.error(message);

      if (response.status === 409 && /employee code/i.test(message)) {
        setFormErrors((prev) => ({ ...prev, employee_code: message }));
        employeeFieldRefs.current.employee_code?.focus();
      } else if (response.status === 409 && /aadhaar/i.test(message)) {
        setFormErrors((prev) => ({ ...prev, aadhaar_no: message }));
        employeeFieldRefs.current.aadhaar_no?.focus();
      }

      return;
    }

    toast.success("Employee Added Successfully");

    setShowModal(false);
    setFormErrors({});
    setIsEmployeeCodeAuto(true);

   setEmployeeForm({
  employee_code: "",
  employee_name: "",
  circle: "",
  cmp: "",
  designation: "",
  aadhaar_no: "",
  nth_salary: "",
  joining_status: "Pending",
  l2_status: "Pending",
  employee_status: "Inactive",
});

    loadData();
  } catch (error) {
    console.log(error);
    toast.error("Something went wrong");
  } finally {
    setSavingEmployee(false);
  }
};

  const handleExcelUpload = async () => {
    if (!excelFile) {
      alert("Please select excel file");
      return;
    }

    try {
  setUploadingExcel(true);
      const formData = new FormData();
      formData.append("file", excelFile);

      const response = await authFetch(buildApiUrl("/api/new-joining/upload-excel"), {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        alert(result.message || "Upload Failed");
        return;
      }

     alert("Excel Uploaded Successfully");

setExcelFile(null);

setShowModal(false); // Close popup automatically

loadData();
    } catch (error) {
      console.log(error);
      alert("Upload Failed");
    }finally {
  setUploadingExcel(false);
}
  };

  const statCards = [
    {
      label: "Total Employees",
      value: filteredData.length.toLocaleString(),
      note: "",
      accent: "from-blue-500 to-indigo-500",
      icon: Users,
    },
    {
      label: "Joined",
      value: joinedCount.toLocaleString(),
      note: "",
      accent: "from-emerald-400 to-teal-500",
      icon: UserPlus2,
    },
    {
      label: "Not Joined",
      value: notJoinedCount.toLocaleString(),
      note: "",
      accent: "from-rose-400 to-red-500",
      icon: UserX,
    },
    {
      label: "Active",
      value: activeCount.toLocaleString(),
      note: "",
      accent: "from-violet-500 to-fuchsia-500",
      icon: BriefcaseBusiness,
    },
    {
      label: "Inactive",
      value: inactiveCount.toLocaleString(),
      note: "",
      accent: "from-slate-400 to-slate-600",
      icon: CircleDashed,
    },
  ];

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
     
      </div>

      <div className="relative mx-auto max-w-[1450px]">
        <div className="mb-1 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-4">
         

            <div>
              <h1 className="text-sm font-semibold tracking-[-0.05em] text-text-primary sm:text-xl">
                New Joining
              </h1>
              <p className="mt-1 text-sm text-text-muted">
                Employee Joining Management
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:justify-end">

            {canDelete && (
              <motion.button
                whileHover={
                  selectedRows.length > 0 ? { y: -2, scale: 1.01 } : {}
                }
                whileTap={selectedRows.length > 0 ? { scale: 0.99 } : {}}
                onClick={openBulkDelete}
                disabled={selectedRows.length === 0 || deleting}
                className="inline-flex items-center gap-3 rounded-[18px] bg-gradient-to-r from-rose-500 to-red-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                Bulk Delete
                {selectedRows.length > 0 ? ` (${selectedRows.length})` : ""}
              </motion.button>
            )}

            <motion.button
              whileHover={{ y: -2, scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              onClick={handleExport}
              className="inline-flex items-center gap-3 rounded-[18px] border border-border-color bg-surface px-4 py-2 text-sm font-semibold text-text-secondary shadow-sm transition hover:border-border-strong hover:bg-surface-muted"
            >
              <Download className="h-4 w-4" />
              Export
            </motion.button>

            <motion.button
              whileHover={{ y: -2, scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              onClick={() => setShowModal(true)}
              className="inline-flex items-center gap-3 rounded-[18px] bg-gradient-to-r from-[#5b5cf0] via-[#4368ff]
               to-[#2a94ff] px-4 py-2 text-sm font-semibold text-white transition"
            >
              <Plus className="h-4 w-4" />
              Join Employee
            </motion.button>
          </div>
        </div>

        <div className="mb-2 grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
          {statCards.map((card) => (
            <MetricCard key={card.label} {...card} />
          ))}
        </div>

        <div className="relative z-20 mb-2 rounded-[18px] border border-white/70 bg-surface/78 px-2 py-1 backdrop-blur-2xl">
          <div className="flex flex-wrap items-end gap-2 xl:flex-nowrap">
            <FilterField icon={Search} label="Search Employee">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                <input
                  type="text"
                  placeholder="Search name, code, aadhaar, circle..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-10 w-full rounded-[14px] border border-border-color/80 bg-surface pl-9 pr-3 text-sm text-text-secondary outline-none transition focus:border-blue-200 focus:dark:border-blue-500/20 focus:ring-4 focus:ring-blue-50"
                />
              </div>
            </FilterField>

            <FilterField icon={MapPin} label="Circle">
              <Select
                styles={selectStyles}
                placeholder="All Circles"
                options={circleOptions}
                value={
                  circleOptions.find((item) => item.value === circleFilter) ||
                  null
                }
                onChange={(selected) => {
                  setCircleFilter(selected?.value || "");
                  setCmpFilter("");
                }}
                isClearable
              />
            </FilterField>

            <FilterField icon={Building2} label="CMP / Cluster">
              <Select
                styles={selectStyles}
                placeholder="All Clusters"
                options={cmpOptions}
                value={
                  cmpOptions.find((item) => item.value === cmpFilter) || null
                }
                onChange={(selected) => setCmpFilter(selected?.value || "")}
                isClearable
              />
            </FilterField>

            <FilterField icon={BadgeCheck} label="Designation">
              <Select
                styles={selectStyles}
                placeholder="All Designations"
                options={designationOptions}
                value={
                  designationOptions.find(
                    (item) => item.value === designationFilter
                  ) || null
                }
                onChange={(selected) =>
                  setDesignationFilter(selected?.value || "")
                }
                isClearable
              />
            </FilterField>

            <FilterField icon={ShieldCheck} label="L2 Status">
              <Select
                styles={selectStyles}
                placeholder="All L2 Status"
                options={l2StatusOptions}
                value={
                  l2StatusOptions.find(
                    (item) => item.value === l2StatusFilter
                  ) || null
                }
                onChange={(selected) =>
                  setL2StatusFilter(selected?.value || "")
                }
                isClearable
              />
            </FilterField>

        {/*     <FilterField icon={UserPlus2} label="Joining Status">
              <Select
                styles={selectStyles}
                placeholder="All Joining Status"
                options={joiningStatusOptions}
                value={
                  joiningStatusOptions.find(
                    (item) => item.value === joiningStatusFilter
                  ) || null
                }
                onChange={(selected) =>
                  setJoiningStatusFilter(selected?.value || "")
                }
                isClearable
              />
            </FilterField>
            */}

            <FilterField icon={CircleDashed} label="Employee Status">
              <Select
                styles={selectStyles}
                placeholder="All Employee Status"
                options={employeeStatusOptions}
                value={
                  employeeStatusOptions.find(
                    (item) => item.value === employeeStatusFilter
                  ) || null
                }
                onChange={(selected) =>
                  setEmployeeStatusFilter(selected?.value || "")
                }
                isClearable
              />
            </FilterField>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-[14px] border border-border-color bg-surface px-4 py-2 text-sm font-semibold text-text-secondary transition hover:border-border-strong hover:bg-surface-muted"
              >
                <RefreshCw className="h-4 w-4" />
                Reset
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-visible rounded-[18px] border border-white/70 bg-surface/85 backdrop-blur-2xl">
          <div className="flex flex-col gap-4 border-b border-border-color px-5 py-2 sm:flex-row sm:items-center sm:justify-between sm:px-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400">
                <FileSpreadsheet className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold tracking-[0.02em] text-text-primary">
                  Employee Records
                </h2>
                <p className="text-sm text-text-muted tracking-[-0.01em]">
                  Review and manage employee joining records
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 text-sm text-text-muted">
              {tableLoading && (
                <RefreshCw className="h-4 w-4 animate-spin text-blue-500 dark:text-blue-400" />
              )}
              Total Records:{" "}
              <span className="font-semibold text-text-primary">
                {filteredData.length}
              </span>
            </div>
          </div>

 <div className="w-full overflow-x-hidden">
   <table className="w-full table-fixed border-collapse">
     {/* Percentage widths always sum to 100%, so the table fits the
         container at any viewport — no horizontal scrollbar, ever.
         Long content wraps (see break-words below) instead of overflowing. */}
     <colgroup>
       <col className="w-[3%]" />
       <col className="w-[7%]" />
       <col className="w-[13%]" />
       <col className="w-[8%]" />
       <col className="w-[10%]" />
       <col className="w-[9%]" />
       <col className="w-[9%]" />
       <col className="w-[7%]" />
       <col className="w-[8%]" />
       <col className="w-[8%]" />
       <col className="w-[8%]" />
       <col className="w-[10%]" />
     </colgroup>
     <thead>
      <tr className="bg-surface-muted/90">
       <td className="w-10 border-b border-border-color px-1 py-2 text-center align-middle">
          <input
           type="checkbox"
           checked={
           paginatedData.length > 0 &&
           paginatedData.every((row) =>
           selectedRows.includes(row.id)
           )
          }
          onChange={handleSelectAll}
          disabled={!canDelete}
         className="h-3 w-3 rounded border-border-strong text-blue-600 dark:text-blue-400 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
         />
        </td>
                  {[
                    "Employee Code",
                    "Employee Name",
                    "Circle",
                    "CMP / Cluster",
                    "Designation",
                    "Aadhaar Number",
                    "Upload At",
                    "L2 Status",
                     "Joining Status",
                    "Employee Status",
                    "Action",
                  ].map((heading) => (
                    <th
                      key={heading}
                      className="border-b border-border-color px-2 py-2 text-center align-middle text-sm font-semibold whitespace-normal break-words text-text-secondary"
                    >
                      {heading === "Upload At" ? (
                        <button
                          type="button"
                          onClick={() =>
                            setUploadedSort((prev) =>
                              prev === "desc" ? "asc" : "desc"
                            )
                          }
                          title="Sort by Upload At"
                          className="text-xs font-semibold text-text-secondary transition hover:text-blue-600 hover:dark:text-blue-400"
                        >
                          {heading}
                        </button>
                      ) : (
                        heading
                      )}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {tableLoading ? (
                  <LoadingSkeletonRows cols={12} />
                ) : filteredData.length === 0 ? (
                  <tr>
                    <td
                      colSpan="12"
                      className="px-4 py-20 text-center text-sm font-medium text-text-muted"
                    >
                      No Records Found
                    </td>
                  </tr>
                ) : (
                  paginatedData.map((item, index) => (
                    <tr
                      key={item.id || index}
                      className="transition hover:bg-surface-muted/70 border-b border-border-color"
                    >
                      <td className="border-b border-border-color px-4 py-3 align-middle">
                        <input
                          type="checkbox"
                          checked={selectedRows.includes(item.id)}
                          onChange={() => handleSelectRow(item.id)}
                          disabled={!canDelete}
                          className="h-3 w-3 rounded border-border-strong text-blue-600 dark:text-blue-400 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
                        />
                      </td>
                      <td className="border-b border-border-color px-3 py-2 align-middle whitespace-normal break-words text-sm font-semibold text-blue-600 dark:text-blue-400">
                        {item.employee_code || "-"}
                      </td>
                      <td className="border-b border-border-color px-3 py-2 align-middle whitespace-normal break-words text-sm font-semibold leading-snug text-text-primary">
                        {item.employee_name || "-"}
                      </td>
                      <td className="border-b border-border-color px-3 py-2 align-middle whitespace-normal break-words text-sm text-text-secondary">
                        {item.circle || "-"}
                      </td>
                      <td className="border-b border-border-color px-3 py-2 align-middle whitespace-normal break-words text-sm text-text-secondary">
                        {item.cmp || item.cluster || "-"}
                      </td>
                      <td className="border-b border-border-color px-3 py-2 align-middle whitespace-normal break-words text-sm text-text-secondary">
                        {item.designation || "-"}
                      </td>
                      <td className="border-b border-border-color px-3 py-2 align-middle whitespace-normal break-words text-sm text-text-secondary">
                        {item.aadhaar_no || "-"}
                      </td>
                      <td className="border-b border-border-color px-3 py-2 align-middle whitespace-normal break-words text-center text-sm text-text-secondary">
                        {(() => {
                          const uploaded = formatUploadedAt(item.uploaded_at);
                          return uploaded ? (
                            <div className="leading-tight">
                              <p className="break-words font-medium text-text-secondary">
                                {uploaded.date}
                              </p>
                              <p className="break-words text-xs text-text-muted">
                                {uploaded.time}
                              </p>
                            </div>
                          ) : (
                            "--"
                          );
                        })()}
                      </td>
                    {/*   <td className="border-b border-border-color px-4 py-2 text-sm text-text-secondary">
  ₹ {Number(item.nth_salary || 0).toLocaleString("en-IN")}
</td>
*/}
                    
 <td className="relative border-b border-border-color px-3 py-2 align-middle overflow-visible">

 <div className="flex flex-col items-center gap-1">

    <StatusPill
      variant={
        item.l2_status === "Approved"
          ? "active"
          : item.l2_status === "Rejected"
          ? "not_joined"
          : "pending"
      }
    >
      {item.l2_status || "Pending"}
    </StatusPill>

    {isAllCircleUser && (
      <select
        value={item.l2_status || "Pending"}
        onChange={(e) => handleL2Approval(item.id, e.target.value)}
       className="h-7 w-full max-w-[110px] rounded-md border border-border-color bg-surface-muted px-1 text-[11px] font-medium">
        <option value="Pending">🟡 Pending</option>
        <option value="Approved">🟢 Approved</option>
        <option value="Rejected">🔴 Rejected</option>
      </select>
    )}

  </div>

</td>

<td className="border-b border-border-color px-3 py-2 align-middle text-xs whitespace-normal break-words">

  <StatusPill
    variant={
      item.joining_status === "Joined"
        ? "joined"
        : item.joining_status === "Not Joined"
        ? "not_joined"
        : "pending"
    }
  >
    {item.joining_status || "Pending"}
  </StatusPill>

</td>
                      <td className="border-b border-border-color px-3 py-2 align-middle text-sm">
                        <StatusPill
                          variant={
                            item.employee_status === "Inactive"
                              ? "not_joined"
                              : "active"
                          }
                        >
                          {item.employee_status || "Active"}
                        </StatusPill>
                      </td>
                      <td className="border-b border-border-color px-3 py-2 align-middle">
                      <div className="flex flex-col gap-2">
                         <TableActionButton
                         disabled={item.l2_status !== "Approved"}
                         onClick={() =>
                           handleStatusUpdate(item.id, "Joined", item)
                         }
                            className="bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 hover:dark:bg-emerald-500/15"
                          >
                            Joined
                          </TableActionButton>
                          <TableActionButton
                            onClick={() =>
                              handleStatusUpdate(item.id, "Not Joined")
                            }
                            className="bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 hover:bg-rose-100 hover:dark:bg-rose-500/15"
                          >
                            Not Joined
                          </TableActionButton>
                          {canDelete && (
                            <TableActionButton
                              icon={Trash2}
                              disabled={deleting}
                              onClick={() => openSingleDelete(item)}
                              className="border border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-100 hover:dark:bg-red-500/15"
                            >
                              Delete
                            </TableActionButton>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-4 px-2 py-2 sm:flex-row sm:items-center sm:justify-between sm:px-4">
            <div className="text-sm text-text-muted">
              Total Records:{" "}
              <span className="font-semibold text-text-primary">
                {filteredData.length}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-border-color bg-surface text-text-muted transition hover:border-border-strong hover:text-text-secondary"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              <div className="inline-flex min-w-[56px] h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-r from-[#5b5cf0] to-[#3b82f6] px-2 py-2 text-sm font-semibold text-white ">
                {currentPage} / {totalPages}
              </div>

              <button
                type="button"
                onClick={() =>
                  setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                }
                className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-border-color bg-surface text-text-muted transition hover:border-border-strong hover:text-text-secondary"
              >
                <ChevronRight className="h-4 w-4" />
              </button>

              <label className="relative block">
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="h-8 appearance-none rounded-xl border border-border-color bg-surface px-4 pr-10 text-sm text-text-secondary outline-none transition focus:border-blue-200 focus:dark:border-blue-500/20 focus:ring-4 focus:ring-blue-50"
                >
                  <option value={10}>10 / page</option>
                  <option value={25}>25 / page</option>
                  <option value={50}>50 / page</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
              </label>
            </div>
          </div>
        </div>

     
{/* MODAL */}

{showModal && (

<div className="fixed inset-0 z-[99999] overflow-hidden bg-black/40 backdrop-blur-md p-4">

<div className="mx-auto my-4 h-[90vh] w-full max-w-4xl overflow-hidden rounded-[14px] bg-surface shadow-[0_30px_80px_rgba(15,23,42,0.25)] flex flex-col">

    {/* HEADER */}

    <div className="relative overflow-hidden border-b border-border-color bg-gradient-to-r from-violet-50 via-white to-sky-50 px-4 py-6">

      <div className="absolute right-0 top-0 h-10 w-10 rounded-full bg-violet-100 dark:bg-violet-500/15 blur-3xl opacity-50" />

      <div className="flex items-start justify-between">

        <div className="flex items-start gap-4">

          {/* ICON */}

          <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-gradient-to-br from-violet-100 to-indigo-100">

            <Plus className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />

          </div>

          {/* TITLE */}

          <div>

            <span className="rounded-full bg-indigo-100 dark:bg-indigo-500/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-indigo-700 dark:text-indigo-400">
              ADD NEW EMPLOYEE
            </span>

           

            <p className="mt-1 text-sm text-text-muted">
              Fill in employee details and upload supporting data in one flow.
            </p>

          </div>

        </div>

        {/* CLOSE */}

        <button
          onClick={() => {
            setShowModal(false);
            setFormErrors({});
          }}
          className="flex h-10 w-10 items-center justify-center rounded-3xl border border-border-color bg-surface text-text-muted transition hover:bg-surface-muted"
        >
          <span className="text-xl leading-none">×</span>
        </button>

      </div>

    </div>

    {/* BODY */}

  <div className="flex-1 overflow-y-auto px-6 py-4">

      {/* FORM GRID */}

      <div className="grid gap-4 md:grid-cols-2">

        {/* Employee Code */}

        <div>

          <label className="mb-1 px-1 block text-[13px] font-semibold text-text-primary">
            Employee Code <span className="text-red-500 dark:text-red-400">*</span>
          </label>

          <div className="flex items-stretch gap-2">

            <div className="relative flex-1">

              <User
                size={14}
                className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted"
              />

              <input
                ref={(el) => (employeeFieldRefs.current.employee_code = el)}
                type="text"
                placeholder="Enter Employee Code"
                value={employeeForm.employee_code || ""}
                onChange={(e) => {
                 setEmployeeForm({
                 ...employeeForm,
                 employee_code: e.target.value,
                  });
                 setIsEmployeeCodeAuto(false);
                 clearFieldError("employee_code");
                 }}
                className={`h-9 w-full rounded-xl border bg-surface pl-8 pr-2 text-xs outline-none transition focus:ring-4 ${
                  formErrors.employee_code
                    ? "border-red-500 focus:border-red-500 focus:ring-red-100"
                    : "border-border-color focus:border-indigo-500 focus:ring-indigo-100"
                }`}
              />

            </div>

            <button
              type="button"
              onClick={generateEmployeeCode}
              disabled={generatingEmployeeCode}
              className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl bg-gradient-to-r from-indigo-600 to-blue-500 px-3 text-xs font-semibold text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {generatingEmployeeCode ? (
                <RefreshCw size={13} className="animate-spin" />
              ) : (
                <Sparkles size={13} />
              )}
              Generate Code
            </button>

          </div>

          {formErrors.employee_code && (
            <p className="mt-1 px-1 text-xs text-red-500 dark:text-red-400">
              {formErrors.employee_code}
            </p>
          )}

        </div>

        {/* Employee Name */}

        <div>

          <label className="mb-1 px-1 block text-[13px] font-semibold text-text-primary">
            Employee Name <span className="text-red-500 dark:text-red-400">*</span>
          </label>

          <div className="relative">

            <User
              size={14}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted"
            />

            <input
              ref={(el) => (employeeFieldRefs.current.employee_name = el)}
              type="text"
              placeholder="Enter Employee Name"
              value={employeeForm.employee_name || ""}
             onChange={(e) => {
  setEmployeeForm({
    ...employeeForm,
    employee_name: e.target.value,
  });
  clearFieldError("employee_name");
}}
              className={`h-9 w-full rounded-2xl border bg-surface pl-8 pr-4 text-xs outline-none transition focus:ring-4 ${
                formErrors.employee_name
                  ? "border-red-500 focus:border-red-500 focus:ring-red-100"
                  : "border-border-color focus:border-indigo-500 focus:ring-indigo-100"
              }`}
            />

          </div>

          {formErrors.employee_name && (
            <p className="mt-1 px-1 text-xs text-red-500 dark:text-red-400">
              {formErrors.employee_name}
            </p>
          )}

        </div>

        {/* Circle */}

        <div>

          <label className="mb-1 px-1 block text-[13px] font-semibold text-text-primary">
            Select Circle <span className="text-red-500 dark:text-red-400">*</span>
          </label>

          <div className="relative">

            <MapPin
              size={14}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted"
            />

            <select
              ref={(el) => (employeeFieldRefs.current.circle = el)}
              value={employeeForm.circle}
             onChange={(e) => {
  setEmployeeForm({
    ...employeeForm,
    circle: e.target.value,
    cmp: "",
  });
  clearFieldError("circle");
}}
              className={`h-9 w-full rounded-2xl border bg-surface pl-8 pr-4 text-xs outline-none transition focus:ring-4 ${
                formErrors.circle
                  ? "border-red-500 focus:border-red-500 focus:ring-red-100"
                  : "border-border-color focus:border-indigo-500 focus:ring-indigo-100"
              }`}
            >

              <option value="">
                Select Circle
              </option>

              <option value="Punjab">
                Punjab
              </option>

              <option value="Delhi">
                Delhi
              </option>

              <option value="Haryana">
                Haryana
              </option>

              <option value="UP East">
                UP East
              </option>

            </select>

          </div>

          {formErrors.circle && (
            <p className="mt-1 px-1 text-xs text-red-500 dark:text-red-400">
              {formErrors.circle}
            </p>
          )}

        </div>

        {/* CMP */}

        <div>

          <label className="mb-1 px-1 block text-[13px] font-semibold text-text-primary">
            Select CMP <span className="text-red-500 dark:text-red-400">*</span>
          </label>

          <div className="relative">

            <Building2
              size={14}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted"
            />

            <select
              ref={(el) => (employeeFieldRefs.current.cmp = el)}
              value={employeeForm.cmp}
             onChange={(e) => {
  setEmployeeForm({
    ...employeeForm,
    cmp: e.target.value,
  });
  clearFieldError("cmp");
}}
              className={`h-9 w-full rounded-2xl border bg-surface pl-8 pr-4 text-xs outline-none transition focus:ring-4 ${
                formErrors.cmp
                  ? "border-red-500 focus:border-red-500 focus:ring-red-100"
                  : "border-border-color focus:border-indigo-500 focus:ring-indigo-100"
              }`}
            >

              <option value="">
                Select CMP
              </option>

             {employeeForm.circle &&
  circleCmpData[
    employeeForm.circle
  ]?.map((cmp) => (
                  <option
                    key={cmp}
                    value={cmp}
                  >
                    {cmp}
                  </option>
                ))}

            </select>

          </div>

          {formErrors.cmp && (
            <p className="mt-1 px-1 text-xs text-red-500 dark:text-red-400">{formErrors.cmp}</p>
          )}

        </div>

        {/* Designation */}

        <div>

          <label className="mb-1 px-1 block text-[13px] font-semibold text-text-primary">
            Designation <span className="text-red-500 dark:text-red-400">*</span>
          </label>

          <div className="relative">

            <BadgeCheck
              size={14}
              className="pointer-events-none absolute left-2 top-1/2 z-10 -translate-y-1/2 text-text-muted"
            />

            <Select
              ref={(el) => (employeeFieldRefs.current.designation = el)}
              styles={getDesignationSelectStyles(Boolean(formErrors.designation))}
              placeholder="Select Designation"
              options={designationSelectOptions}
              value={
                designationSelectOptions.find(
                  (item) => item.value === employeeForm.designation
                ) || null
              }
              onChange={(selected) => {
                setEmployeeForm({
                  ...employeeForm,
                  designation: selected?.value || "",
                });
                clearFieldError("designation");
              }}
              isClearable
              isSearchable
              classNamePrefix="designation-select"
            />

          </div>

          {formErrors.designation && (
            <p className="mt-1 px-1 text-xs text-red-500 dark:text-red-400">
              {formErrors.designation}
            </p>
          )}

        </div>

        {/* Aadhaar */}

        <div>

          <label className="mb-1 px-1 block text-[13px] font-semibold text-text-primary">
            Aadhaar Number <span className="text-red-500 dark:text-red-400">*</span>
          </label>

          <div className="relative">

            <CreditCard
              size={14}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted"
            />

            <input
              ref={(el) => (employeeFieldRefs.current.aadhaar_no = el)}
              type="text"
              inputMode="numeric"
              maxLength={12}
              placeholder="Enter 12-digit Aadhaar Number"
              value={employeeForm.aadhaar_no || ""}
              onChange={(e) => {
                const digitsOnly = e.target.value.replace(/\D/g, "").slice(0, 12);
                setEmployeeForm({
                  ...employeeForm,
                  aadhaar_no: digitsOnly,
                });
                clearFieldError("aadhaar_no");
              }}
              className={`h-9 w-full rounded-2xl border bg-surface pl-8 pr-4 text-xs outline-none transition focus:ring-4 ${
                formErrors.aadhaar_no
                  ? "border-red-500 focus:border-red-500 focus:ring-red-100"
                  : "border-border-color focus:border-indigo-500 focus:ring-indigo-100"
              }`}
            />

          </div>

          {formErrors.aadhaar_no && (
            <p className="mt-1 px-1 text-xs text-red-500 dark:text-red-400">
              {formErrors.aadhaar_no}
            </p>
          )}

        </div>

        <div>

  <label className="mb-1 px-1 block text-[13px] font-semibold text-text-primary">
    NTH Salary
  </label>

  <input
    type="number"
    placeholder="Enter NTH Salary"
    value={employeeForm.nth_salary || ""}
    onChange={(e) =>
      setEmployeeForm({
        ...employeeForm,
        nth_salary: e.target.value,
      })
    }
    className="h-9 w-full rounded-2xl border border-border-color bg-surface px-4 text-xs outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
  />

</div>

      </div>

      {/* BULK UPLOAD */}

      <div className="p-4 mt-3 rounded-[14px] border border-emerald-200 dark:border-emerald-500/20 bg-gradient-to-br from-emerald-50 to-white ">

        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">

          <div className="flex items-start gap-4">

            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-500/15">

              <FileSpreadsheet
                size={14}
                className="text-emerald-600 dark:text-emerald-400"
              />

            </div>

            <div>

              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-emerald-600 dark:text-emerald-400">
                BULK UPLOAD
              </p>

              <h3 className="mt-1 text-sm font-semibold text-text-primary">
                Upload Excel File
              </h3>

              <p className="mt-1 text-sm text-text-muted">
                Accepts `.xlsx`, `.xls`, and `.csv` employee sheets.
              </p>

            </div>

          </div>

          {/* BUTTONS */}

          <div className="flex items-center gap-4">

            <label className="flex cursor-pointer items-center gap-3 rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-lg">

              <FileSpreadsheet size={14} />

              Select Excel

             <input
  type="file"
  accept=".xlsx,.xls,.csv"
  onChange={(e) =>
    setExcelFile(e.target.files?.[0] || null)
  }
  className="hidden"
/>

            </label>

    <button
  onClick={handleExcelUpload}
  disabled={uploadingExcel}
  className="flex items-center gap-3 rounded-2xl border border-emerald-300 dark:border-emerald-500/30 bg-surface px-4 py-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400 disabled:opacity-60"
>
  <Upload size={14} />
  {uploadingExcel ? "Uploading..." : "Upload File"}
</button>

          </div>

        </div>

        {/* DROP AREA */}

        <div className="mt-2 rounded-[14px] border-2 border-dashed border-border-strong bg-surface px-4 py-4 text-center">

         <p className="text-sm font-semibold text-text-secondary">
  {excelFile ? excelFile.name : "No file selected"}
</p>

          <p className="mt-1 text-xs text-text-muted">
            Drag & drop your file here or click to browse
          </p>

        </div>

      </div>

    </div>

    {/* FOOTER */}

    <div className="flex items-center justify-end gap-5 border-t border-border-color bg-surface-muted px-4 py-4">

      <button
        onClick={() => {
          setShowModal(false);
          setFormErrors({});
        }}
        className="rounded-2xl border border-border-strong bg-surface px-4 py-2 text-sm font-semibold text-text-secondary transition hover:bg-surface-muted"
      >
        Cancel
      </button>

  <button
  onClick={handleAddEmployee}
  disabled={savingEmployee}
  className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-blue-500 px-4 py-2 text-sm font-semibold text-white shadow-xl transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
>
  {savingEmployee && (
    <RefreshCw className="h-4 w-4 animate-spin" />
  )}

  {savingEmployee ? "Saving..." : "Save Employee"}
</button>

    </div>

  </div>

</div>

)}

{/* DELETE CONFIRMATION MODAL */}

<AnimatePresence>
  {deleteTarget && (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/40 p-4 backdrop-blur-md"
      onClick={closeDeleteModal}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 12 }}
        transition={{ type: "spring", stiffness: 320, damping: 26 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-[18px] bg-surface shadow-[0_30px_80px_rgba(15,23,42,0.3)]"
      >
        {/* HEADER */}
        <div className="relative overflow-hidden border-b border-border-color bg-gradient-to-r from-rose-50 via-white to-red-50 px-6 py-5">
          <div className="absolute right-0 top-0 h-16 w-16 rounded-full bg-rose-100 dark:bg-rose-500/15 opacity-60 blur-3xl" />

          <div className="relative flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-gradient-to-br from-rose-500 to-red-500 text-white shadow-lg shadow-rose-200">
              <Trash2 className="h-5 w-5" />
            </div>

            <div>
              <h3 className="text-base font-semibold tracking-[-0.02em] text-text-primary">
                {deleteTarget.type === "single"
                  ? "Delete Employee?"
                  : `Delete ${selectedRows.length} Employees?`}
              </h3>
              <p className="mt-0.5 text-sm text-text-muted">
                This action is permanent and cannot be undone.
              </p>
            </div>
          </div>
        </div>

        {/* BODY */}
        <div className="px-6 py-5">
          {deleteTarget.type === "single" ? (
            <div className="rounded-[14px] border border-border-color bg-surface-muted/70 px-4 py-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                    Employee Name
                  </p>
                  <p className="mt-0.5 text-sm font-semibold text-text-primary">
                    {deleteTarget.item?.employee_name || "-"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                    Employee Code
                  </p>
                  <p className="mt-0.5 text-sm font-semibold text-blue-600 dark:text-blue-400">
                    {deleteTarget.item?.employee_code || "-"}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-[14px] border border-rose-200 dark:border-rose-500/20 bg-rose-50 dark:bg-rose-500/10/70 px-4 py-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-100 dark:bg-rose-500/15 text-sm font-bold text-rose-600 dark:text-rose-400">
                {selectedRows.length}
              </div>
              <p className="text-sm font-medium text-text-secondary">
                {selectedRows.length === 1
                  ? "1 selected employee record"
                  : `${selectedRows.length} selected employee records`}{" "}
                will be permanently removed.
              </p>
            </div>
          )}

          <p className="mt-3 px-1 text-xs text-text-muted">
            The record{deleteTarget.type === "bulk" ? "s" : ""} will be
            deleted from the New Joining database and cannot be recovered.
          </p>
        </div>

        {/* FOOTER */}
        <div className="flex items-center justify-end gap-3 border-t border-border-color bg-surface-muted px-6 py-4">
          <button
            type="button"
            onClick={closeDeleteModal}
            disabled={deleting}
            className="rounded-2xl border border-border-strong bg-surface px-4 py-2 text-sm font-semibold text-text-secondary transition hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={confirmDelete}
            disabled={deleting}
            className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-rose-500 to-red-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-rose-200 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {deleting ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            {deleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )}
</AnimatePresence>

      </div>
    </div>
  );
}
