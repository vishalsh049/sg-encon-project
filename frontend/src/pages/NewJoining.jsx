import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
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
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  UserPlus2,
  Users,
  X,
  User,
  MapPin,
  Building2,
  BadgeCheck,
  CreditCard,
  Upload,
} from "lucide-react";
import { authFetch, buildApiUrl } from "../lib/api";
import { getStoredSession } from "../lib/session";

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

function MetricCard({ icon: Icon, label, value, accent, note }) {
  return (
    <motion.div
      whileHover={{ y: -3 }}
      className="group relative overflow-hidden rounded-[18px] border border-white/70 bg-white/85 px-4 py-3 backdrop-blur-2xl"
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
            <p className="text-sm font-medium text-slate-500">{label}</p>
            <p className="mt-1 text-[14px] font-semibold tracking-[-0.04em] text-slate-900">
              {value}
            </p>
          </div>
        </div>
       
      </div>
      <p className="relative mt-1 text-xs text-slate-500">{note}</p>
    </motion.div>
  );
}

function FilterChip({ active, tone, children, onClick }) {
  const toneClass =
    tone === "green"
      ? "bg-emerald-500"
      : tone === "red"
        ? "bg-rose-500"
        : tone === "amber"
          ? "bg-amber-500"
          : tone === "blue"
            ? "bg-blue-500"
            : "bg-slate-400";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm font-medium transition ${
        active
          ? "border-blue-200 bg-blue-50 text-blue-700 shadow-[0_8px_20px_rgba(59,130,246,0.14)]"
          : "border-slate-200/80 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
      }`}
    >
      <span className={`h-2.5 w-2.5 rounded-full ${toneClass}`} />
      {children}
    </button>
  );
}

function StatusPill({ variant, children }) {
  const styles = {
    pending:
      "border border-amber-200/80 bg-amber-50 text-amber-700",
    active:
      "border border-emerald-200/80 bg-emerald-50 text-emerald-700",
    joined:
      "border border-cyan-200/80 bg-cyan-50 text-cyan-700",
    not_joined:
      "border border-rose-200/80 bg-rose-50 text-rose-700",
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
              className="border-b border-slate-100 px-4 py-5"
            >
              <div className="h-4 rounded-xl bg-slate-100" />
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
      className={`inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-2xl px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
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
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedRows, setSelectedRows] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [deletingId, setDeletingId] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [excelFile, setExcelFile] = useState(null);
  const [uploadingExcel, setUploadingExcel] = useState(false);
  const [savingEmployee, setSavingEmployee] = useState(false);
  const [now, setNow] = useState(() => new Date());

  const isAllCircleUser = useMemo(
    () => isAllCircleAccess(getStoredSession()?.circle),
    []
  );

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
  l2_approval: "Pending",
  employee_status: "Active",
});

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

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

  const filteredData = useMemo(() => {
    return data.filter((item) =>
      Object.values(item).some((value) =>
        String(value || "").toLowerCase().includes(search.toLowerCase())
      )
    );
  }, [data, search]);

  const totalPages = Math.max(1, Math.ceil(filteredData.length / pageSize));

  const paginatedData = filteredData.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const joinedCount = data.filter(
  (item) => item.joining_status === "Joined"
).length;
const pendingCount = data.filter((item) =>
  String(item.l2_approval || "")
    .toLowerCase()
    .includes("pending")
).length;
  const activeCount = data.filter(
    (item) => String(item.employee_status || "Active") !== "Inactive"
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

  const handleDelete = async (id) => {
    const confirmDelete = window.confirm("Delete record?");
    if (!confirmDelete) return;

    try {
      setDeletingId(id);
      await authFetch(buildApiUrl(`/api/new-joining/delete/${id}`), {
        method: "DELETE",
      });
      loadData();
    } catch (error) {
      console.log(error);
    } finally {
      setDeletingId(null);
    }
  };

const handleBulkDelete = async () => {
  if (selectedRows.length === 0) {
    alert("Please select records");
    return;
  }

  const confirmDelete = window.confirm(
    `Delete ${selectedRows.length} selected records?`
  );

  if (!confirmDelete) return;

  try {
    await Promise.all(
      selectedRows.map((id) =>
        authFetch(
          buildApiUrl(`/api/new-joining/delete/${id}`),
          {
            method: "DELETE",
          }
        )
      )
    );

    alert("Records deleted successfully");

    setSelectedRows([]);
    loadData();
  } catch (error) {
    console.log(error);
    alert("Delete failed");
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
      buildApiUrl(`/api/new-joining/l2-approval/${id}`),
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          l2_approval: status,
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

 const handleAddEmployee = async () => {
  try {
    setSavingEmployee(true);

    const response = await authFetch(
      buildApiUrl("/api/new-joining/add-employee"),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(employeeForm),
      }
    );

    const result = await response.json();

    if (!result.success) {
      alert("Failed");
      return;
    }

    alert("Employee Added Successfully");

    setShowModal(false);

   setEmployeeForm({
  employee_code: "",
  employee_name: "",
  circle: "",
  cmp: "",
  designation: "",
  aadhaar_no: "",
  nth_salary: "",
  joining_status: "Pending",
  l2_approval: "Pending",
  employee_status: "Active",
});

    loadData();
  } catch (error) {
    console.log(error);
    alert("Something went wrong");
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
      value: data.length.toLocaleString(),
      note: "Live employee count synced from records",
      accent: "from-blue-500 to-indigo-500",
      icon: Users,
    },
    {
      label: "Joined Today",
      value: String(joinedCount).padStart( "0"),
      note: "Employees successfully marked as joined",
      accent: "from-emerald-400 to-teal-500",
      icon: UserPlus2,
    },
    {
      label: "Pending Verification",
      value: pendingCount.toLocaleString(),
      note: "Records needing approval or verification",
      accent: "from-amber-400 to-orange-500",
      icon: ShieldCheck,
    },
    {
      label: "Active Employees",
      value: activeCount.toLocaleString(),
      note: "Current active employment profiles",
      accent: "from-violet-500 to-fuchsia-500",
      icon: BriefcaseBusiness,
    },
  ];

  const filterChips = [
    { label: `All (${filteredData.length})`, tone: "blue", value: "" },
    { label: "Joined", tone: "green", value: "Joined" },
    { label: "Not Joined", tone: "red", value: "Not Joined" },
    { label: "Pending", tone: "amber", value: "Pending" },
    { label: "Active", tone: "green", value: "Active" },
  ];

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
     
      </div>

      <div className="relative mx-auto max-w-[1450px]">
        <div className="mb-3 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-4">
         

            <div>
              <h1 className="text-sm font-semibold tracking-[-0.05em] text-slate-900 sm:text-xl">
                New Joining
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Employee Joining Management
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:justify-end">

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

        <div className="mb-2 grid gap-2 grid-cols-4">
          {statCards.map((card) => (
            <MetricCard key={card.label} {...card} />
          ))}
        </div>

        <div className="mb-2 rounded-[18px] border border-white/70 bg-white/78 px-2 py-1 backdrop-blur-2xl">
          <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
            <div className="grid flex-1 gap-2 grid-cols-5">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search employee by name, code, aadhaar..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-10 w-full rounded-[14px] border border-slate-200/80 bg-white pl-10 pr-4 text-sm text-slate-700 outline-none transition focus:border-blue-200 focus:ring-4 focus:ring-blue-50"
                />
              </label>

              <label className="relative block">
                <select
                  value={circleFilter}
                  onChange={(e) => setCircleFilter(e.target.value)}
                  className="h-10 w-full appearance-none rounded-[14px] border border-slate-200/80 bg-white px-4 pr-10 text-sm text-slate-700 outline-none transition focus:border-blue-200 focus:ring-4 focus:ring-blue-50"
                >
                  <option value="">All Circles</option>
                  {Object.keys(circleCmpData).map((circle) => (
                    <option key={circle} value={circle}>
                      {circle}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              </label>

              <label className="relative block">
                <select
                  value={cmpFilter}
                  onChange={(e) => setCmpFilter(e.target.value)}
                  className="h-10 w-full appearance-none rounded-[14px] border border-slate-200/80 bg-white px-4 pr-10 text-sm text-slate-700 outline-none transition focus:border-blue-200 focus:ring-4 focus:ring-blue-50"
                >
                  <option value="">All Clusters</option>
                  {(circleFilter ? circleCmpData[circleFilter] : [])?.map((cmp) => (
                    <option key={cmp} value={cmp}>
                      {cmp}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              </label>

              <label className="relative block">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="h-10 w-full appearance-none rounded-[14px] border border-slate-200/80 bg-white px-4 pr-10 text-sm text-slate-700 outline-none transition focus:border-blue-200 focus:ring-4 focus:ring-blue-50"
                >
                  <option value="">All Status</option>
                  <option value="Pending">Pending</option>
                  <option value="Joined">Joined</option>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              </label>

                <div className="flex flex-wrap items-center gap-3">

              <button
                type="button"
                onClick={() => {
                  const header = [
                    "Employee Code",
                    "Employee Name",
                    "Circle",
                    "CMP / Cluster",
                    "Designation",
                    "Aadhaar Number",
                    "NTH Salary",
                    "L2 Approval",
                    "Joining Status",
                    "Employee Status",
                  ];
                  const csv = [
                    header.join(","),
                    ...filteredData.map((row) =>
                      [
                        row.employee_code || "",
                        row.employee_name || "",
                        row.circle || "",
                        row.cmp || row.cluster || "",
                        row.designation || "",
                        row.aadhaar_no || "",
                        row.nth_salary || "",
                        row.l2_approval || "",
                        row.joining_status || "",
                        row.employee_status || "",
                      ]
                        .map((value) => `"${String(value).replaceAll('"', '""')}"`)
                        .join(",")
                    ),
                  ].join("\n");

                  const blob = new Blob([csv], {
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
                }}
                className="inline-flex h-10 items-center gap-2 rounded-[14px] border border-blue-100 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
              >
                <Download className="h-4 w-4" />
                Export
              </button>
            </div>  
            </div>

          
          </div>

          
        </div>

        <div className="overflow-visible rounded-[18px] border border-white/70 bg-white/85 backdrop-blur-2xl">
          <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-2 sm:flex-row sm:items-center sm:justify-between sm:px-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                <FileSpreadsheet className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold tracking-[0.02em] text-slate-900">
                  Employee Records
                </h2>
                <p className="text-sm text-slate-500 tracking-[-0.01em]">
                  Review and manage employee joining records
                </p>
              </div>
            </div>

            <div className="text-sm text-slate-500">
              Total Records:{" "}
              <span className="font-semibold text-slate-900">
                {filteredData.length}
              </span>
            </div>
          </div>

  <div
  className="overflow-x-auto"
  style={{ overflowY: "visible" }}
>
   <table className="min-w-full border-collapse">
     <thead>
      <tr className="bg-slate-50/90">
        <th className="border-b border-slate-100 px-4 py-2 text-left">
          <input
           type="checkbox"
           checked={
           paginatedData.length > 0 &&
           paginatedData.every((row) =>
           selectedRows.includes(row.id)
           )
          }
          onChange={handleSelectAll}
         className="h-3 w-3 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
         />
        </th>
                  {[
                    "Employee Code",
                    "Employee Name",
                    "Circle",
                    "CMP / Cluster",
                    "Designation",
                    "Aadhaar Number",
                    "NTH Salary",
                    
                    "L2 Approval",
                     "Joining Status",
                    "Employee Status",
                    "Action",
                  ].map((heading) => (
                    <th
                      key={heading}
                      className="border-b border-slate-200 px-4 py-2 text-left text-sm font-semibold text-slate-600"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {tableLoading ? (
                  <LoadingSkeletonRows />
                ) : filteredData.length === 0 ? (
                  <tr>
                    <td
                      colSpan="11"
                      className="px-4 py-20 text-center text-sm font-medium text-slate-400"
                    >
                      No Records Found
                    </td>
                  </tr>
                ) : (
                  paginatedData.map((item, index) => (
                    <tr
                      key={item.id || index}
                      className="transition hover:bg-slate-50/70 border-b border-slate-200"
                    >
                      <td className="border-b border-slate-100 px-4 py-2">
                        <input
                          type="checkbox"
                          checked={selectedRows.includes(item.id)}
                          onChange={() => handleSelectRow(item.id)}
                          className="h-3 w-3 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                      </td>
                      <td className="border-b border-slate-100 px-4 py-2 text-sm font-semibold text-blue-600">
                        {item.employee_code || "-"}
                      </td>
                      <td className="border-b border-slate-100 px-4 py-2 text-sm font-semibold text-slate-800">
                        {item.employee_name || "-"}
                      </td>
                      <td className="border-b border-slate-100 px-4 py-2 text-sm text-slate-600">
                        {item.circle || "-"}
                      </td>
                      <td className="border-b border-slate-100 px-4 py-2 text-sm text-slate-600">
                        {item.cmp || item.cluster || "-"}
                      </td>
                      <td className="border-b border-slate-100 px-4 py-2 text-sm text-slate-600">
                        {item.designation || "-"}
                      </td>
                      <td className="border-b border-slate-100 px-4 py-2 text-sm text-slate-600">
                        {item.aadhaar_no || "-"}
                      </td>
                      <td className="border-b border-slate-100 px-4 py-2 text-sm text-slate-600">
  ₹ {Number(item.nth_salary || 0).toLocaleString("en-IN")}
</td>
                    
 <td className="relative border-b border-slate-100 px-4 py-2 overflow-visible">

  <div className="flex flex-col gap-2">

    <StatusPill
      variant={
        item.l2_approval === "Approved"
          ? "active"
          : item.l2_approval === "Rejected"
          ? "not_joined"
          : "pending"
      }
    >
      {item.l2_approval || "Pending"}
    </StatusPill>

    {isAllCircleUser && (
      <select
        value={item.l2_approval || "Pending"}
        onChange={(e) => handleL2Approval(item.id, e.target.value)}
        className="h-8 w-32 rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs font-medium text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
      >
        <option value="Pending">🟡 Pending</option>
        <option value="Approved">🟢 Approved</option>
        <option value="Rejected">🔴 Rejected</option>
      </select>
    )}

  </div>

</td>

<td className="border-b border-slate-100 px-4 py-2 text-sm">

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
                      <td className="border-b border-slate-100 px-4 py-2 text-sm">
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
                      <td className="border-b border-slate-100 px-4 py-2">
                       <div className="flex items-center gap-2 whitespace-nowrap">
                         <TableActionButton
                         disabled={item.l2_approval !== "Approved"}
                         onClick={() =>
                           handleStatusUpdate(item.id, "Joined", item)
                         }
                            className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                          >
                            Joined
                          </TableActionButton>
                          <TableActionButton
                            onClick={() =>
                              handleStatusUpdate(item.id, "Not Joined")
                            }
                            className="bg-rose-50 text-rose-700 hover:bg-rose-100"
                          >
                            Not Joined
                          </TableActionButton>
                          
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-4 px-2 py-2 sm:flex-row sm:items-center sm:justify-between sm:px-4">
            <div className="text-sm text-slate-500">
              Total Records:{" "}
              <span className="font-semibold text-slate-800">
                {filteredData.length}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
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
                className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
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
                  className="h-8 appearance-none rounded-xl border border-slate-200 bg-white px-4 pr-10 text-sm text-slate-700 outline-none transition focus:border-blue-200 focus:ring-4 focus:ring-blue-50"
                >
                  <option value={10}>10 / page</option>
                  <option value={25}>25 / page</option>
                  <option value={50}>50 / page</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              </label>
            </div>
          </div>
        </div>

     
{/* MODAL */}

{showModal && (

<div className="fixed inset-0 z-[99999] overflow-hidden bg-black/40 backdrop-blur-md p-4">

<div className="mx-auto my-4 h-[90vh] w-full max-w-4xl overflow-hidden rounded-[14px] bg-white shadow-[0_30px_80px_rgba(15,23,42,0.25)] flex flex-col">

    {/* HEADER */}

    <div className="relative overflow-hidden border-b border-slate-200 bg-gradient-to-r from-violet-50 via-white to-sky-50 px-4 py-6">

      <div className="absolute right-0 top-0 h-10 w-10 rounded-full bg-violet-100 blur-3xl opacity-50" />

      <div className="flex items-start justify-between">

        <div className="flex items-start gap-4">

          {/* ICON */}

          <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-gradient-to-br from-violet-100 to-indigo-100">

            <Plus className="h-4 w-4 text-indigo-600" />

          </div>

          {/* TITLE */}

          <div>

            <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-indigo-700">
              ADD NEW EMPLOYEE
            </span>

           

            <p className="mt-1 text-sm text-slate-500">
              Fill in employee details and upload supporting data in one flow.
            </p>

          </div>

        </div>

        {/* CLOSE */}

        <button
          onClick={() => setShowModal(false)}
          className="flex h-10 w-10 items-center justify-center rounded-3xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50"
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

          <label className="mb-1 px-1 block text-[13px] font-semibold text-slate-800">
            Employee Code <span className="text-red-500">*</span>
          </label>

          <div className="relative">

            <User
              size={14}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400"
            />

            <input
              type="text"
              placeholder="Enter Employee Code"
              value={employeeForm.employee_code || ""}
              onChange={(e) =>
               setEmployeeForm({
               ...employeeForm,
               employee_code: e.target.value,
                })
               }
              className="h-9 w-full rounded-xl border border-slate-200 bg-white pl-8 pr-2 text-xs outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
            />

          </div>

        </div>

        {/* Employee Name */}

        <div>

          <label className="mb-1 px-1 block text-[13px] font-semibold text-slate-800">
            Employee Name <span className="text-red-500">*</span>
          </label>

          <div className="relative">

            <User
              size={14}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400"
            />

            <input
              type="text"
              placeholder="Enter Employee Name"
              value={employeeForm.employee_name || ""}
             onChange={(e) =>
  setEmployeeForm({
    ...employeeForm,
    employee_name: e.target.value,
  })
}
              className="h-9 w-full rounded-2xl border border-slate-200 bg-white pl-8 pr-4 text-xs outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
            />

          </div>

        </div>

        {/* Circle */}

        <div>

          <label className="mb-1 px-1 block text-[13px] font-semibold text-slate-800">
            Select Circle <span className="text-red-500">*</span>
          </label>

          <div className="relative">

            <MapPin
              size={14}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400"
            />

            <select
              value={employeeForm.circle}
             onChange={(e) =>
  setEmployeeForm({
    ...employeeForm,
    circle: e.target.value,
    cmp: "",
  })
}
              className="h-9 w-full rounded-2xl border border-slate-200 bg-white pl-8 pr-4 text-xs outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
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

        </div>

        {/* CMP */}

        <div>

          <label className="mb-1 px-1 block text-[13px] font-semibold text-slate-800">
            Select CMP <span className="text-red-500">*</span>
          </label>

          <div className="relative">

            <Building2
              size={14}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400"
            />

            <select
              value={employeeForm.cmp}
             onChange={(e) =>
  setEmployeeForm({
    ...employeeForm,
    cmp: e.target.value,
  })
}
              className="h-9 w-full rounded-2xl border border-slate-200 bg-white pl-8 pr-4 text-xs outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
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

        </div>

        {/* Designation */}

        <div>

          <label className="mb-1 px-1 block text-[13px] font-semibold text-slate-800">
            Designation <span className="text-red-500">*</span>
          </label>

          <div className="relative">

            <BadgeCheck
              size={14}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400"
            />

        <input
  type="text"
  placeholder="Select Designation"
  value={employeeForm.designation || ""}
  onChange={(e) =>
    setEmployeeForm({
      ...employeeForm,
      designation: e.target.value,
    })
  }
  className="h-9 w-full rounded-2xl border border-slate-200 bg-white pl-8 pr-4 text-xs outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
/>

          </div>

        </div>

        {/* Aadhaar */}

        <div>

          <label className="mb-1 px-1 block text-[13px] font-semibold text-slate-800">
            Aadhaar Number <span className="text-red-500">*</span>
          </label>

          <div className="relative">

            <CreditCard
              size={14}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400"
            />

            <input
              type="text"
              placeholder="Enter Aadhaar Number"
              value={employeeForm.aadhaar_no || ""}
              onChange={(e) =>
                setEmployeeForm({
                  ...employeeForm,
                  aadhaar_no: e.target.value,
                })
              }
              className="h-9 w-full rounded-2xl border border-slate-200 bg-white pl-8 pr-4 text-xs outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
            />

          </div>

        </div>

        <div>

  <label className="mb-1 px-1 block text-[13px] font-semibold text-slate-800">
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
    className="h-9 w-full rounded-2xl border border-slate-200 bg-white px-4 text-xs outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
  />

</div>

      </div>

      {/* BULK UPLOAD */}

      <div className="p-4 mt-3 rounded-[14px] border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white ">

        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">

          <div className="flex items-start gap-4">

            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100">

              <FileSpreadsheet
                size={14}
                className="text-emerald-600"
              />

            </div>

            <div>

              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-emerald-600">
                BULK UPLOAD
              </p>

              <h3 className="mt-1 text-sm font-semibold text-slate-900">
                Upload Excel File
              </h3>

              <p className="mt-1 text-sm text-slate-500">
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
  className="flex items-center gap-3 rounded-2xl border border-emerald-300 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 disabled:opacity-60"
>
  <Upload size={14} />
  {uploadingExcel ? "Uploading..." : "Upload File"}
</button>

          </div>

        </div>

        {/* DROP AREA */}

        <div className="mt-2 rounded-[14px] border-2 border-dashed border-slate-300 bg-white px-4 py-4 text-center">

         <p className="text-sm font-semibold text-slate-700">
  {excelFile ? excelFile.name : "No file selected"}
</p>

          <p className="mt-1 text-xs text-slate-400">
            Drag & drop your file here or click to browse
          </p>

        </div>

      </div>

    </div>

    {/* FOOTER */}

    <div className="flex items-center justify-end gap-5 border-t border-slate-200 bg-slate-50 px-4 py-4">

      <button
        onClick={() => setShowModal(false)}
        className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
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



      </div>
    </div>
  );
}
