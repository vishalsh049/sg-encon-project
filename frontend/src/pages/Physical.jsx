  import React, { useEffect, useRef, useState } from "react";
 import {
  UserPlus,
  Upload,
  Eye,
  Pencil,
   Download,
  Trash2,
  RotateCcw,
  Clock,
  BarChart3,
  ArrowLeft,
  X,
  User,
  Phone,
  Building2,
  ShieldCheck,
  CreditCard,
  Wallet,
  LogOut,
  FileText,
  Users,
  Sparkles,
  MapPin,
  Mail,
  Laptop,
  Landmark,
  IdCard,
  Fingerprint,
  Code2,
  Hash,
  Home,
  Briefcase,
  CalendarDays,
  BadgeCheck,
  RefreshCw,
  History,
} from "lucide-react";
import Swal from "sweetalert2";
import { motion } from "framer-motion";
import PremiumDatePicker from "../components/PremiumDatePicker";
import ValidationErrorModal from "../components/ValidationErrorModal";

  import Select from "react-select";
  import * as XLSX from "xlsx";
  import { saveAs } from "file-saver";
  import { authFetch, buildApiUrl } from "../lib/api";
  import useDesignationOptions from "../hooks/useDesignationOptions";
  import useCircleOptions from "../hooks/useCircleOptions";

  function formatCircleTimestamp(value) {
    if (!value) return "Never Uploaded";

    const date = new Date(value);
    if (Number.isNaN(date.valueOf())) return "Never Uploaded";

    const datePart = date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

    const timePart = date
      .toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      })
      .toUpperCase();

    return `${datePart}, ${timePart}`;
  }

  const UPLOADED_AT_MONTH_NAMES = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];

  // uploaded_at arrives as "YYYY-MM-DD HH:MM:SS" (dateStrings: true on the
  // backend pool); Safari cannot parse the space-separated form, so normalize
  // to ISO "T" before handing it to Date. Returns "--" for null/invalid values.
  function formatUploadedAt(value) {
    if (!value) return "--";

    const normalized = String(value).trim().replace(" ", "T");
    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) return "--";

    const day = String(parsed.getDate()).padStart(2, "0");
    const month = UPLOADED_AT_MONTH_NAMES[parsed.getMonth()];
    const year = parsed.getFullYear();
    const hours24 = parsed.getHours();
    const hours12 = hours24 % 12 || 12;
    const minutes = String(parsed.getMinutes()).padStart(2, "0");
    const ampm = hours24 >= 12 ? "PM" : "AM";

    return `${day}-${month}-${year} ${String(hours12).padStart(2, "0")}:${minutes} ${ampm}`;
  }

  function getEmployeeInitials(name) {
    const trimmed = String(name || "").trim();
    if (!trimmed) return "?";
    return (
      trimmed
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join("") || "?"
    );
  }

  const EMPLOYEE_DRAFT_STORAGE_KEY = "physical_add_employee_draft";

  const blankEmployeeForm = {
    circle: "",
    cmp: "",
    pprj_status: "",
    pprj_code: "",
    employee_code: "",
    employee_name: "",
    father_name: "",
    function_name: "",
    job_role: "",
    manpower_signoff_scope: "",
    scrum_job_role: "",
    mobile_number: "",
    dob: "",
    age: "",
    date_of_joining: "",
    employment_status: "",
    resigned_date: "",
    last_working_date: "",
    rm_code: "",
    reporting_manager: "",
    company_email_id: "",
    laptop_status: "",
    ifsc_code: "",
    bank_account_no: "",
    pan_no: "",
    aadhaar_no: "",
    uan_no: "",
    esic_ip_no: "",
    pf_no: "",
    gtli: "",
    nth_salary: "",
    remarks: "",
  };

  const EMPLOYEE_FORM_STEPS = [
    { id: "basic", label: "Basic Information", subtitle: "Personal Details" },
    { id: "organization", label: "Organization", subtitle: "Work Details" },
    { id: "signoff", label: "Signoff & Access", subtitle: "Access & Equipment" },
    { id: "banking", label: "Banking & Compliance", subtitle: "Statutory Details" },
    { id: "salary", label: "Salary Details", subtitle: "Compensation" },
    { id: "exit", label: "Exit Information", subtitle: "If Inactive" },
    { id: "remarks", label: "Additional Remarks", subtitle: "Notes" },
  ];

  function EmployeeFormSection({
    stepId,
    sectionRef,
    icon: Icon,
    iconClass,
    title,
    subtitle,
    badge,
    children,
  }) {
    return (
      <div
        id={`employee-step-${stepId}`}
        data-step-id={stepId}
        ref={sectionRef}
        className="scroll-mt-4 rounded-[18px] border border-slate-100 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:shadow-[0_8px_24px_rgba(15,23,42,0.06)]"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] ${iconClass}`}
            >
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-[14px] font-bold text-slate-800">{title}</h3>
              <p className="text-[12px] text-slate-400">{subtitle}</p>
            </div>
          </div>
          {badge}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {children}
        </div>
      </div>
    );
  }

  const employeeInputClass =
    "h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-[13px] text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50";

  function EmployeeField({ label, required, className = "", children }) {
    return (
      <div className={className}>
        <label className="mb-1.5 block px-0.5 text-[12px] font-semibold text-slate-600">
          {label} {required && <span className="text-rose-500">*</span>}
        </label>
        {children}
      </div>
    );
  }

  const PROFILE_VIEW_STEPS = [
    { id: "overview", label: "Overview", subtitle: "Summary", icon: Home },
    { id: "personal", label: "Personal & Role", subtitle: "Details", icon: User },
    { id: "work", label: "Work & Reporting", subtitle: "Details", icon: Briefcase },
    {
      id: "additional",
      label: "Additional Info",
      subtitle: "Compliance & IDs",
      icon: ShieldCheck,
    },
    { id: "documents", label: "Documents", subtitle: "Attachments", icon: FileText },
    { id: "activity", label: "Activity Log", subtitle: "History", icon: History },
  ];

  function ProfileSection({ stepId, sectionRef, icon: Icon, iconClass, title, children }) {
    return (
      <div
        id={`profile-step-${stepId}`}
        data-step-id={stepId}
        ref={sectionRef}
        className="scroll-mt-4 rounded-[18px] border border-slate-100 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
      >
        <div className="mb-4 flex items-center gap-3">
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${iconClass}`}
          >
            <Icon className="h-4 w-4" />
          </div>
          <h3 className="text-[14px] font-bold text-slate-800">{title}</h3>
        </div>
        {children}
      </div>
    );
  }

  function ProfileField({ icon: Icon, iconClass, label, value }) {
    return (
      <div className="flex items-center gap-3">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${iconClass}`}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-slate-400">{label}</p>
          <p className="truncate text-[13px] font-semibold text-slate-800">
            {value || "-"}
          </p>
        </div>
      </div>
    );
  }

  export default function Physical() {
    const [showModal, setShowModal] = useState(false);
    const [uploadedBy, setUploadedBy] = useState("");
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [validationError, setValidationError] = useState(null);
  const [circleCmpReport, setCircleCmpReport] = useState(null);
  const [jobRoleSearch, setJobRoleSearch] = useState("");
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [viewEmployee, setViewEmployee] = useState(null);
  const [saving, setSaving] = useState(false);

  // Prevent background scroll while any modal is open
  useEffect(() => {
    const anyOpen = showUploadModal || validationError !== null || circleCmpReport !== null;
    document.body.style.overflow = anyOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [showUploadModal, validationError, circleCmpReport]);

const handleView = (item) => {
  setViewEmployee(item);
};

const [activeProfileStep, setActiveProfileStep] = useState(
  PROFILE_VIEW_STEPS[0].id
);
const profileStepRefs = useRef({});
const profileScrollRef = useRef(null);

const closeViewEmployee = () => setViewEmployee(null);

const scrollToProfileStep = (id) => {
  profileStepRefs.current[id]?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
};

useEffect(() => {
  if (!viewEmployee) return undefined;
  const rootEl = profileScrollRef.current;
  if (!rootEl) return undefined;

  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      const nextStepId = visible[0]?.target?.dataset?.stepId;
      if (nextStepId) setActiveProfileStep(nextStepId);
    },
    { root: rootEl, rootMargin: "-10% 0px -70% 0px", threshold: 0 }
  );

  Object.values(profileStepRefs.current).forEach((el) => {
    if (el) observer.observe(el);
  });

  return () => observer.disconnect();
}, [viewEmployee]);

const handleDownloadProfile = () => {
  if (!viewEmployee) return;

  const rows = [
    ["Employee Code", viewEmployee.employee_code],
    ["Employee Name", viewEmployee.employee_name],
    ["Circle", viewEmployee.circle],
    ["CMP", viewEmployee.cmp],
    ["PPRJ Status", viewEmployee.pprj_status],
    ["PPRJ Code", viewEmployee.pprj_code],
    ["Father Name", viewEmployee.father_name],
    ["Function Name", viewEmployee.function_name],
    ["Job Role", viewEmployee.job_role],
    ["Manpower Signoff Scope", viewEmployee.manpower_signoff_scope],
    ["Scrum Job Role", viewEmployee.scrum_job_role],
    ["Mobile Number", viewEmployee.mobile_number],
    ["Date of Birth", viewEmployee.dob],
    ["Age", viewEmployee.age],
    ["Date of Joining", viewEmployee.date_of_joining],
    ["Employment Status", viewEmployee.employment_status],
    ["Resigned Date", viewEmployee.resigned_date],
    ["Last Working Date", viewEmployee.last_working_date],
    ["RM Code", viewEmployee.rm_code],
    ["Reporting Manager", viewEmployee.reporting_manager],
    ["Company Email", viewEmployee.company_email_id],
    ["Laptop Status", viewEmployee.laptop_status],
    ["IFSC Code", viewEmployee.ifsc_code],
    ["Bank Account No", viewEmployee.bank_account_no],
    ["PAN No", viewEmployee.pan_no],
    ["Aadhaar No", viewEmployee.aadhaar_no],
    ["UAN No", viewEmployee.uan_no],
    ["ESIC IP No", viewEmployee.esic_ip_no],
    ["PF No", viewEmployee.pf_no],
    ["GTLI", viewEmployee.gtli],
    ["NTH Salary", viewEmployee.nth_salary],
    ["Remarks", viewEmployee.remarks],
  ];

  const csv = rows
    .map(
      ([label, value]) =>
        `"${label}","${String(value ?? "-").replaceAll('"', '""')}"`
    )
    .join("\n");

  const blob = new Blob([String.fromCharCode(0xfeff), csv], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${viewEmployee.employee_code || "employee"}-profile.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
};

  const [showEmployeeModal, setShowEmployeeModal] = useState(false);


  const [isEditMode, setIsEditMode] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [employeeForm, setEmployeeForm] = useState(blankEmployeeForm);
  const [activeEmployeeStep, setActiveEmployeeStep] = useState(
    EMPLOYEE_FORM_STEPS[0].id
  );
  const employeeStepRefs = useRef({});
  const employeeScrollRef = useRef(null);

  const resetEmployeeForm = () => {
    setEmployeeForm(blankEmployeeForm);
    setIsEditMode(false);
    setEditingId(null);
  };

  const closeEmployeeModal = () => {
    setShowEmployeeModal(false);
    resetEmployeeForm();
  };

  const openAddEmployeeModal = () => {
    const savedDraft = localStorage.getItem(EMPLOYEE_DRAFT_STORAGE_KEY);

    if (savedDraft) {
      try {
        const draft = JSON.parse(savedDraft);
        if (window.confirm("A saved draft was found. Load it?")) {
          setEmployeeForm({ ...blankEmployeeForm, ...draft });
          setIsEditMode(false);
          setEditingId(null);
          setShowEmployeeModal(true);
          return;
        }
        localStorage.removeItem(EMPLOYEE_DRAFT_STORAGE_KEY);
      } catch (_error) {
        localStorage.removeItem(EMPLOYEE_DRAFT_STORAGE_KEY);
      }
    }

    resetEmployeeForm();
    setShowEmployeeModal(true);
  };

  const handleSaveEmployeeDraft = () => {
    localStorage.setItem(
      EMPLOYEE_DRAFT_STORAGE_KEY,
      JSON.stringify(employeeForm)
    );
    alert("Draft saved on this device. You can resume it next time you open Add Employee.");
  };

  const handleResetEmployeeForm = () => {
    if (!window.confirm("Reset all fields in this form?")) return;
    resetEmployeeForm();
  };

  const scrollToEmployeeStep = (id) => {
    employeeStepRefs.current[id]?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  useEffect(() => {
    if (!showEmployeeModal) return undefined;
    const rootEl = employeeScrollRef.current;
    if (!rootEl) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const nextStepId = visible[0]?.target?.dataset?.stepId;
        if (nextStepId) setActiveEmployeeStep(nextStepId);
      },
      { root: rootEl, rootMargin: "-10% 0px -70% 0px", threshold: 0 }
    );

    Object.values(employeeStepRefs.current).forEach((el) => {
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [showEmployeeModal]);

    const [data, setData] = useState([]);
    const [totalRecords, setTotalRecords] = useState(0);
    const [tableLoading, setTableLoading] = useState(true);
    const [jobRoles, setJobRoles] = useState([]);
    const [jobRoleAverage, setJobRoleAverage] = useState([]);
    const [circles, setCircles] = useState([]);
    const [circleLastUpdated, setCircleLastUpdated] = useState([]);
    const [employmentStatus, setEmploymentStatus] = useState([]);
    const [dashboardSummary, setDashboardSummary] = useState({
      totalEmployees: 0,
      activeEmployees: 0,
      inactiveEmployees: 0,
      circleBreakdown: [],
    });
    const [selectedRows, setSelectedRows] = useState([]);
    const [reportFile, setReportFile] = useState(null);
    const [deletingId, setDeletingId] = useState(null);
    const [downloadingId, setDownloadingId] = useState(null);
  

  const [reportDate, setReportDate] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [search, setSearch] = useState("");
  const [totalPages, setTotalPages] = useState(1);

  const [circleFilter, setCircleFilter] = useState("");
  const [cmpFilter, setCmpFilter] = useState("");
  const [jobRoleFilter, setJobRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

    const loadPhysicalData = async () => {
      try {
        setTableLoading(true);

        const query = new URLSearchParams({
          page: String(currentPage),
          pageSize: String(pageSize),
          sortBy: "id",
          sortOrder: "DESC",
        });

        if (search.trim()) query.set("search", search.trim());
        if (circleFilter) query.set("circle", circleFilter);
        if (cmpFilter) query.set("cmp", cmpFilter);
        if (jobRoleFilter) query.set("jobRole", jobRoleFilter);
        if (statusFilter) query.set("employmentStatus", statusFilter);

        const response = await authFetch(
          buildApiUrl(`/api/physical?${query.toString()}`)
        );

          const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(result.message || "Failed to load physical data");
        }

    const offset = ((result.currentPage || currentPage) - 1) * (result.pageSize || pageSize);
    const formattedData = (result.data || []).map((item, index) => ({
      ...item,
      srNo: offset + index + 1,
    }));

  setData(formattedData);
  setTotalRecords(result.totalRecords || result.total || 0);
  setTotalPages(result.totalPages || 1);
  setCurrentPage(result.currentPage || 1);
      } catch (error) {
        console.error(error);
      }
      finally {

    setTableLoading(false);

  }
    };

    // Powers the Total Employees / Active / Inactive / Circle Wise Count KPI
    // cards. Unlike loadPhysicalData, this always reflects the *whole*
    // filtered set (not just the current page), so it must be re-fetched
    // whenever a filter changes — it deliberately excludes pagination
    // (currentPage/pageSize) from its own trigger so paging alone doesn't
    // refire it.
    const loadDashboardSummary = async () => {
      try {
        const query = new URLSearchParams();

        if (search.trim()) query.set("search", search.trim());
        if (circleFilter) query.set("circle", circleFilter);
        if (cmpFilter) query.set("cmp", cmpFilter);
        if (jobRoleFilter) query.set("jobRole", jobRoleFilter);
        if (statusFilter) query.set("employmentStatus", statusFilter);

        const response = await authFetch(
          buildApiUrl(`/api/physical/dashboard/analytics?${query.toString()}`)
        );

        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(result.message || "Failed to load dashboard summary");
        }

        setDashboardSummary({
          totalEmployees: result.data?.summary?.totalEmployees || 0,
          activeEmployees: result.data?.summary?.activeEmployees || 0,
          inactiveEmployees: result.data?.summary?.inactiveEmployees || 0,
          circleBreakdown: result.data?.circleBreakdown || [],
        });
      } catch (error) {
        console.error(error);
      }
    };

    const loadJobRoles = async () => {

    try {

      const response = await authFetch(
        buildApiUrl("/api/physical/job-role-count")
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error("Failed to load roles");
      }

      setJobRoles(result.data || []);

    } catch (error) {

      console.log(error);

    }

  };

    const loadJobRoleAverage = async () => {

    try {

      const response = await authFetch(
        buildApiUrl("/api/physical/job-role-document-average")
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error("Failed to load average");
      }

      setJobRoleAverage(result.data || []);

    } catch (error) {

      console.log(error);

    }

  };

  const loadCircles = async () => {

    try {

      const response = await authFetch(
        buildApiUrl("/api/physical/circle-count")
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error("Failed to load circles");
      }

      setCircles(result.data || []);

    } catch (error) {

      console.log(error);

    }

  };

  const loadCircleLastUpdated = async () => {

    try {

      const response = await authFetch(
        buildApiUrl("/api/physical/circle-last-updated")
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error("Failed to load circle last-updated info");
      }

      setCircleLastUpdated(result.data || []);

    } catch (error) {

      console.log(error);

    }

  };

  const loadEmploymentStatus = async () => {

    try {

      const response = await authFetch(
        buildApiUrl("/api/physical/employment-status-count")
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error("Failed to load employment status");
      }

      setEmploymentStatus(result.data || []);

    } catch (error) {

      console.log(error);

    }

  };

 useEffect(() => {
  loadPhysicalData();
}, [currentPage, pageSize, search, circleFilter, cmpFilter, jobRoleFilter, statusFilter]);

// KPI cards reflect the whole filtered set, not just the current page, so
// they're refreshed on filter change but not on pagination alone.
useEffect(() => {
  loadDashboardSummary();
}, [search, circleFilter, cmpFilter, jobRoleFilter, statusFilter]);

useEffect(() => {
  setCurrentPage(1);
}, [search, circleFilter, cmpFilter, jobRoleFilter, statusFilter, pageSize]);

useEffect(() => {
  setTimeout(() => {
    loadJobRoles();
    loadJobRoleAverage();
    loadCircles();
    loadCircleLastUpdated();
    loadEmploymentStatus();
  }, 100);
}, []);

  const handleSelectAll = (e) => {

    if (e.target.checked) {

      setSelectedRows(
        paginatedData.map((item) => item.id)
      );

    } else {

      setSelectedRows([]);

    }

  };

  const handleSelectRow = (id) => {

    if (selectedRows.includes(id)) {

      setSelectedRows(
        selectedRows.filter(
          (item) => item !== id
        )
      );

    } else {

      setSelectedRows([
        ...selectedRows,
        id,
      ]);

    }

  };

  const handleReportUpload = async () => {

    if (!reportFile) {
      alert("Please select file");
      return;
    }

    if (!reportDate) {
      alert("Please select report date");
      return;
    }

    const formData = new FormData();

    formData.append("file", reportFile);

    formData.append(
      "report_date",
      reportDate
    );

  formData.append(
    "uploaded_by",
    uploadedBy
  );

    try {
      setUploading(true);

      const response = await authFetch(
        buildApiUrl("/api/physical/upload-report"),
        {
          method: "POST",
          body: formData,
        }
      );

      let result = null;

      try {
        result = await response.json();
      } catch {
        result = null;
      }

 if (!response.ok || !result || !result.success) {
  setShowUploadModal(false);
  // Wait for upload modal to unmount, then open validation modal
  setTimeout(
    () =>
      setValidationError(
        result || { message: "Upload failed. Please try again." }
      ),
    150
  );
  return;
}

  Swal.fire({
    icon: "success",
    title: "Upload Completed",

    html: `
        <div style="text-align:left;font-size:16px">

            <p><b>Total Employees :</b> ${result.totalEmployees ?? 0}</p>

            <p style="color:green">
                <b>✅ Added Successfully :</b>
                ${result.addedEmployees ?? 0}
            </p>

            <p style="color:#2563eb">
                <b>🔄 Updated :</b>
                ${result.updatedEmployees ?? 0}
            </p>

            <p style="color:#d97706">
                <b>⚠ Already Exists :</b>
                ${result.duplicateEmployees ?? 0}
            </p>

            ${result.skippedCircleCmp > 0 ? `
            <p style="color:#d97706">
                <b>⚠ Skipped (Circle/CMP) :</b>
                ${result.skippedCircleCmp}
            </p>
            ` : ""}

        </div>
    `
});

     setShowUploadModal(false);

setReportFile(null);
setReportDate("");
setUploadedBy("");

if (result.skippedCircleCmp > 0 && Array.isArray(result.circleCmpWarnings)) {
  setTimeout(() => {
    setCircleCmpReport({
      errors: result.circleCmpWarnings,
      totalRecords: result.totalEmployees,
    });
  }, 150);
}

loadPhysicalData();
loadJobRoles();
loadCircles();
loadCircleLastUpdated();
loadEmploymentStatus();
loadDashboardSummary();

  } catch (error) {

      console.log(error);

      alert("Upload Failed");
    }
    finally {

    setUploading(false);

  }
  };

const paginatedData = data;

const handleEdit = (item) => {

  setIsEditMode(true);

  setEditingId(item.id);

  setEmployeeForm({

    ...item,

    dob: item.dob
      ? item.dob.split("T")[0]
      : "",

    date_of_joining:
      item.date_of_joining
        ? item.date_of_joining.split("T")[0]
        : "",

    resigned_date:
      item.resigned_date
        ? item.resigned_date.split("T")[0]
        : "",

    last_working_date:
      item.last_working_date
        ? item.last_working_date.split("T")[0]
        : "",

  });

  setShowEmployeeModal(true);

};

  const handleDelete = async (id) => {
    const confirmDelete = window.confirm(
      "Warning: This report will be permanently deleted. Do you want to continue?"
    );

    if (!confirmDelete) return;

    setDeletingId(id);

    try {
      const response = await authFetch(
        buildApiUrl(`/api/physical/delete-employee/${id}`),
        {
          method: "DELETE",
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        alert(result.message || "Delete failed");
        return;
      }

      alert("File deleted successfully");
      loadPhysicalData();
      loadDashboardSummary();
    } catch (error) {
      console.log(error);
      alert("Delete failed");
    } finally {
      setDeletingId(null);
    }
  };

const handleBulkDelete = async () => {
  if (selectedRows.length === 0) {
    alert("Please select rows");
    return;
  }

  const confirmDelete = window.confirm(
    `Delete ${selectedRows.length} selected records?`
  );

  if (!confirmDelete) return;

  try {
    setBulkDeleting(true);

  await authFetch(
  buildApiUrl("/api/physical/bulk-delete"),
  {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ids: selectedRows,
    }),
  }
);

    alert(
      `${selectedRows.length} records deleted successfully`
    );

    setSelectedRows([]);

    await loadPhysicalData();
    await loadDashboardSummary();

  } catch (error) {
    console.log(error);
    alert("Bulk delete failed");
  } finally {
    setBulkDeleting(false);
  }
};

  const handleEmployeeChange = async (e) => {

    const { name, value } = e.target;

    if (name === "dob") {

    const birthDate = new Date(value);

    const today = new Date();

    let age =
      today.getFullYear() -
      birthDate.getFullYear();

    const monthDifference =
      today.getMonth() -
      birthDate.getMonth();

    if (
      monthDifference < 0 ||
      (
        monthDifference === 0 &&
        today.getDate() <
          birthDate.getDate()
      )
    ) {
      age--;
    }

    setEmployeeForm({
      ...employeeForm,
      dob: value,
      age: age > 0 ? age : "",
    });

    return;
  }

   if (name === "circle") {
  setEmployeeForm({
    ...employeeForm,
    circle: value,
    cmp: "",
  });
  return;
}

setEmployeeForm({
  ...employeeForm,
  [name]: value,
});

    // AADHAAR AUTO CHECK

const cleanAadhaar =
  value.replace(/\s/g, "");

if (
  name === "aadhaar_no" &&
  cleanAadhaar.length === 12
) {

  try {

    const response = await authFetch(
      buildApiUrl(
        `/api/physical/aadhaar/${cleanAadhaar}`
      )
    );

    const result =
      await response.json();

 if (
  response.ok &&
  result.success
) {

  setIsEditMode(true);
  setEditingId(result.data.id);

  setEmployeeForm((prev) => ({

    ...prev,
    id: result.data.id,

        circle: result.data.circle || "",
        cmp: result.data.cmp || "",
        pprj_status: result.data.pprj_status || "",
        pprj_code: result.data.pprj_code || "",
        employee_code: result.data.employee_code || "",
        employee_name: result.data.employee_name || "",
        father_name: result.data.father_name || "",
        function_name: result.data.function_name || "",
        job_role: result.data.job_role || "",
        manpower_signoff_scope:
          result.data.manpower_signoff_scope || "",
        scrum_job_role:
          result.data.scrum_job_role || "",
        mobile_number:
          result.data.mobile_number || "",

        dob: result.data.dob
          ? result.data.dob.split("T")[0]
          : "",

        age: result.data.age || "",

        date_of_joining:
          result.data.date_of_joining
            ? result.data.date_of_joining.split("T")[0]
            : "",

        employment_status:
          result.data.employment_status || "",

        resigned_date:
          result.data.resigned_date
            ? result.data.resigned_date.split("T")[0]
            : "",

        last_working_date:
          result.data.last_working_date
            ? result.data.last_working_date.split("T")[0]
            : "",

        rm_code: result.data.rm_code || "",

        reporting_manager:
          result.data.reporting_manager || "",

        company_email_id:
          result.data.company_email_id || "",

        laptop_status:
          result.data.laptop_status || "",

        ifsc_code:
          result.data.ifsc_code || "",

        bank_account_no:
          result.data.bank_account_no || "",

        pan_no:
          result.data.pan_no || "",

        aadhaar_no:
          result.data.aadhaar_no || "",

        uan_no:
          result.data.uan_no || "",

        esic_ip_no:
          result.data.esic_ip_no || "",

        pf_no:
          result.data.pf_no || "",

          gtli:
  result.data.gtli || "",

        nth_salary:
          result.data.nth_salary || "",
        
          remarks:
          result.data.remarks || "",

      }));

      alert(
        "Employee data auto filled"
      );

    }

  } catch (error) {

    console.log(error);

  }

}

 if (
  name === "employee_code" &&
  value.trim().length > 0
) {

  try {

    const response = await authFetch(
      buildApiUrl(
        `/api/physical/employee-code/${value}`
      )
    );

    const result =
      await response.json();

   if (
  response.ok &&
  result.success
) {

  setIsEditMode(true);
  setEditingId(result.data.id);

  setEmployeeForm((prev) => ({

    ...prev,
    id: result.data.id,

  circle: result.data.circle || "",
  cmp: result.data.cmp || "",
  pprj_status: result.data.pprj_status || "",
  pprj_code: result.data.pprj_code || "",

  employee_code: result.data.employee_code || "",
  employee_name: result.data.employee_name || "",
  father_name: result.data.father_name || "",

  function_name: result.data.function_name || "",
  job_role: result.data.job_role || "",

  manpower_signoff_scope:
    result.data.manpower_signoff_scope || "",

  scrum_job_role:
    result.data.scrum_job_role || "",

  mobile_number:
    result.data.mobile_number || "",

  dob: result.data.dob
    ? result.data.dob.split("T")[0]
    : "",

  age: result.data.age || "",

  date_of_joining:
    result.data.date_of_joining
      ? result.data.date_of_joining.split("T")[0]
      : "",

  employment_status:
    result.data.employment_status || "",

  resigned_date:
    result.data.resigned_date
      ? result.data.resigned_date.split("T")[0]
      : "",

  last_working_date:
    result.data.last_working_date
      ? result.data.last_working_date.split("T")[0]
      : "",

  rm_code:
    result.data.rm_code || "",

  reporting_manager:
    result.data.reporting_manager || "",

  company_email_id:
    result.data.company_email_id || "",

  laptop_status:
    result.data.laptop_status || "",

  ifsc_code:
    result.data.ifsc_code || "",

  bank_account_no:
    result.data.bank_account_no || "",

  pan_no:
    result.data.pan_no || "",

  aadhaar_no:
    result.data.aadhaar_no || "",

  uan_no:
    result.data.uan_no || "",

  esic_ip_no:
    result.data.esic_ip_no || "",

    pf_no:
  result.data.pf_no || "",

  gtli:
  result.data.gtli || "",

  nth_salary:
    result.data.nth_salary || "",

  remarks:
    result.data.remarks || "",

}));

    }

  } catch (error) {

    console.log(error);

  }

}
  };

  const d = [
  [0,1,2,3,4,5,6,7,8,9],
  [1,2,3,4,0,6,7,8,9,5],
  [2,3,4,0,1,7,8,9,5,6],
  [3,4,0,1,2,8,9,5,6,7],
  [4,0,1,2,3,9,5,6,7,8],
  [5,9,8,7,6,0,4,3,2,1],
  [6,5,9,8,7,1,0,4,3,2],
  [7,6,5,9,8,2,1,0,4,3],
  [8,7,6,5,9,3,2,1,0,4],
  [9,8,7,6,5,4,3,2,1,0]
];

const p = [
  [0,1,2,3,4,5,6,7,8,9],
  [1,5,7,6,2,8,3,0,9,4],
  [5,8,0,3,7,9,6,1,4,2],
  [8,9,1,6,0,4,3,5,2,7],
  [9,4,5,3,1,2,6,8,7,0],
  [4,2,8,6,5,7,3,9,0,1],
  [2,7,9,3,8,0,6,4,1,5],
  [7,0,4,6,9,1,3,2,5,8]
];

const isValidAadhaar = (aadhaar) => {
  let c = 0;

  const reversed = aadhaar
    .split("")
    .reverse()
    .map(Number);

  for (let i = 0; i < reversed.length; i++) {
    c = d[c][p[i % 8][reversed[i]]];
  }

  return c === 0;
};

 const validateEmployeeForm = () => {

  // Mobile
  if (
    employeeForm.mobile_number &&
    !/^[6-9]\d{9}$/.test(employeeForm.mobile_number)
  ) {
    alert("Invalid Mobile Number");
    return false;
  }

  // PAN
  if (
    employeeForm.pan_no &&
    !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(
      employeeForm.pan_no.toUpperCase()
    )
  ) {
    alert("Invalid PAN Number");
    return false;
  }

 // Aadhaar
if (!employeeForm.aadhaar_no) {
  alert("Aadhaar Number is required");
  return false;
}

const aadhaar = employeeForm.aadhaar_no.trim();

if (!/^\d{12}$/.test(aadhaar)) {
  alert("Aadhaar must be exactly 12 digits");
  return false;
}

if (!isValidAadhaar(aadhaar)) {
  alert("Invalid Aadhaar Number");
  return false;
}

  // UAN
  if (
    employeeForm.uan_no &&
    !/^\d{12}$/.test(employeeForm.uan_no)
  ) {
    alert("UAN must be 12 digits");
    return false;
  }

  // ESIC
  if (
    employeeForm.esic_ip_no &&
    !/^\d{10,17}$/.test(employeeForm.esic_ip_no)
  ) {
    alert("Invalid ESIC IP Number");
    return false;
  }

  // IFSC
  if (
    employeeForm.ifsc_code &&
    !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(
      employeeForm.ifsc_code.toUpperCase()
    )
  ) {
    alert("Invalid IFSC Code");
    return false;
  }

  // Bank Account
  if (
    employeeForm.bank_account_no &&
    employeeForm.bank_account_no.length < 9
  ) {
    alert("Invalid Bank Account Number");
    return false;
  }

  return true;
};

 const handleAddEmployee = async () => {

 
  if (!validateEmployeeForm()) {
    return;
  }

  try {

    setSaving(true);
      if (
    !employeeForm.circle ||
    !employeeForm.cmp
  ) {

    alert(
      "Circle and CMP are required"
    );

    return;

  }
  console.log("Employee ID =", employeeForm.id);
  const apiUrl = employeeForm.id
    ? `/api/physical/update-employee/${employeeForm.id}`
    : "/api/physical/add-employee";

  const method = employeeForm.id
    ? "PUT"
    : "POST";

  const response = await authFetch(
    buildApiUrl(apiUrl),
    {
      method,
      headers: {
        "Content-Type":
          "application/json",
      },
      body: JSON.stringify(employeeForm),
    }
  );

      const result = await response.json();

      if (!response.ok || !result.success) {
        alert(result.message || "Failed");
        return;
      }

    alert(
  employeeForm.id
    ? "Employee Updated Successfully"
    : "Employee Added Successfully"
);

await loadPhysicalData();
await loadDashboardSummary();

setShowEmployeeModal(false);

resetEmployeeForm();
localStorage.removeItem(EMPLOYEE_DRAFT_STORAGE_KEY);

     await loadPhysicalData();

    } catch (error) {
      console.log(error);
      alert("Failed");
    }finally {
  setSaving(false);
}
  };

  const handleExcelUpload = async () => {

  if (!excelFile) {

    alert("Select Excel File");

    return;

  }

  try {

    const formData = new FormData();

    formData.append(
      "file",
      excelFile
    );

  const response = await authFetch(

  isEditMode
    ? buildApiUrl(`/api/physical/${editingId}`)
    : buildApiUrl("/api/physical"),

  {
    method: isEditMode ? "PUT" : "POST",

    headers: {
      "Content-Type": "application/json",
    },

    body: JSON.stringify(employeeForm),
  }
);

    const result =
      await response.json();

    if (!response.ok || !result.success) {

      alert(result.message);

      return;

    }

    alert(
      "Excel Uploaded Successfully"
    );

    setExcelFile(null);

    loadData();

  } catch (error) {

    console.log(error);

    alert("Upload Failed");

  }

};

  const handleExportExcel = async () => {

  try {

    const response = await authFetch(
      buildApiUrl("/api/physical/export")
    );

    const result = await response.json();

    if (!response.ok || !result.success) {

      alert("Export Failed");

      return;

    }

    const exportData = result.data.map((item) => ({

      Circle: item.circle,
      CMP: item.cmp,
      "PPRJ Status": item.pprj_status,
      "PPRJ Code": item.pprj_code,
      "Employee Code": item.employee_code,
      "Employee Name": item.employee_name,
      "Father Name": item.father_name,
      Function: item.function_name,
      "Job Role": item.job_role,
      "Manpower SignOff Scope":
        item.manpower_signoff_scope,
      "Scrum Job Role":
        item.scrum_job_role,
      "Mobile Number":
        item.mobile_number,
      DOB: item.dob,
      Age: item.age,
      "Date Of Joining":
        item.date_of_joining,
      "Employment Status":
        item.employment_status,
      "Resigned Date":
        item.resigned_date,
      "Last Working Date":
        item.last_working_date,
      "RM Code": item.rm_code,
      "Reporting Manager":
        item.reporting_manager,
      "Company Email":
        item.company_email_id,
      "Laptop Status":
        item.laptop_status,
      "IFSC Code":
        item.ifsc_code,
      "Bank Account No":
        item.bank_account_no,
      "PAN No":
        item.pan_no,
      "AADHAAR No":
        item.aadhaar_no,
      "UAN No":
        item.uan_no,
      "ESIC IP No":
        item.esic_ip_no,
      "PF No":
       item.pf_no,
       "GTLI":
       item.gtli,
      "NTH Salary":
        item.nth_salary,
      Remarks:
        item.remarks,

    }));

    const worksheet =
      XLSX.utils.json_to_sheet(exportData);

    const workbook =
      XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      "Physical Data"
    );

    const excelBuffer =
      XLSX.write(workbook, {
        bookType: "xlsx",
        type: "array",
      });

    saveAs(
      new Blob([excelBuffer]),
      `Physical_Data_${Date.now()}.xlsx`
    );

  } catch (error) {

    console.log(error);

    alert("Export Failed");

  }

};

  const handleDownload = async (item) => {
    setDownloadingId(item.id);

    try {
      const response = await authFetch(
        buildApiUrl(`/api/physical/download/${item.id}`)
      );

      if (!response.ok) {
        throw new Error("Download failed");
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = downloadUrl;
      anchor.download = item.original_name || `physical_report_${item.id}.xlsx`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      console.error(error);
      alert("Download failed. Please try again.");
    } finally {
      setDownloadingId(null);
    }
  };

  // The approved Circle list and per-circle CMP allow-list are fetched from
  // the backend at runtime (see useCircleOptions / GET /api/circles) so they
  // stay a single source of truth shared with the New Joining page and the
  // server-side validation.
  const { circleOptions, getCmpOptions, circleCmpMap } = useCircleOptions();

// The approved Job Role list is fetched from the backend at runtime (see
// useDesignationOptions / GET /api/designations) so it stays a single source
// of truth shared with the New Joining page and the server-side validation.
const { options: jobRoleOptions } = useDesignationOptions();

const employmentStatusOptions = [
  { value: "Active", label: "Active" },
  { value: "Inactive", label: "Inactive" },
];

const laptopStatusOptions = [
  { value: "Company", label: "Company" },
  { value: "Own", label: "Own" },
  { value: "Not Required", label: "Not Required" },
];

const gtliOptions = [
  { value: "Covered", label: "Covered" },
  { value: "Pending", label: "Pending" },
  { value: "Not Applicable", label: "Not Applicable" },
];

const pprjStatusOptions = [
  { value: "Active", label: "Active" },
  { value: "Inactive", label: "Inactive" },
  { value: "Pending", label: "Pending" },
  { value: "Not Applicable", label: "Not Applicable" },
];

const signoffOptions = [
  { value: "R", label: "R" },
  { value: "A", label: "A" },
  { value: "G", label: "G" },
];

const selectStyles = {
  control: (provided, state) => ({
    ...provided,
    minHeight: "36px",
    height: "36px",
    borderRadius: "8px",
    borderColor: state.isFocused ? "rgb(var(--color-primary))" : "rgb(var(--color-border))",
    boxShadow: state.isFocused ? "0 0 0 3px rgba(99,102,241,0.15)" : "none",
    fontSize: "13px",
    backgroundColor: "rgb(var(--color-surface))",
  }),

  valueContainer: (provided) => ({
    ...provided,
    height: "32px",
    padding: "0 12px",
  }),

  indicatorsContainer: (provided) => ({
    ...provided,
    height: "32px",
  }),

  menu: (provided) => ({
    ...provided,
    zIndex: 99999,
    marginTop: 2,
    backgroundColor: "rgb(var(--color-surface-elevated))",
  }),

  menuList: (provided) => ({
    ...provided,
    maxHeight: "250px",
    paddingTop: 0,
  }),

  input: (provided) => ({
    ...provided,
    fontSize: "12px",
    color: "rgb(var(--color-text-primary))",
  }),

  singleValue: (provided) => ({
    ...provided,
    color: "rgb(var(--color-text-primary))",
  }),

  placeholder: (provided) => ({
    ...provided,
    color: "rgb(var(--color-text-muted))",
  }),

  option: (provided, state) => ({
    ...provided,
    fontSize: "13px",
    cursor: "pointer",
    color: state.isSelected ? "#ffffff" : "rgb(var(--color-text-primary))",
    backgroundColor: state.isSelected
      ? "rgb(var(--color-primary))"
      : state.isFocused
        ? "rgba(99,102,241,0.1)"
        : "rgb(var(--color-surface-elevated))",
  }),
};

const CustomMenuList = (props) => {
  return (
    <div>
      <div className="p-2 border-b border-border-color bg-surface sticky top-0 z-10">
        <input
          type="text"
          placeholder="Search Job Role..."
          value={jobRoleSearch}
          onChange={(e) => setJobRoleSearch(e.target.value)}
          className="w-full rounded border border-border-color bg-surface text-text-primary px-3 py-2 text-xs outline-none"
        />
      </div>

      <div>
        {props.children}
      </div>
    </div>
  );
};

// Sourced from the canonical Circle/CMP/Designation lists (same ones used by
// the Add Employee form) instead of the current page's `data`, which only
// ever contains a paginated slice — deriving filter options from it meant
// most circles/CMPs/job roles were never selectable, and the job-role list
// mixed in `role_group` values (a truncated first-word grouping used for the
// KPI dashboard) that could never exact-match the full job_role column the
// backend filters against.
const circleFilterOptions = [
  { value: "", label: "Select Circles" },
  ...circleOptions,
];

const cmpFilterOptions = [
  { value: "", label: "Select CMP" },
  ...(circleFilter
    ? getCmpOptions(circleFilter)
    : [...new Set(Object.values(circleCmpMap).flat())]
        .filter(Boolean)
        .sort()
        .map((cmp) => ({ value: cmp, label: cmp }))),
];

const jobRoleFilterOptions = [
  { value: "", label: "Select Job Roles" },
  ...jobRoleOptions,
];

const statusFilterOptions = [
  { value: "", label: "Select Status" },
  { value: "Active", label: "Active" },
  { value: "Inactive", label: "Inactive" },
];

const startRecord =
  totalRecords === 0
    ? 0
    : (currentPage - 1) * pageSize + 1;

const endRecord =
  Math.min(
    (currentPage - 1) * pageSize + paginatedData.length,
    totalRecords
  );

  const resetFilters = () => {
  setSearch("");
  setCircleFilter("");
  setCmpFilter("");
  setJobRoleFilter("");
  setStatusFilter("");
  setCurrentPage(1);
};

const activeCount = dashboardSummary.activeEmployees || 0;
const inactiveCount = dashboardSummary.inactiveEmployees || 0;

    return (
      <div className="min-h-screen">
        <div className="relative min-h-screen overflow-hidden">

          <div className="relative">
            {/* Header */}
            <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4">
              <div>
             <h1 className="text-lg font-semibold tracking-tight text-text-primary">
  Manpower - Physical
</h1>

<p className=" text-sm text-text-muted">
  Enterprise employee registry with secure premium experience
</p>
          
              </div>
<div className="flex items-center gap-4">

  <button
    onClick={openAddEmployeeModal}
    className="
      group
      flex items-center gap-2
      rounded-lg
      bg-gradient-to-r
      from-indigo-600
      to-violet-600
      px-4
      py-2
      text-[13px]
      font-semibold
      text-white
    "
  >
    <UserPlus size={16} />
    Add Employee
  </button>

  <button
    onClick={() => setShowUploadModal(true)}
    className="
      group
      flex items-center gap-2
      rounded-lg
      bg-gradient-to-r
      from-emerald-500
      to-green-600
      px-4
      py-2
      text-[13px]
      font-semibold
      text-white  
    "
  >
    <Upload size={16} />
    Upload Report
  </button>

  <button
    onClick={() => window.location.href = "/physical/dashboard"}
    className="
      group
      flex items-center gap-2
      rounded-lg
      border border-border-color
      bg-surface
      px-4
      py-2
      text-[13px]
      font-semibold
      text-text-secondary
    "
  >
    <BarChart3 size={16} />
    Dashboard
  </button>

</div>
            </div>

{/* Filters and Actions Row */ }
<div className="mt-2 flex items-center gap-3 rounded-xl bg-surface p-1">

  {/* Search */}
  <input
    type="text"
    placeholder="Search by Employee Name, Employee Code, PF No, Aadhaar No, Mobile Number, CMP, Circle..."
    value={search}
    onChange={(e) => {
  setSearch(e.target.value);
  setCurrentPage(1);
}}  
    className="h-9 flex-1 rounded-lg border border-border-color px-4 text-[13px] outline-none focus:border-blue-500"
  />

  {/* Circle */}
  <div className="w-52">
    <Select
      styles={selectStyles}
      placeholder="Select Circle"
      options={circleFilterOptions}
      value={
        circleFilterOptions.find(
          item => item.value === circleFilter
        ) || null
      }
    onChange={(selected) => {
  setCircleFilter(selected?.value || "");
  setCmpFilter("");
  setCurrentPage(1);
}}
    />
  </div>

  {/* CMP */}
  <div className="w-52">
    <Select
      styles={selectStyles}
      placeholder="Select CMP"
      options={cmpFilterOptions}
      value={
        cmpFilterOptions.find(
          item => item.value === cmpFilter
        ) || null
      }
     onChange={(selected) => {
  setCmpFilter(selected?.value || "");
  setCurrentPage(1);
}}
    />
  </div>

  <div className="w-52">
  <Select
    styles={selectStyles}
    placeholder="Select Roles"
    options={jobRoleFilterOptions}
    value={
      jobRoleFilterOptions.find(
        item => item.value === jobRoleFilter
      ) || null
    }
    onChange={(selected) =>
      setJobRoleFilter(
        selected?.value || ""
      )
    }
  />
</div>

  {/* Status */}
  <div className="w-52">
    <Select
      styles={selectStyles}
      placeholder="Select Status"
      options={statusFilterOptions}
      value={
        statusFilterOptions.find(
          item => item.value === statusFilter
        ) || null
      }
      onChange={(selected) =>
        setStatusFilter(selected?.value || "")
      }
    />
  </div>

  {/* Reset */}

  <button
  onClick={resetFilters}
  className="flex items-center gap-2 h-9 rounded-lg border border-border-strong bg-surface px-3 text-sm font-semibold text-text-secondary transition-all hover:bg-slate-700 hover:text-white"
>
  <RotateCcw size={16} />
  Reset
</button>

</div>

    {/* Top KPI Row */}

 <div className="mx-auto mt-2 grid w-full max-w-7xl grid-cols-2 gap-2 lg:grid-cols-12">

    {/* Total Employees */}

  <div className="lg:col-span-2 rounded-xl border border-border-color bg-surface px-3 py-2 shadow-sm hover:shadow-lg transition-all">

      <div className="text-[13px] font-semibold text-text-muted">
        Total Employees
      </div>

      <div className="text-lg mt-1 font-semibold text-text-primary">
        {dashboardSummary.totalEmployees}
      </div>

    </div>
  

    {/* Employment Status */}

 <div className="lg:col-span-3 rounded-xl border border-border-color bg-surface px-4 py-2 shadow-sm hover:shadow-lg transition-all">

    <div className="mb-1 flex items-center justify-between">

      <h2 className="text-[13px] font-semibold text-text-secondary">
        Employment Status
      </h2>

    </div>

  <div className="flex flex-wrap items-center justify-between rounded-lg bg-surface-muted px-4 py-1 gap-3">

  <div className="flex items-center gap-2">
    <span className="text-sm font-medium text-text-secondary">
      Active:
    </span>

  <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
  {activeCount}
</span>
  </div>

  <div className="h-4 w-px bg-surface-muted" />

  <div className="flex items-center gap-2">
    <span className="text-sm font-medium text-text-secondary">
      Inactive:
    </span>

  <span className="text-sm font-semibold text-red-600 dark:text-red-400">
  {inactiveCount}
</span>
  </div>

</div>

  </div>


    {/* Circle Wise Count */}

  <div className="lg:col-span-7 rounded-xl border border-border-color bg-surface px-4 py-2 shadow-sm hover:shadow-lg transition-all">
      <div className="mb-1 flex items-center justify-between">

        <h2 className="text-[13px] font-semibold text-text-primary">
          Circle Wise Count
        </h2>

      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">

        {dashboardSummary.circleBreakdown.map((item, index) => (

          <div
            key={index}
            className="flex items-center justify-between rounded-lg border border-border-color bg-gradient-to-r from-surface-muted to-white px-2 py-1 hover:shadow-md transition-all"
          >

            <span className="text-[13px] font-semibold text-text-secondary">
              {item.label}
            </span>

            <span className="text-[13px] font-semibold text-emerald-600 dark:text-emerald-400">
              {item.total_employees}
            </span>

          </div>

        ))}

      </div>

    </div>



  </div>

  {/* Circle Wise Last Updated */}

  <div className="mx-auto mt-2 w-full max-w-7xl">

    <div className="rounded-[18px] border border-border-color bg-surface px-4 py-3 shadow-sm hover:shadow-lg transition-all">

      <div className="mb-2 flex items-center justify-between">

        <h2 className="flex items-center gap-2 text-[13px] font-semibold text-text-primary">
          <Clock size={15} className="text-indigo-500 dark:text-indigo-400" />
          Circle Wise Last Updated
        </h2>

      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">

        {circleLastUpdated.map((item, index) => (

          <div
            key={index}
            className="flex items-center justify-between gap-2 rounded-xl border border-border-color bg-gradient-to-r from-surface-muted to-white px-3 py-2"
          >

            <span className="text-[13px] font-semibold text-text-secondary">
              {item.circle}
            </span>

            <span
              className={`text-[12px] font-medium ${
                item.lastUpdatedAt ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"
              }`}
            >
              {formatCircleTimestamp(item.lastUpdatedAt)}
            </span>

          </div>

        ))}

      </div>

    </div>

  </div>



  {/* Job Role Document Average
  <div className="mx-auto mt-3 w-full max-w-7xl">

    <div className="rounded-[22px] border border-white/70 bg-surface/100 px-4 py-3 backdrop-blur-xl">

      <div className="mb-2 flex items-center justify-between">

        <h2 className="text-md font-semibold text-text-primary">
          Job Role Document Average
        </h2>

        <div className="text-xs text-text-muted">
          Aadhaar + UAN + ESIC Average
        </div>

      </div>

      <div className="h-[220px] overflow-y-scroll pr-2 custom-scrollbar">

        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">

          {jobRoleAverage.map((item, index) => (

            <div
              key={index}
              className="rounded-2xl bg-surface-muted px-4 py-3"
            >

              <div className="flex items-center justify-between">

                <span className="text-sm font-semibold text-text-primary">
                  {item.role_group}
                </span>

                <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                  {item.document_average}%
                </span>

              </div>

              <div className="mt-2 grid grid-cols-3 gap-2 text-center">

                <div className="rounded-xl bg-surface py-2">
                  <div className="text-xs text-text-muted">
                    Aadhaar
                  </div>

                  <div className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                    {item.aadhaar_count}
                  </div>
                </div>

                <div className="rounded-xl bg-surface py-2">
                  <div className="text-xs text-text-muted">
                    UAN
                  </div>

                  <div className="text-sm font-semibold text-purple-600 dark:text-purple-400">
                    {item.uan_count}
                  </div>
                </div>

                <div className="rounded-xl bg-surface py-2">
                  <div className="text-xs text-text-muted">
                    ESIC
                  </div>

                  <div className="text-sm font-semibold text-orange-600 dark:text-orange-400">
                    {item.esic_count}
                  </div>
                </div>

              </div>

            </div>

          ))}

        </div>

      </div>

    </div>

  </div>

  */}



  {/* Job Roles Section */}
  {/* 

  <div className="mx-auto mt-2 w-full max-w-7xl">

    <div className="rounded-[18px] border border-white/70 bg-surface/100 px-4 py-2 backdrop-blur-xl">

      <div className="mb-2 flex items-center justify-between">

        <h2 className="text-sm font-semibold text-text-primary">
          Job Roles
        </h2>

        <div className="text-xs text-text-muted">
          Role Wise Count
        </div>

      </div>

    <div className="h-auto pr-2 custom-scrollbar">

    <div className="grid grid-cols-2 md:grid-cols-6 xl:grid-cols-8">

        {jobRoles.map((role, index) => (

          <div
            key={index}
            className="flex items-center justify-between rounded-2xl bg-surface-muted px-3 py-1"
          >

            <span className="text-[14px]  text-text-secondary">
              {role.role_group}
            </span>

            <span className="text-[13px] font-medium text-blue-600 dark:text-blue-400">
              {role.total}
            </span>

          </div>

        ))}

        </div>

  </div>

    </div>

  </div>
*/}

     {/* Table Section */}
      <div className="mx-auto mt-2 w-full max-w-7xl">
       <div className="overflow-hidden rounded-xl border border-border-color bg-surface shadow-sm">
        
  <div className="flex items-center justify-between border-b border-border-color px-4 py-2">

  {/* Left Side */}
  <div className="flex items-center gap-3">

  <h2 className="text-md font-semibold text-text-primary">
    Employee Records
  </h2>

  <span className="rounded-md bg-blue-50 dark:bg-blue-500/10 px-2 py-1.5 text-xs font-semibold text-blue-700 dark:text-blue-400">
    {totalRecords} Records
  </span>

</div>

  {/* Right Side */}
  <div className="flex items-center gap-2">

    <button
      onClick={handleExportExcel}
      className="h-8 flex items-center gap-2 rounded-lg border border-emerald-500 bg-surface px-3 text-[14px] font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-600 hover:text-white"
    >
      <Download size={14} />
      Export
    </button>

    <button
      onClick={handleBulkDelete}
      disabled={
        selectedRows.length === 0 ||
        bulkDeleting
      }
      className="h-8 flex items-center gap-2 rounded-lg border border-red-500 bg-surface px-3 text-[14px] font-semibold text-red-600 dark:text-red-400 hover:bg-red-600 hover:text-white disabled:opacity-50"
    >
      <Trash2 size={14} />
      Delete ({selectedRows.length})
    </button>

  </div>

</div>

  <div className="relative mt-2 overflow-x-auto overflow-y-auto custom-scrollbar">
  <div>
  <table className="w-max min-w-full border-separate border border-spacing-0">
 
 <thead className=" bg-surface">
    <tr>

    <th className="px-3 py-2">
    <input
      type="checkbox"
      checked={
        paginatedData.length > 0 &&
        selectedRows.length === paginatedData.length
      }
      onChange={handleSelectAll}
    />
  </th>

   <th className="border-b border-r border-border-color bg-surface px-4 py-3 text-center text-xs font-bold 
                  uppercase tracking-wider text-text-secondary whitespace-nowrap">
        Circle</th>

  <th className="border-b border-r border-border-color bg-surface px-4 py-3 text-center text-xs font-bold
   uppercase tracking-wider text-text-secondary whitespace-nowrap">CMP</th>
<th
  className="border-b border-r border-border-color bg-surface px-4 py-3 text-center text-xs font-bold uppercase tracking-wider text-text-secondary whitespace-nowrap"
>
  PPRJ Status
</th>
<th
  className="border-b border-r border-border-color bg-surface px-4 py-3 text-center text-xs font-bold uppercase tracking-wider text-text-secondary whitespace-nowrap"
>
  PPRJ Code
</th>

  <th className="border-b border-r border-border-color bg-surface px-4 py-3 text-center text-xs font-bold 
  uppercase tracking-wider text-text-secondary whitespace-nowrap">Employee Code</th>
      
  <th className="border-b border-r border-border-color bg-surface px-4 py-3 text-center text-xs font-bold 
  uppercase tracking-wider text-text-secondary whitespace-nowrap">Employee Name</th>

  <th className="border-b border-r border-border-color bg-surface px-4 py-3 text-center text-xs font-bold
   uppercase tracking-wider text-text-secondary whitespace-nowrap">Job Role</th>

  <th className="border-b border-r border-border-color bg-surface px-4 py-3 text-center text-xs font-bold
   uppercase tracking-wider text-text-secondary whitespace-nowrap">Mobile Number</th>

   <th
  className="border-b border-r border-border-color bg-surface px-4 py-3 text-center text-xs font-bold uppercase tracking-wider text-text-secondary whitespace-nowrap"
>
  Aadhaar No
</th>

  <th className="border-b border-r border-border-color bg-surface px-4 py-3 text-center text-xs font-bold
   uppercase tracking-wider text-text-secondary whitespace-nowrap">Date Of Joining</th>

  <th className="border-b border-r border-border-color bg-surface px-4 py-3 text-center text-xs font-bold
   uppercase tracking-wider text-text-secondary whitespace-nowrap">Employment Status</th>

  <th className="border-b border-r border-border-color bg-surface px-4 py-3 text-center text-xs font-bold
   uppercase tracking-wider text-text-secondary whitespace-nowrap">Uploaded At</th>

 <th
  className="
    sticky right-0 z-20
    border-b border-l border-border-color
    bg-surface
    px-4 py-3
    text-center
    text-xs font-bold uppercase
    tracking-wider text-text-secondary
  "
>
  Actions
</th>

    </tr>
  </thead>

      <tbody>

  {tableLoading ? (

    <tr>
      <td
        colSpan="100"
        className="h-[240px] text-center align-middle"
      >
        <div className="flex items-center justify-center h-full w-[70em]">
          <span className="text-sm font-semibold text-text-muted">
            Loading Reports...
          </span>
        </div>
      </td>
    </tr>

  ) : paginatedData.length === 0 ? (
      <tr>
      <td
    colSpan="100"
    className="py-24 text-center text-sm font-medium w-[70em] text-text-muted"
  >
    <div className="flex items-center justify-center h-full w-[80em]">
          <span className="text-sm font-semibold text-text-muted">
            No Records Found
          </span>
        </div>
  </td>
      </tr>
    ) : (
      paginatedData.map((item, index) => (
      <tr
      key={index}
      className={`group transition-all duration-200 hover:bg-blue-50 hover:dark:bg-blue-500/10 ${
      index % 2 === 0
      ? "bg-surface"
      : "bg-surface-muted"
     }`}
>
      <td className="px-3 py-2">
    <input
      type="checkbox"
      checked={selectedRows.includes(item.id)}
      onChange={() => handleSelectRow(item.id)}
    />
  </td>

  <td className="border-b border-r border-border-color px-4 py-2 text-sm text-text-secondary text-center whitespace-nowrap">
    {item.circle || "-"}</td>
  <td className="border-b border-r border-border-color px-4 py-2 text-sm text-text-secondary text-center whitespace-nowrap">
    {item.cmp || "-"}</td>
   <td className="border-b border-r border-border-color px-4 py-2 text-center whitespace-nowrap">
  <span
    className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
      item.pprj_status === "Active"
        ? "bg-green-100 dark:bg-green-500/15 text-green-700 dark:text-green-400"
        : item.pprj_status === "Inactive"
        ? "bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-400"
        : item.pprj_status === "Pending"
        ? "bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400"
        : "bg-surface-muted text-text-secondary"
    }`}
  >
    {item.pprj_status || "-"}
  </span>
</td>
    <td className="border-b border-r border-border-color px-4 py-2 text-sm text-center text-text-secondary whitespace-nowrap">
  {item.pprj_code || "-"}
</td>
  <td className="border-b border-r border-border-color px-4 py-2 text-sm text-text-secondary text-center whitespace-nowrap">{item.employee_code || "-"}</td>
  <td className="border-b border-r border-border-color px-4 py-2 text-sm text-text-secondary text-center whitespace-nowrap">{item.employee_name || "-"}</td>  
  <td className="border-b border-r border-border-color px-4 py-2 text-sm text-text-secondary text-center whitespace-nowrap">{item.job_role || "-"}</td>
  <td className="border-b border-r border-border-color px-4 py-2 text-sm text-text-secondary text-center whitespace-nowrap">{item.mobile_number || "-"}</td>
  <td className="border-b border-r border-border-color px-4 py-2 text-sm text-text-secondary text-center whitespace-nowrap">
  {item.aadhaar_no || "-"}
</td>
  <td className="border-b border-r border-border-color px-4 py-2 text-sm text-text-secondary text-center whitespace-nowrap">{item.date_of_joining
    ? new Date(item.date_of_joining)
        .toLocaleDateString("en-GB")
    : "-"}</td>
<td className="border-b border-r border-border-color px-4 py-2 text-center whitespace-nowrap">
  <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
      item.employment_status === "Active"
        ? "bg-green-100 dark:bg-green-500/15 text-green-700 dark:text-green-400"
        : "bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-400"
    }`}
  >
    {item.employment_status || "-"}
  </span>
</td>

  <td className="border-b border-r border-border-color px-4 py-2 text-sm text-text-secondary text-center whitespace-nowrap">
    {formatUploadedAt(item.uploaded_at)}
  </td>

   <td
  className="
    sticky right-0
    border-b border-l border-border-color
    bg-surface
    px-4 py-2
  "
>

  <div className="flex items-center gap-2">

    {/* View */}
    <button
     title="View"
      onClick={() => handleView(item)}
      className="
        group
        flex h-9 w-9 items-center justify-center
        rounded-xl
        border border-border-color
        bg-surface
        text-text-secondary
        transition-all
        hover:border-indigo-200 hover:dark:border-indigo-500/20
        hover:bg-indigo-50 hover:dark:bg-indigo-500/10
        hover:text-indigo-600 hover:dark:text-indigo-400
      "
    >
      <Eye size={16} />
    </button>

    {/* Edit */}
    <button
     title="Edit"
      onClick={() => handleEdit(item)}
      className="
        group
        flex h-9 w-9 items-center justify-center
        rounded-xl
        border border-border-color
        bg-surface
        text-text-secondary
        transition-all
        hover:border-blue-200 hover:dark:border-blue-500/20
        hover:bg-blue-50 hover:dark:bg-blue-500/10
        hover:text-blue-600 hover:dark:text-blue-400
      "
    >
      <Pencil size={16} />
    </button>

  </div>

</td>
        </tr>
      ))
    )}
  </tbody>
      
                    
                    </table>
                  </div>
                </div>
              </div>
  <div className="flex items-center justify-between border-t border-border-color px-6 py-4">

  <div className="text-sm text-text-secondary">
  Showing
  <span className="mx-1 font-semibold text-text-primary">
    {startRecord}
  </span>
  to
  <span className="mx-1 font-semibold text-text-primary">
    {endRecord}
  </span>
 of
<span className="mx-1 font-semibold text-text-primary">
  {totalRecords}
</span>
records
</div>

    <div className="flex items-center gap-2">

      <span className="text-sm text-text-muted">
        Show
      </span>

 <select
  value={pageSize}
  onChange={(e) => {
    setPageSize(Number(e.target.value));
    setCurrentPage(1);
  }}
  className="rounded-lg border border-border-color px-2 py-1 text-sm"
>
  {[10, 20, 50, 100, 200, 300, 400, 500, 750, 1000].map((size) => (
    <option key={size} value={size}>
      {size}
    </option>
  ))}
</select>

      <button
        onClick={() =>
          setCurrentPage((prev) =>
            Math.max(prev - 1, 1)
          )
        }
        disabled={currentPage === 1}
        className="rounded-lg border border-border-color px-3 py-1 text-sm disabled:opacity-40"
      >
        Prev
      </button>

      <span className="text-sm text-text-secondary">
        {currentPage} / {totalPages || 1}
      </span>

      <button
        onClick={() =>
          setCurrentPage((prev) =>
            Math.min(prev + 1, totalPages)
          )
        }
        disabled={
    currentPage >= totalPages
  }
        className="rounded-lg border border-border-color px-3 py-1 text-sm disabled:opacity-40"
      >
        Next
      </button>

    </div>

  </div>

            </div>

            {/* Validation Error Modal */}
            <ValidationErrorModal
              isOpen={validationError !== null}
              onClose={() => setValidationError(null)}
              errorData={validationError}
            />

            {/* Circle/CMP Skipped Rows Report (upload still succeeded) */}
            <ValidationErrorModal
              isOpen={circleCmpReport !== null}
              onClose={() => setCircleCmpReport(null)}
              errorData={circleCmpReport}
              title="Some Rows Were Skipped"
              subtitle="Circle/CMP could not be matched for these rows. The rest of the file uploaded successfully — fix these rows and re-upload only them if needed."
              tone="warning"
            />

            {/* Popup Modal */}

    {showUploadModal && (
<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4">

  <div className="w-full max-w-lg overflow-visible rounded-3xl bg-surface shadow-[0_20px_60px_rgba(0,0,0,0.15)]">

    {/* Header */}
    <div className="flex items-center justify-between border-b px-7 py-5">

      <div>
        <h2 className="text-2xl font-bold text-text-primary">
          Upload Report
        </h2>

        <p className="mt-1 text-sm text-text-muted">
          Upload manpower physical report
        </p>
      </div>

      <button
        onClick={() => setShowUploadModal(false)}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-muted text-xl text-text-muted hover:bg-red-50 hover:dark:bg-red-500/10 hover:text-red-600 hover:dark:text-red-400"
      >
        ×
      </button>

    </div>

    <div className="space-y-6 p-7 overflow-visible">

      {/* Date */}
      <div>
        <label className="mb-2 block text-sm font-semibold text-text-secondary">
          Report Date
        </label>

      <PremiumDatePicker
  value={reportDate}
  onChange={setReportDate}
  className="w-full"
  isDateDisabled={(date) => {
    const today = new Date();

    today.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);

    return date >= today; // Disable today and future dates
  }}
/>
      </div>

      {/* Uploaded By */}
      <div>
        <label className="mb-2 block text-sm font-semibold text-text-secondary">
          Uploaded By
        </label>

        <input
          type="text"
          value={uploadedBy}
          onChange={(e)=>setUploadedBy(e.target.value)}
          placeholder="Enter uploaded by"
          className="w-full rounded-2xl border border-border-color px-5 py-3 outline-none focus:border-indigo-500"
        />
      </div>

      {/* File Upload */}
      <div>

        <div className="mb-3 flex items-center justify-between">

          <label className="text-sm font-semibold text-text-secondary">
            Excel File
          </label>

          <a
            href="/formats/physical_format.xlsx"
            download
            className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white"
          >
            Download Format
          </a>

        </div>

        <label className="flex cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed border-border-strong bg-surface-muted p-8 hover:border-indigo-500">

          <div className="text-sm font-semibold text-text-secondary">
            {reportFile
              ? reportFile.name
              : "Choose Excel File"}
          </div>

          <div className="mt-1 text-xs text-text-muted">
            XLSX / XLS / CSV
          </div>

          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e)=>setReportFile(e.target.files[0])}
          />

        </label>

      </div>

    </div>

    {/* Footer */}
    <div className="flex justify-end gap-3 border-t bg-surface-muted px-7 py-5">

      <button
        onClick={()=>setShowUploadModal(false)}
        className="rounded-2xl border border-border-color bg-surface px-6 py-3 font-semibold text-text-secondary"
      >
        Cancel
      </button>

      <button
        onClick={handleReportUpload}
        disabled={uploading}
        className="rounded-2xl bg-gradient-to-r from-emerald-500 to-green-600 px-7 py-3 font-semibold text-white shadow-lg disabled:opacity-60"
      >
        {uploading ? "Uploading..." : "Upload Report"}
      </button>

    </div>

  </div>

</div>
)}

 {viewEmployee && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-2 backdrop-blur-sm sm:p-6">
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="flex h-full w-full max-w-[1440px] flex-col overflow-hidden rounded-[20px] bg-white shadow-[0_30px_80px_rgba(15,23,42,0.35)] sm:max-h-[95vh]"
    >
      {/* HEADER */}
      <div className="flex items-center justify-between gap-4 border-b border-slate-100 bg-white px-5 py-4 sm:px-6">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900">
            Employee Profile
          </h2>
          <p className="text-xs text-slate-500">
            Detailed information and employee overview
          </p>
        </div>
        <button
          type="button"
          onClick={closeViewEmployee}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-red-50 hover:text-red-600"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* BODY */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* LEFT SIDEBAR */}
        <div className="hidden w-[260px] shrink-0 flex-col justify-between overflow-y-auto border-r border-slate-100 bg-slate-50/70 px-4 py-6 xl:flex">
          <div>
            <div className="mb-5 rounded-2xl border border-slate-100 bg-white p-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-xl font-bold text-white shadow-lg">
                {getEmployeeInitials(viewEmployee.employee_name)}
              </div>
              <p className="mt-3 truncate text-sm font-bold text-slate-800">
                {viewEmployee.employee_name || "-"}
              </p>
              <p className="truncate text-xs text-slate-400">
                {viewEmployee.employee_code || "-"}
                {viewEmployee.job_role ? ` • ${viewEmployee.job_role}` : ""}
              </p>
              <span
                className={`mt-2 inline-block rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                  viewEmployee.employment_status === "Inactive"
                    ? "bg-rose-50 text-rose-600"
                    : "bg-emerald-50 text-emerald-600"
                }`}
              >
                {viewEmployee.employment_status || "Active"}
              </span>
            </div>

            <div className="space-y-1">
              {PROFILE_VIEW_STEPS.map((step) => {
                const isActive = activeProfileStep === step.id;
                const StepIcon = step.icon;
                return (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => scrollToProfileStep(step.id)}
                    className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition ${
                      isActive
                        ? "bg-white shadow-sm ring-1 ring-indigo-100"
                        : "hover:bg-white/70"
                    }`}
                  >
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
                        isActive
                          ? "bg-gradient-to-br from-indigo-600 to-violet-600 text-white"
                          : "bg-slate-200 text-slate-500"
                      }`}
                    >
                      <StepIcon className="h-4 w-4" />
                    </span>
                    <span>
                      <p
                        className={`text-[13px] font-semibold ${
                          isActive ? "text-indigo-700" : "text-slate-600"
                        }`}
                      >
                        {step.label}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {step.subtitle}
                      </p>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            onClick={handleDownloadProfile}
            className="flex items-center justify-center gap-2 rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-2.5 text-sm font-semibold text-indigo-600 transition hover:bg-indigo-100"
          >
            <Download className="h-4 w-4" />
            Download Profile
          </button>
        </div>

        {/* MAIN SCROLL AREA */}
        <div
          ref={profileScrollRef}
          className="flex-1 overflow-y-auto px-5 py-6 sm:px-6"
        >
          <div className="mx-auto max-w-6xl space-y-5">
            {/* OVERVIEW */}
            <ProfileSection
              stepId="overview"
              sectionRef={(el) => (profileStepRefs.current.overview = el)}
              icon={Home}
              iconClass="bg-indigo-50 text-indigo-600"
              title="Overview"
            >
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
                <ProfileField
                  icon={MapPin}
                  iconClass="bg-blue-50 text-blue-600"
                  label="Circle"
                  value={viewEmployee.circle}
                />
                <ProfileField
                  icon={Building2}
                  iconClass="bg-violet-50 text-violet-600"
                  label="CMP"
                  value={viewEmployee.cmp}
                />
                <ProfileField
                  icon={FileText}
                  iconClass="bg-amber-50 text-amber-600"
                  label="PPRJ Status"
                  value={viewEmployee.pprj_status}
                />
                <ProfileField
                  icon={Code2}
                  iconClass="bg-slate-100 text-slate-600"
                  label="PPRJ Code"
                  value={viewEmployee.pprj_code}
                />
                <ProfileField
                  icon={IdCard}
                  iconClass="bg-sky-50 text-sky-600"
                  label="Employee Code"
                  value={viewEmployee.employee_code}
                />
                <ProfileField
                  icon={BadgeCheck}
                  iconClass="bg-emerald-50 text-emerald-600"
                  label="Employee Name"
                  value={viewEmployee.employee_name}
                />
              </div>
              <div className="mt-4 border-t border-slate-100 pt-4">
                <ProfileField
                  icon={CalendarDays}
                  iconClass="bg-indigo-50 text-indigo-600"
                  label="Uploaded At"
                  value={formatUploadedAt(viewEmployee.uploaded_at)}
                />
              </div>
            </ProfileSection>

            {/* PERSONAL & ROLE */}
            <ProfileSection
              stepId="personal"
              sectionRef={(el) => (profileStepRefs.current.personal = el)}
              icon={User}
              iconClass="bg-blue-50 text-blue-600"
              title="Personal & Role Information"
            >
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
                <ProfileField
                  icon={Users}
                  iconClass="bg-slate-100 text-slate-600"
                  label="Father Name"
                  value={viewEmployee.father_name}
                />
                <ProfileField
                  icon={Briefcase}
                  iconClass="bg-violet-50 text-violet-600"
                  label="Function Name"
                  value={viewEmployee.function_name}
                />
                <ProfileField
                  icon={BadgeCheck}
                  iconClass="bg-emerald-50 text-emerald-600"
                  label="Job Role"
                  value={viewEmployee.job_role}
                />
                <ProfileField
                  icon={ShieldCheck}
                  iconClass="bg-sky-50 text-sky-600"
                  label="Manpower Signoff Scope"
                  value={viewEmployee.manpower_signoff_scope}
                />
                <ProfileField
                  icon={Sparkles}
                  iconClass="bg-amber-50 text-amber-600"
                  label="Scrum Job Role"
                  value={viewEmployee.scrum_job_role}
                />
                <ProfileField
                  icon={Phone}
                  iconClass="bg-blue-50 text-blue-600"
                  label="Mobile Number"
                  value={viewEmployee.mobile_number}
                />
                <ProfileField
                  icon={CalendarDays}
                  iconClass="bg-indigo-50 text-indigo-600"
                  label="DOB"
                  value={
                    viewEmployee.dob
                      ? new Date(viewEmployee.dob).toLocaleDateString("en-GB")
                      : "-"
                  }
                />
                <ProfileField
                  icon={User}
                  iconClass="bg-slate-100 text-slate-600"
                  label="Age"
                  value={viewEmployee.age}
                />
                <ProfileField
                  icon={CalendarDays}
                  iconClass="bg-indigo-50 text-indigo-600"
                  label="Date of Joining"
                  value={
                    viewEmployee.date_of_joining
                      ? new Date(viewEmployee.date_of_joining).toLocaleDateString(
                          "en-GB"
                        )
                      : "-"
                  }
                />
                <ProfileField
                  icon={ShieldCheck}
                  iconClass={
                    viewEmployee.employment_status === "Inactive"
                      ? "bg-rose-50 text-rose-600"
                      : "bg-emerald-50 text-emerald-600"
                  }
                  label="Employment Status"
                  value={viewEmployee.employment_status}
                />
              </div>
            </ProfileSection>

            {/* WORK & REPORTING */}
            <ProfileSection
              stepId="work"
              sectionRef={(el) => (profileStepRefs.current.work = el)}
              icon={Briefcase}
              iconClass="bg-violet-50 text-violet-600"
              title="Work & Reporting Information"
            >
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
                <ProfileField
                  icon={LogOut}
                  iconClass="bg-rose-50 text-rose-600"
                  label="Resigned Date"
                  value={
                    viewEmployee.resigned_date
                      ? new Date(viewEmployee.resigned_date).toLocaleDateString(
                          "en-GB"
                        )
                      : "-"
                  }
                />
                <ProfileField
                  icon={CalendarDays}
                  iconClass="bg-rose-50 text-rose-600"
                  label="Last Working Date"
                  value={
                    viewEmployee.last_working_date
                      ? new Date(
                          viewEmployee.last_working_date
                        ).toLocaleDateString("en-GB")
                      : "-"
                  }
                />
                <ProfileField
                  icon={Hash}
                  iconClass="bg-slate-100 text-slate-600"
                  label="RM Code"
                  value={viewEmployee.rm_code}
                />
                <ProfileField
                  icon={Users}
                  iconClass="bg-indigo-50 text-indigo-600"
                  label="Reporting Manager"
                  value={viewEmployee.reporting_manager}
                />
                <ProfileField
                  icon={Mail}
                  iconClass="bg-blue-50 text-blue-600"
                  label="Company Email"
                  value={viewEmployee.company_email_id}
                />
                <ProfileField
                  icon={Laptop}
                  iconClass="bg-sky-50 text-sky-600"
                  label="Laptop Status"
                  value={viewEmployee.laptop_status}
                />
              </div>
            </ProfileSection>

            {/* ADDITIONAL INFORMATION */}
            <ProfileSection
              stepId="additional"
              sectionRef={(el) => (profileStepRefs.current.additional = el)}
              icon={ShieldCheck}
              iconClass="bg-emerald-50 text-emerald-600"
              title="Additional Information"
            >
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
                <ProfileField
                  icon={Landmark}
                  iconClass="bg-emerald-50 text-emerald-600"
                  label="IFSC Code"
                  value={viewEmployee.ifsc_code}
                />
                <ProfileField
                  icon={CreditCard}
                  iconClass="bg-blue-50 text-blue-600"
                  label="Bank Account No"
                  value={viewEmployee.bank_account_no}
                />
                <ProfileField
                  icon={IdCard}
                  iconClass="bg-sky-50 text-sky-600"
                  label="PAN No"
                  value={viewEmployee.pan_no}
                />
                <ProfileField
                  icon={Fingerprint}
                  iconClass="bg-violet-50 text-violet-600"
                  label="Aadhaar No"
                  value={viewEmployee.aadhaar_no}
                />
                <ProfileField
                  icon={Users}
                  iconClass="bg-slate-100 text-slate-600"
                  label="UAN No"
                  value={viewEmployee.uan_no}
                />
                <ProfileField
                  icon={ShieldCheck}
                  iconClass="bg-emerald-50 text-emerald-600"
                  label="ESIC IP No"
                  value={viewEmployee.esic_ip_no}
                />
                <ProfileField
                  icon={ShieldCheck}
                  iconClass="bg-amber-50 text-amber-600"
                  label="PF No"
                  value={viewEmployee.pf_no}
                />
                <ProfileField
                  icon={ShieldCheck}
                  iconClass="bg-rose-50 text-rose-600"
                  label="GTLI"
                  value={viewEmployee.gtli}
                />
                <ProfileField
                  icon={Wallet}
                  iconClass="bg-indigo-50 text-indigo-600"
                  label="NTH Salary"
                  value={
                    viewEmployee.nth_salary
                      ? `₹ ${Number(viewEmployee.nth_salary).toLocaleString(
                          "en-IN"
                        )}`
                      : "-"
                  }
                />
              </div>

              <div className="mt-4 border-t border-slate-100 pt-4">
                <p className="mb-1.5 text-[11px] font-medium text-slate-400">
                  Remarks
                </p>
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-[13px] text-slate-700">
                  {viewEmployee.remarks || "-"}
                </div>
              </div>
            </ProfileSection>

            {/* DOCUMENTS */}
            <ProfileSection
              stepId="documents"
              sectionRef={(el) => (profileStepRefs.current.documents = el)}
              icon={FileText}
              iconClass="bg-slate-100 text-slate-600"
              title="Documents"
            >
              <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-[13px] text-slate-400">
                No documents uploaded yet.
              </p>
            </ProfileSection>

            {/* ACTIVITY LOG */}
            <ProfileSection
              stepId="activity"
              sectionRef={(el) => (profileStepRefs.current.activity = el)}
              icon={History}
              iconClass="bg-slate-100 text-slate-600"
              title="Activity Log"
            >
              <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-[13px] text-slate-400">
                No activity recorded yet.
              </p>
            </ProfileSection>
          </div>
        </div>
      </div>

      {/* FOOTER */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-white px-5 py-3 text-xs text-slate-500 sm:px-6">
        <div className="flex items-center gap-1.5">
          <Hash className="h-3.5 w-3.5" />
          Record ID: <span className="font-semibold text-slate-700">#EMP-{viewEmployee.id}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <CalendarDays className="h-3.5 w-3.5" />
          Created On:{" "}
          <span className="font-semibold text-slate-700">
            {formatUploadedAt(viewEmployee.created_at)}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" />
          Last Updated:{" "}
          <span className="font-semibold text-slate-700">
            {formatUploadedAt(viewEmployee.uploaded_at)}
          </span>
        </div>
      </div>
    </motion.div>
  </div>
)}


  {showEmployeeModal && (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-2 backdrop-blur-sm sm:p-6">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="flex h-full w-full max-w-[1440px] flex-col overflow-hidden rounded-[20px] bg-white shadow-[0_30px_80px_rgba(15,23,42,0.35)] sm:max-h-[95vh]"
      >
        {/* HEADER */}
        <div className="flex items-center justify-between gap-4 border-b border-slate-100 bg-white px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={closeEmployeeModal}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <h2 className="text-lg font-bold tracking-tight text-slate-900">
                {isEditMode ? "Edit Employee" : "Add New Employee"}
              </h2>
              <p className="text-xs text-slate-500">
                {isEditMode
                  ? "Update the details below and save your changes"
                  : "Fill in the details below to add a new employee to the system"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50 to-violet-50 px-4 py-2 md:flex">
              <Sparkles className="h-4 w-4 text-indigo-500" />
              <div className="text-xs leading-tight">
                <p className="font-semibold text-indigo-700">
                  Building a Stronger Tomorrow
                </p>
                <p className="text-slate-400">Our People, Our Strength</p>
              </div>
            </div>
            <button
              type="button"
              onClick={closeEmployeeModal}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-red-50 hover:text-red-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* BODY */}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* LEFT STEPPER */}
          <div className="hidden w-[230px] shrink-0 flex-col justify-between overflow-y-auto border-r border-slate-100 bg-slate-50/70 px-4 py-6 xl:flex">
            <div className="space-y-1">
              {EMPLOYEE_FORM_STEPS.map((step, index) => {
                const isActive = activeEmployeeStep === step.id;
                return (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => scrollToEmployeeStep(step.id)}
                    className={`flex w-full items-start gap-3 rounded-2xl px-3 py-2.5 text-left transition ${
                      isActive
                        ? "bg-white shadow-sm ring-1 ring-indigo-100"
                        : "hover:bg-white/70"
                    }`}
                  >
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition ${
                        isActive
                          ? "bg-gradient-to-br from-indigo-600 to-violet-600 text-white"
                          : "bg-slate-200 text-slate-500"
                      }`}
                    >
                      {index + 1}
                    </span>
                    <span>
                      <p
                        className={`text-[13px] font-semibold ${
                          isActive ? "text-indigo-700" : "text-slate-600"
                        }`}
                      >
                        {step.label}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {step.subtitle}
                      </p>
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-6 rounded-2xl border border-dashed border-indigo-100 bg-indigo-50/40 px-4 py-5 text-center">
              <Users className="mx-auto mb-2 h-8 w-8 text-indigo-300" />
              <p className="text-[13px] font-bold text-slate-700">
                Better Teams
              </p>
              <p className="text-[11px] text-slate-400">Stronger Networks</p>
            </div>
          </div>

          {/* MAIN SCROLL AREA */}
          <div
            ref={employeeScrollRef}
            className="flex-1 overflow-y-auto px-5 py-6 sm:px-6"
          >
            <div className="mx-auto grid w-full max-w-6xl gap-5 xl:grid-cols-[1fr_260px]">
              <div className="space-y-5">
                {/* 1. BASIC INFORMATION */}
                <EmployeeFormSection
                  stepId="basic"
                  sectionRef={(el) => (employeeStepRefs.current.basic = el)}
                  icon={User}
                  iconClass="bg-blue-50 text-blue-600"
                  title="Basic Information"
                  subtitle="Personal details of the employee"
                >
                  <EmployeeField label="Employee Code">
                    <input
                      type="text"
                      name="employee_code"
                      value={employeeForm.employee_code}
                      onChange={handleEmployeeChange}
                      placeholder="Enter Employee Code"
                      className={employeeInputClass}
                    />
                  </EmployeeField>
                  <EmployeeField label="Employee Name" required>
                    <input
                      type="text"
                      name="employee_name"
                      value={employeeForm.employee_name}
                      onChange={handleEmployeeChange}
                      placeholder="Enter Employee Name"
                      className={employeeInputClass}
                    />
                  </EmployeeField>
                  <EmployeeField label="Father Name">
                    <input
                      type="text"
                      name="father_name"
                      value={employeeForm.father_name}
                      onChange={handleEmployeeChange}
                      placeholder="Enter Father Name"
                      className={employeeInputClass}
                    />
                  </EmployeeField>
                  <EmployeeField label="Mobile Number">
                    <div className="relative">
                      <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        name="mobile_number"
                        value={employeeForm.mobile_number}
                        onChange={handleEmployeeChange}
                        placeholder="Enter Mobile Number"
                        className={`${employeeInputClass} pl-9`}
                      />
                    </div>
                  </EmployeeField>
                  <EmployeeField label="Date of Birth">
                    <PremiumDatePicker
                      value={employeeForm.dob}
                      onChange={(value) =>
                        handleEmployeeChange({ target: { name: "dob", value: value || "" } })
                      }
                      isDateDisabled={(date) => date > new Date()}
                    />
                  </EmployeeField>
                  <EmployeeField label="Age">
                    <input
                      type="text"
                      value={employeeForm.age}
                      disabled
                      placeholder="Auto-calculated"
                      className={`${employeeInputClass} cursor-not-allowed bg-slate-50 text-slate-400`}
                    />
                  </EmployeeField>
                </EmployeeFormSection>

                {/* 2. ORGANIZATION DETAILS */}
                <EmployeeFormSection
                  stepId="organization"
                  sectionRef={(el) =>
                    (employeeStepRefs.current.organization = el)
                  }
                  icon={Building2}
                  iconClass="bg-violet-50 text-violet-600"
                  title="Organization Details"
                  subtitle="Work and organization related information"
                >
                  <EmployeeField label="Circle" required>
                    <Select
                      styles={selectStyles}
                      options={circleOptions}
                      placeholder="Select Circle"
                      value={
                        circleOptions.find(
                          (item) => item.value === employeeForm.circle
                        ) || null
                      }
                      onChange={(selected) =>
                        setEmployeeForm({
                          ...employeeForm,
                          circle: selected?.value || "",
                          cmp: "",
                        })
                      }
                    />
                  </EmployeeField>
                  <EmployeeField label="CMP" required>
                    <Select
                      styles={selectStyles}
                      options={getCmpOptions(employeeForm.circle)}
                      placeholder={
                        employeeForm.circle
                          ? "Select CMP"
                          : "First select Circle"
                      }
                      isDisabled={!employeeForm.circle}
                      value={
                        getCmpOptions(employeeForm.circle).find(
                          (item) => item.value === employeeForm.cmp
                        ) || null
                      }
                      onChange={(selected) =>
                        setEmployeeForm({
                          ...employeeForm,
                          cmp: selected?.value || "",
                        })
                      }
                    />
                  </EmployeeField>
                  <EmployeeField label="PPRJ Status">
                    <Select
                      styles={selectStyles}
                      options={pprjStatusOptions}
                      placeholder="Select PPRJ Status"
                      value={
                        pprjStatusOptions.find(
                          (item) => item.value === employeeForm.pprj_status
                        ) || null
                      }
                      onChange={(selected) =>
                        setEmployeeForm({
                          ...employeeForm,
                          pprj_status: selected?.value || "",
                        })
                      }
                    />
                  </EmployeeField>
                  <EmployeeField label="PPRJ Code">
                    <input
                      type="text"
                      name="pprj_code"
                      value={employeeForm.pprj_code}
                      onChange={handleEmployeeChange}
                      placeholder="Enter PPRJ Code"
                      className={employeeInputClass}
                    />
                  </EmployeeField>
                  <EmployeeField label="Function Name">
                    <input
                      type="text"
                      name="function_name"
                      value={employeeForm.function_name}
                      onChange={handleEmployeeChange}
                      placeholder="Enter Function Name"
                      className={employeeInputClass}
                    />
                  </EmployeeField>
                  <EmployeeField label="Job Role">
                    <Select
                      styles={selectStyles}
                      options={jobRoleOptions}
                      placeholder="Select Job Role"
                      isSearchable
                      menuPlacement="auto"
                      menuPosition="fixed"
                      openMenuOnClick
                      openMenuOnFocus
                      blurInputOnSelect={false}
                      noOptionsMessage={() => "No Role Found"}
                      value={
                        jobRoleOptions.find(
                          (item) =>
                            item.value?.trim().toLowerCase() ===
                            String(employeeForm.job_role || "")
                              .trim()
                              .toLowerCase()
                        ) || null
                      }
                      onChange={(selected) =>
                        setEmployeeForm({
                          ...employeeForm,
                          job_role: selected?.value || "",
                        })
                      }
                    />
                  </EmployeeField>
                  <EmployeeField label="Scrum Job Role">
                    <Select
                      styles={selectStyles}
                      options={jobRoleOptions}
                      placeholder="Select Job Role"
                      isSearchable
                      menuPlacement="auto"
                      menuPosition="fixed"
                      openMenuOnClick
                      openMenuOnFocus
                      blurInputOnSelect={false}
                      noOptionsMessage={() => "No Role Found"}
                      value={
                        jobRoleOptions.find(
                          (item) => item.value === employeeForm.scrum_job_role
                        ) || null
                      }
                      onChange={(selected) =>
                        setEmployeeForm({
                          ...employeeForm,
                          scrum_job_role: selected?.value || "",
                        })
                      }
                    />
                  </EmployeeField>
                  <EmployeeField label="Employment Status">
                    <Select
                      styles={selectStyles}
                      options={employmentStatusOptions}
                      placeholder="Select Status"
                      value={
                        employmentStatusOptions.find(
                          (item) =>
                            item.value === employeeForm.employment_status
                        ) || null
                      }
                      onChange={(selected) =>
                        setEmployeeForm({
                          ...employeeForm,
                          employment_status: selected?.value || "",
                        })
                      }
                    />
                  </EmployeeField>
                  <EmployeeField label="Date of Joining">
                    <PremiumDatePicker
                      value={employeeForm.date_of_joining}
                      onChange={(value) =>
                        handleEmployeeChange({
                          target: { name: "date_of_joining", value: value || "" },
                        })
                      }
                    />
                  </EmployeeField>
                  <EmployeeField label="Reporting Manager">
                    <input
                      type="text"
                      name="reporting_manager"
                      value={employeeForm.reporting_manager}
                      onChange={handleEmployeeChange}
                      placeholder="Enter Reporting Manager"
                      className={employeeInputClass}
                    />
                  </EmployeeField>
                  <EmployeeField label="RM Code">
                    <input
                      type="text"
                      name="rm_code"
                      value={employeeForm.rm_code}
                      onChange={handleEmployeeChange}
                      placeholder="Enter RM Code"
                      className={employeeInputClass}
                    />
                  </EmployeeField>
                </EmployeeFormSection>

                {/* 3. SIGNOFF & ACCESS */}
                <EmployeeFormSection
                  stepId="signoff"
                  sectionRef={(el) => (employeeStepRefs.current.signoff = el)}
                  icon={ShieldCheck}
                  iconClass="bg-sky-50 text-sky-600"
                  title="Signoff & Access"
                  subtitle="Signoff scope and system access details"
                >
                  <EmployeeField label="Manpower Signoff Scope">
                    <Select
                      styles={selectStyles}
                      options={signoffOptions}
                      placeholder="Select Scope"
                      value={
                        signoffOptions.find(
                          (item) =>
                            item.value ===
                            employeeForm.manpower_signoff_scope
                        ) || null
                      }
                      onChange={(selected) =>
                        setEmployeeForm({
                          ...employeeForm,
                          manpower_signoff_scope: selected?.value || "",
                        })
                      }
                    />
                  </EmployeeField>
                  <EmployeeField label="Laptop Status">
                    <Select
                      styles={selectStyles}
                      options={laptopStatusOptions}
                      placeholder="Select Laptop Status"
                      value={
                        laptopStatusOptions.find(
                          (item) => item.value === employeeForm.laptop_status
                        ) || null
                      }
                      onChange={(selected) =>
                        setEmployeeForm({
                          ...employeeForm,
                          laptop_status: selected?.value || "",
                        })
                      }
                    />
                  </EmployeeField>
                  <EmployeeField label="Company Email">
                    <input
                      type="email"
                      name="company_email_id"
                      value={employeeForm.company_email_id}
                      onChange={handleEmployeeChange}
                      placeholder="Enter company email"
                      className={employeeInputClass}
                    />
                  </EmployeeField>
                  <EmployeeField label="GTLI">
                    <Select
                      styles={selectStyles}
                      options={gtliOptions}
                      placeholder="Select GTLI"
                      value={
                        gtliOptions.find(
                          (item) => item.value === employeeForm.gtli
                        ) || null
                      }
                      onChange={(selected) =>
                        setEmployeeForm({
                          ...employeeForm,
                          gtli: selected?.value || "",
                        })
                      }
                    />
                  </EmployeeField>
                </EmployeeFormSection>

                {/* 4. BANKING & COMPLIANCE */}
                <EmployeeFormSection
                  stepId="banking"
                  sectionRef={(el) => (employeeStepRefs.current.banking = el)}
                  icon={CreditCard}
                  iconClass="bg-emerald-50 text-emerald-600"
                  title="Banking & Compliance"
                  subtitle="Statutory and banking information"
                >
                  <EmployeeField label="PAN No">
                    <input
                      type="text"
                      name="pan_no"
                      value={employeeForm.pan_no}
                      onChange={handleEmployeeChange}
                      placeholder="Enter PAN number"
                      className={`${employeeInputClass} uppercase`}
                    />
                  </EmployeeField>
                  <EmployeeField label="Aadhaar No" required>
                    <input
                      type="text"
                      name="aadhaar_no"
                      value={employeeForm.aadhaar_no}
                      onChange={handleEmployeeChange}
                      placeholder="Enter Aadhaar number"
                      className={employeeInputClass}
                    />
                  </EmployeeField>
                  <EmployeeField label="UAN No">
                    <input
                      type="text"
                      name="uan_no"
                      value={employeeForm.uan_no}
                      onChange={handleEmployeeChange}
                      placeholder="Enter UAN number"
                      className={employeeInputClass}
                    />
                  </EmployeeField>
                  <EmployeeField label="PF No">
                    <input
                      type="text"
                      name="pf_no"
                      value={employeeForm.pf_no}
                      onChange={handleEmployeeChange}
                      placeholder="Enter PF number"
                      className={employeeInputClass}
                    />
                  </EmployeeField>
                  <EmployeeField label="ESIC IP No">
                    <input
                      type="text"
                      name="esic_ip_no"
                      value={employeeForm.esic_ip_no}
                      onChange={handleEmployeeChange}
                      placeholder="Enter ESIC IP number"
                      className={employeeInputClass}
                    />
                  </EmployeeField>
                  <EmployeeField label="Bank Account No">
                    <input
                      type="text"
                      name="bank_account_no"
                      value={employeeForm.bank_account_no}
                      onChange={handleEmployeeChange}
                      placeholder="Enter account number"
                      className={employeeInputClass}
                    />
                  </EmployeeField>
                  <EmployeeField label="IFSC Code">
                    <input
                      type="text"
                      name="ifsc_code"
                      value={employeeForm.ifsc_code}
                      onChange={handleEmployeeChange}
                      placeholder="Enter IFSC code"
                      className={`${employeeInputClass} uppercase`}
                    />
                  </EmployeeField>
                </EmployeeFormSection>

                {/* 5. SALARY DETAILS */}
                <EmployeeFormSection
                  stepId="salary"
                  sectionRef={(el) => (employeeStepRefs.current.salary = el)}
                  icon={Wallet}
                  iconClass="bg-amber-50 text-amber-600"
                  title="Salary Details"
                  subtitle="Compensation information"
                >
                  <EmployeeField label="NTH Salary Amount">
                    <input
                      type="number"
                      name="nth_salary"
                      value={employeeForm.nth_salary}
                      onChange={handleEmployeeChange}
                      placeholder="Enter salary amount"
                      className={employeeInputClass}
                    />
                  </EmployeeField>
                </EmployeeFormSection>

                {/* 6. EXIT INFORMATION */}
                <EmployeeFormSection
                  stepId="exit"
                  sectionRef={(el) => (employeeStepRefs.current.exit = el)}
                  icon={LogOut}
                  iconClass="bg-rose-50 text-rose-600"
                  title="Exit Information"
                  subtitle="Required if employee becomes inactive"
                  badge={
                    employeeForm.employment_status === "Inactive" ? (
                      <span className="rounded-full bg-rose-100 px-2.5 py-1 text-[11px] font-semibold text-rose-600">
                        Employee Inactive
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-400">
                        Shown when Inactive
                      </span>
                    )
                  }
                >
                  <EmployeeField label="Resigned Date">
                    <PremiumDatePicker
                      value={employeeForm.resigned_date}
                      onChange={(value) =>
                        handleEmployeeChange({
                          target: { name: "resigned_date", value: value || "" },
                        })
                      }
                    />
                  </EmployeeField>
                  <EmployeeField label="Last Working Date">
                    <PremiumDatePicker
                      value={employeeForm.last_working_date}
                      onChange={(value) =>
                        handleEmployeeChange({
                          target: { name: "last_working_date", value: value || "" },
                        })
                      }
                    />
                  </EmployeeField>
                </EmployeeFormSection>

                {/* 7. ADDITIONAL REMARKS */}
                <EmployeeFormSection
                  stepId="remarks"
                  sectionRef={(el) => (employeeStepRefs.current.remarks = el)}
                  icon={FileText}
                  iconClass="bg-slate-100 text-slate-600"
                  title="Additional Remarks"
                  subtitle="Any other important information"
                >
                  <div className="sm:col-span-2 lg:col-span-3">
                    <textarea
                      rows={4}
                      name="remarks"
                      maxLength={500}
                      value={employeeForm.remarks}
                      onChange={handleEmployeeChange}
                      placeholder="Enter any additional remarks here..."
                      className={`${employeeInputClass} h-auto resize-none py-3`}
                    />
                    <p className="mt-1 text-right text-[11px] text-slate-400">
                      {(employeeForm.remarks || "").length} / 500
                    </p>
                  </div>
                </EmployeeFormSection>
              </div>

              {/* RIGHT PROFILE CARD */}
              <div className="hidden xl:block">
                <div className="sticky top-0 space-y-4 rounded-[18px] border border-slate-100 bg-gradient-to-b from-indigo-50/60 via-white to-white p-5 shadow-sm">
                  <div className="flex flex-col items-center text-center">
                    <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-2xl font-bold text-white shadow-lg">
                      {getEmployeeInitials(employeeForm.employee_name)}
                    </div>
                    <p className="mt-3 text-sm font-semibold text-slate-800">
                      {employeeForm.employee_name || "New Employee"}
                    </p>
                    <p className="text-xs text-slate-400">
                      {employeeForm.job_role || "Job role not set"}
                    </p>
                  </div>

                  <div className="space-y-3 border-t border-slate-100 pt-4 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Employee Code</span>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700">
                        {employeeForm.employee_code || "Not set"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">
                        Employment Status
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-1 font-semibold ${
                          employeeForm.employment_status === "Active"
                            ? "bg-emerald-50 text-emerald-600"
                            : employeeForm.employment_status === "Inactive"
                            ? "bg-rose-50 text-rose-600"
                            : "bg-slate-100 text-slate-400"
                        }`}
                      >
                        {employeeForm.employment_status || "Not set"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Record</span>
                      <span className="font-semibold text-slate-700">
                        {isEditMode ? `Editing #${editingId}` : "New Record"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Last Updated</span>
                      <span className="font-semibold text-slate-700">
                        {formatUploadedAt(employeeForm.uploaded_at)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-white px-5 py-3.5 sm:px-6">
          <p className="text-xs text-slate-400">
            Fields marked with <span className="text-rose-500">*</span> are
            mandatory.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={closeEmployeeModal}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleResetEmployeeForm}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={handleSaveEmployeeDraft}
              className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm font-semibold text-indigo-600 transition hover:bg-indigo-100"
            >
              Save as Draft
            </button>
            <button
              type="button"
              onClick={handleAddEmployee}
              disabled={saving}
              className="rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:opacity-90 disabled:opacity-50"
            >
              {saving
                ? "Saving..."
                : isEditMode
                ? "Update Employee"
                : "Save Employee"}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  )}
          
          </div>
        </div>
      </div>
    );
  }
