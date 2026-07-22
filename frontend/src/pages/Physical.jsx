  import React, { useEffect, useState } from "react";
 import {
  UserPlus,
  Upload,
  Eye,
  Pencil,
   Download,
  Trash2,
  RotateCcw,
  Clock,
  BarChart3
} from "lucide-react";
import Swal from "sweetalert2";
import PremiumDatePicker from "../components/PremiumDatePicker";
import ValidationErrorModal from "../components/ValidationErrorModal";

  import Select from "react-select";
  import * as XLSX from "xlsx";
  import { saveAs } from "file-saver";
  import { authFetch, buildApiUrl } from "../lib/api";
  import useDesignationOptions from "../hooks/useDesignationOptions";

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

  export default function Physical() {
    const [showModal, setShowModal] = useState(false);
    const [uploadedBy, setUploadedBy] = useState("");
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [validationError, setValidationError] = useState(null);
  const [jobRoleSearch, setJobRoleSearch] = useState("");
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [viewEmployee, setViewEmployee] = useState(null);
  const [saving, setSaving] = useState(false);

  // Prevent background scroll while any modal is open
  useEffect(() => {
    const anyOpen = showUploadModal || validationError !== null;
    document.body.style.overflow = anyOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [showUploadModal, validationError]);

const handleView = (item) => {
  setViewEmployee(item);
};

const Field = ({ label, value }) => (
  <div className="rounded-lg bg-surface border border-border-color p-3">
    <div className="text-xs uppercase tracking-wide text-text-muted">
      {label}
    </div>

    <div className="mt-1 text-sm font-semibold text-text-primary">
      {value || "-"}
    </div>
  </div>
);

  const [showEmployeeModal, setShowEmployeeModal] = useState(false);


  const [isEditMode, setIsEditMode] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [employeeForm, setEmployeeForm] = useState({
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
  });

    const [data, setData] = useState([]);
    const [totalRecords, setTotalRecords] = useState(0);
    const [tableLoading, setTableLoading] = useState(true);
    const [jobRoles, setJobRoles] = useState([]);
    const [jobRoleAverage, setJobRoleAverage] = useState([]);
    const [circles, setCircles] = useState([]);
    const [circleLastUpdated, setCircleLastUpdated] = useState([]);
    const [employmentStatus, setEmploymentStatus] = useState([]);
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

    const newJoiningEmployee =
      localStorage.getItem("newJoiningEmployee");

    if (newJoiningEmployee) {
      const parsedEmployee =
        JSON.parse(newJoiningEmployee);

      setEmployeeForm((prev) => ({
        ...prev,
        circle: parsedEmployee.circle || "",
        cmp: parsedEmployee.cmp || "",
        employee_code:
          parsedEmployee.employee_code || "",
        employee_name:
          parsedEmployee.employee_name || "",
        aadhaar_no:
          parsedEmployee.aadhaar_no || "",
        nth_salary:
          parsedEmployee.nth_salary || "",
        job_role:
          parsedEmployee.designation || "",
      }));

      setShowEmployeeModal(true);
    }
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

        </div>
    `
});

     setShowUploadModal(false);

setReportFile(null);
setReportDate("");
setUploadedBy("");

loadPhysicalData();
loadJobRoles();
loadCircles();
loadCircleLastUpdated();
loadEmploymentStatus();

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

      // Only remove the source New Joining record once the Physical save has
      // actually succeeded — deleting it unconditionally (even on a failed
      // save) would silently lose the employee from both tables.
      const newJoiningEmployee =
    localStorage.getItem(
      "newJoiningEmployee"
    );

  if (newJoiningEmployee) {

    const parsedEmployee =
      JSON.parse(newJoiningEmployee);

    await authFetch(
      buildApiUrl(
        `/api/new-joining/delete/${parsedEmployee.id}`
      ),
      {
        method: "DELETE",
      }
    );

    localStorage.removeItem(
      "newJoiningEmployee"
    );

  }

    alert(
  employeeForm.id
    ? "Employee Updated Successfully"
    : "Employee Added Successfully"
);

await loadPhysicalData();

setShowEmployeeModal(false);

setIsEditMode(false);
setEditingId(null);

setEmployeeForm({
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
      });

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

  const circleOptions = [
  "Delhi",
  "Haryana",
  "Punjab",
  "UP East",
];

const circleCmpMap = {
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
    "Raibareilly",
    "Varanasi",
    "Mohali"
  ],
};

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

const circleFilterOptions = [
  { value: "", label: "Select Circles" },

  ...[...new Set(data.map(item => item.circle))]
    .filter(Boolean)
    .map(circle => ({
      value: circle,
      label: circle
    }))
];  

const cmpFilterOptions = [
  { value: "", label: "Select CMP" },

  ...[...new Set(
    data
      .filter(
        item =>
          !circleFilter ||
          item.circle === circleFilter
      )
      .map(item => item.cmp)
  )]
    .filter(Boolean)
    .map(cmp => ({
      value: cmp,
      label: cmp
    }))
];

const jobRoleFilterOptions = [
  { value: "", label: "Select Job Roles" },

  ...[
    ...new Set(
      [
        ...data.map(item => item.job_role),
        ...jobRoles.map(item => item.role_group),
      ]
    )
  ]
    .filter(Boolean)
    .sort()
    .map(role => ({
      value: role,
      label: role
    }))
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

const activeCount =
  employmentStatus.find(
    item => item.employment_status === "active"
  )?.total || 0;

const inactiveCount =
  employmentStatus.find(
    item => item.employment_status === "inactive"
  )?.total || 0;

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
    onClick={() => setShowEmployeeModal(true)}
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
        {jobRoles.reduce((sum, item) => sum + item.total, 0)}
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

        {circles.map((item, index) => (

          <div
            key={index}
            className="flex items-center justify-between rounded-lg border border-border-color bg-gradient-to-r from-surface-muted to-white px-2 py-1 hover:shadow-md transition-all"
          >

            <span className="text-[13px] font-semibold text-text-secondary">
              {item.circle}
            </span>

            <span className="text-[13px] font-semibold text-emerald-600 dark:text-emerald-400">
              {item.total}
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

  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
   <div
  className="
    w-full
    max-w-7xl
    max-h-[90vh]
    overflow-y-auto
    rounded-2xl
    bg-surface
    shadow-2xl
    custom-scrollbar
  "
>

  {/* Header */}
  <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-surface px-6 py-3">
    <div>
  <h2 className="text-xl font-bold text-text-primary">
    {viewEmployee.employee_name}
  </h2>

  <p className="text-sm text-text-muted">
    {viewEmployee.employee_code} • {viewEmployee.job_role}
  </p>
</div>

    <button
      onClick={() => setViewEmployee(null)}
      className="h-10 w-10 rounded-full bg-surface-muted text-xl hover:bg-red-100 hover:dark:bg-red-500/15"
    >
      ×
    </button>
  </div>

  <div className="space-y-2 p-4">

{/* Top Quick Info Row 
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">

  <div className="rounded-xl bg-blue-50 dark:bg-blue-500/10 px-4 py-2">
    <div className="text-xs text-text-muted">
      Employee Code
    </div>
    <div className="text-md font-bold text-blue-700 dark:text-blue-400">
      {viewEmployee.employee_code || "-"}
    </div>
  </div>

  <div className="rounded-xl bg-green-50 dark:bg-green-500/10 px-4 py-2">
    <div className="text-xs text-text-muted">
      Employment Status
    </div>
    <div className="text-md font-bold text-green-700 dark:text-green-400">
      {viewEmployee.employment_status || "-"}
    </div>
  </div>

  <div className="rounded-xl bg-violet-50 dark:bg-violet-500/10 px-4 py-2">
    <div className="text-xs text-text-muted">
      Mobile Number
    </div>
    <div className="text-md font-bold text-violet-700 dark:text-violet-400">
      {viewEmployee.mobile_number || "-"}
    </div>
  </div>


</div> */}

    {/* Organization Details */}
    <div className="rounded-xl border border-violet-100 dark:border-violet-500/20 bg-violet-50 dark:bg-violet-500/10/30 px-4 py-2">
      <h3 className="mb-1 text-sm font-semibold text-violet-700 dark:text-violet-400">
        Organization Details
      </h3>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        <Field label="Circle" value={viewEmployee.circle} />
        <Field label="CMP" value={viewEmployee.cmp} />
        <Field label="PPRJ Status" value={viewEmployee.pprj_status} />
        <Field label="PPRJ Code" value={viewEmployee.pprj_code} />
        <Field label="Employee Code" value={viewEmployee.employee_code} />
        <Field label="Employee Name" value={viewEmployee.employee_name} />
        <Field
          label="Uploaded At"
          value={formatUploadedAt(viewEmployee.uploaded_at)}
        />
      </div>
    </div>

    {/* Personal & Role Information */}
    <div className="rounded-xl border border-blue-100 dark:border-blue-500/20 bg-blue-50 dark:bg-blue-500/10/30 px-4 py-2">
      <h3 className="mb-1 text-sm font-semibold text-blue-700 dark:text-blue-400">
        Personal & Role Information
      </h3>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
        <Field label="Father Name" value={viewEmployee.father_name} />
        <Field label="Function Name" value={viewEmployee.function_name} />
        <Field label="Job Role" value={viewEmployee.job_role} />
        <Field
          label="Manpower Signoff Scope"
          value={viewEmployee.manpower_signoff_scope}
        />
        <Field
          label="Scrum Job Role"
          value={viewEmployee.scrum_job_role}
        />
        <Field label="Mobile Number" value={viewEmployee.mobile_number} />
        <Field
           label="DOB"
           value={
           viewEmployee.dob
            ? new Date(viewEmployee.dob)
            .toLocaleDateString("en-GB")
          : "-"
        } 
     />
        <Field label="Age" value={viewEmployee.age} />
       <Field
  label="Date Of Joining"
  value={
    viewEmployee.date_of_joining
      ? new Date(viewEmployee.date_of_joining)
          .toLocaleDateString("en-GB")
      : "-"
  }
/>  
        <Field
          label="Employment Status"
          value={viewEmployee.employment_status}
        />
      </div>
    </div>

    {/* Work & Reporting Information */}
    <div className="rounded-xl border border-indigo-100 dark:border-indigo-500/20 bg-indigo-50 dark:bg-indigo-500/10/30 px-4 py-2">
      <h3 className="mb-1 text-sm font-semibold text-indigo-700 dark:text-indigo-400">
        Work & Reporting Information
      </h3>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        <Field
          label="Resigned Date"
          value={viewEmployee.resigned_date}
        />
        <Field
          label="Last Working Date"
          value={viewEmployee.last_working_date}
        />
        <Field label="RM Code" value={viewEmployee.rm_code} />
        <Field
          label="Reporting Manager"
          value={viewEmployee.reporting_manager}
        />
        <Field
          label="Company Email"
          value={viewEmployee.company_email_id}
        />
        <Field
          label="Laptop Status"
          value={viewEmployee.laptop_status}
        />
      </div>
    </div>

    {/* Additional Information */}
    <div className="rounded-xl border border-emerald-100 dark:border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/10/30 px-4 py-2">
      <h3 className="mb-1 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
        Additional Information
      </h3>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-7">
        <Field label="IFSC Code" value={viewEmployee.ifsc_code} />
        <Field
          label="Bank Account No"
          value={viewEmployee.bank_account_no}
        />
        <Field label="PAN No" value={viewEmployee.pan_no} />
        <Field label="Aadhaar No" value={viewEmployee.aadhaar_no} />
        <Field label="UAN No" value={viewEmployee.uan_no} />
        <Field label="ESIC IP No" value={viewEmployee.esic_ip_no} />
        <Field label="PF No" value={viewEmployee.pf_no} />
        <Field label="GTLI" value={viewEmployee.gtli} />
        <Field label="NTH Salary" value={viewEmployee.nth_salary} />
      </div>

      <div className="mt-2">
        <div className="mb-1 text-xs font-semibold text-text-muted">
          Remarks
        </div>

        <div className="rounded-xl bg-surface p-4 border">
          {viewEmployee.remarks || "-"}
        </div>
      </div>
    </div>

  </div>
</div>
```

  </div>
)}


  {showEmployeeModal && (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">

      <div
  className="
    w-full
    max-w-7xl
    rounded-[18px]
    bg-surface
    px-4
    py-4
    shadow-2xl
    max-h-[95vh]
    overflow-y-auto
    custom-scrollbar
  "
>

        <div className="mb-2 flex items-start justify-between border-b border-border-color pb-2">

       <div className="flex items-start gap-4">

  <div className="
    flex h-12 w-12 items-center justify-center
    rounded-xl
    bg-gradient-to-br
    from-indigo-100
    to-violet-100
  ">
    <UserPlus className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
  </div>

  <div>

    <h2 className="text-lg font-semibold tracking-tight text-text-primary">
      Add Employee
    </h2>

    <p className=" text-sm text-text-muted">
      Manually add employee details to the system
    </p>

  </div>

</div>

 <button
    onClick={() => setShowEmployeeModal(false)}
    className="h-10 w-10 rounded-full bg-surface-muted text-xl text-text-secondary hover:bg-red-100 hover:dark:bg-red-500/15 hover:text-red-600 hover:dark:text-red-400"
  >
            ×
   </button>

        </div>

     <div className="space-y-2">

  {/* Organization Details */}
  <div className="rounded-xl border border-violet-100 dark:border-violet-500/20 bg-gradient-to-br from-violet-50/60 to-white p-3">

    <h3 className="mb-2 text-sm font-semibold text-violet-700 dark:text-violet-400">
      Organization Details
    </h3>

    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">

      <div>
        <label className="mb-1 block text-xs px-1 font-semibold text-text-secondary">
          Circle *
        </label>

        <select
  name="circle"
  value={employeeForm.circle}
  onChange={handleEmployeeChange}
  className="w-full rounded-lg border border-border-color bg-surface px-4 py-2 text-xs"
>
  <option value="">Select Circle</option>

  {circleOptions.map((circle) => (
    <option key={circle} value={circle}>
      {circle}
    </option>
  ))}
</select>
      </div>

      <div>
        <label className="mb-1 block text-xs px-1 font-semibold text-text-secondary">
          CMP *
        </label>

  <select
  name="cmp"
  value={employeeForm.cmp}
  onChange={handleEmployeeChange}
  disabled={!employeeForm.circle}
  className="w-full rounded-lg border border-border-color bg-surface px-4 py-2 text-xs outline-none focus:border-violet-500 disabled:bg-surface-muted disabled:cursor-not-allowed"
>
  {!employeeForm.circle ? (
    <option value="">First Select Circle</option>
  ) : (
    <>
      <option value="">Select CMP</option>

      {(circleCmpMap[employeeForm.circle] || []).map((cmp) => (
        <option key={cmp} value={cmp}>
          {cmp}
        </option>
      ))}
    </>
  )}
</select>
      </div>

      <div>
        <label className="mb-1 block text-xs px-1 font-semibold text-text-secondary">
          PPRJ Status
        </label>

  <Select
  styles={selectStyles}
  options={pprjStatusOptions}
  placeholder="Select PPRJ Status"
  value={
    pprjStatusOptions.find(
      item => item.value === employeeForm.pprj_status
    ) || null
  }
  onChange={(selected) =>
    setEmployeeForm({
      ...employeeForm,
      pprj_status: selected?.value || "",
    })
  }
/>
      </div>

      <div>
        <label className="mb-1 block text-xs px-1 font-semibold text-text-secondary">
          PPRJ Code
        </label>

        <input
          type="text"
          name="pprj_code"
          value={employeeForm.pprj_code}
          onChange={handleEmployeeChange}
          placeholder="Enter PPRJ Code"
          className="w-full rounded-lg border border-border-color bg-surface px-4 py-2 text-xs outline-none focus:border-violet-500"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs px-1 font-semibold text-text-secondary">
          Employee Code
        </label>

        <input
          type="text"
          name="employee_code"
          value={employeeForm.employee_code}
          onChange={handleEmployeeChange}
          placeholder="Enter Employee Code"
          className="w-full rounded-lg border border-border-color bg-surface px-4 py-2 text-xs outline-none focus:border-violet-500"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs px-1 font-semibold text-text-secondary">
          Employee Name *
        </label>

        <input
          type="text"
          name="employee_name"
          value={employeeForm.employee_name}
          onChange={handleEmployeeChange}
          placeholder="Enter Employee Name"
          className="w-full rounded-lg border border-border-color bg-surface px-4 py-2 text-xs outline-none focus:border-violet-500"
        />
      </div>

    </div>

  </div>

 {/* Personal & Role Information */}

<div className="rounded-xl border border-blue-100 dark:border-blue-500/20 bg-gradient-to-br from-blue-50/60 to-white p-3">

  <h3 className="mb-2 text-sm font-semibold text-blue-700 dark:text-blue-400">
    Personal & Role Information
  </h3>

  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">

    {/* Father Name */}
    <div>
      <label className="mb-1 block text-xs px-1 font-semibold text-text-secondary">
        Father Name
      </label>

      <input
        type="text"
        name="father_name"
        value={employeeForm.father_name}
        onChange={handleEmployeeChange}
        placeholder="Enter Father Name"
        className="w-full rounded-lg border border-border-color bg-surface px-4 py-2 text-xs outline-none focus:border-violet-500"
      />
    </div>

    {/* Function Name */}
    <div>
      <label className="mb-1 block text-xs px-1 font-semibold text-text-secondary">
        Function Name
      </label>

      <input
        type="text"
        name="function_name"
        value={employeeForm.function_name}
        onChange={handleEmployeeChange}
        placeholder="Enter Function Name"
        className="w-full rounded-lg border border-border-color bg-surface px-4 py-2 text-xs outline-none focus:border-violet-500"
      />
    </div>

    {/* Job Role Actual CMP Verify */}
    {/* <div>
      <label className="mb-1 block text-xs px-1 font-semibold text-text-secondary">
        Job Role Actual Cmp Verify
      </label>

   <Select
  styles={selectStyles}
  options={jobRoleOptions}
  placeholder="Select Job Role"
  isSearchable={true}
  menuPlacement="auto"
  menuPosition="fixed"
  openMenuOnClick={true}
  openMenuOnFocus={true}
  blurInputOnSelect={false}
  noOptionsMessage={() => "No Role Found"}
 value={
  jobRoleOptions.find(
    item => item.value === employeeForm.job_role_actual_cmp_verify
  ) || null
}

onChange={(selected) =>
  setEmployeeForm({
    ...employeeForm,
    job_role_actual_cmp_verify: selected?.value || ""
  })
}
/>
    </div>
    */}

    {/* Job Role */}
    <div>
      <label className="mb-1 block text-xs px-1 font-semibold text-text-secondary">
        Job Role
      </label>

   <Select
  styles={selectStyles}
  options={jobRoleOptions}
  placeholder="Select Job Role"
  isSearchable={true}
  menuPlacement="auto"
  menuPosition="fixed"
  openMenuOnClick={true}
  openMenuOnFocus={true}
  blurInputOnSelect={false}
  noOptionsMessage={() => "No Role Found"}
  value={
  jobRoleOptions.find(
    item =>
      item.value?.trim().toLowerCase() ===
      String(employeeForm.job_role || "")
        .trim()
        .toLowerCase()
  ) || null
}
  onChange={(selected) =>
    setEmployeeForm({
      ...employeeForm,
      job_role: selected?.value || ""
    })
  }
/>
    </div>

    {/* Signoff Scope */}
    <div>
      <label className="mb-1 block text-xs px-1 font-semibold text-text-secondary">
        Manpower Signoff Scope
      </label>

      <Select
  styles={selectStyles}
  options={signoffOptions}
  placeholder="Select Scope"
  value={
    signoffOptions.find(
      item => item.value === employeeForm.manpower_signoff_scope
    ) || null
  }
  onChange={(selected) =>
    setEmployeeForm({
      ...employeeForm,
      manpower_signoff_scope: selected?.value || "",
    })
  }
/>
</div>

    {/* Scrum Role */}
    <div>
      <label className="mb-1 block text-xs px-1 font-semibold text-text-secondary">
        Scrum Job Role
      </label>

  <Select
  styles={selectStyles}
  options={jobRoleOptions}
  placeholder="Select Job Role"
  isSearchable={true}
  menuPlacement="auto"
  menuPosition="fixed"
  openMenuOnClick={true}
  openMenuOnFocus={true}
  blurInputOnSelect={false}
  noOptionsMessage={() => "No Role Found"}
  value={
    jobRoleOptions.find(
      item => item.value === employeeForm.scrum_job_role
    ) || null
  }
  onChange={(selected) =>
    setEmployeeForm({
      ...employeeForm,
      scrum_job_role: selected?.value || ""
    })
  }
/>
    </div>

    {/* Cluster */}
  {/*   <div>
      <label className="mb-1 block text-xs px-1 font-semibold text-text-secondary">
        Cluster
      </label>

      <input
        type="text"
        name="cluster"
        value={employeeForm.cluster}
        onChange={handleEmployeeChange}
        placeholder="Enter Cluster"
        className="w-full rounded-lg border border-border-color bg-surface px-4 py-2 text-xs outline-none focus:border-violet-500"
      />
    </div>

    */}

    {/* Mobile Number */}
    <div>
      <label className="mb-1 block text-xs px-1 font-semibold text-text-secondary">
        Mobile Number
      </label>

      <input
        type="text"
        name="mobile_number"
        value={employeeForm.mobile_number}
        onChange={handleEmployeeChange}
        placeholder="Enter Mobile Number"
        className="w-full rounded-lg border border-border-color bg-surface px-4 py-2 text-xs outline-none focus:border-violet-500"
      />
    </div>

    {/* DOB */}
    <div>
      <label className="mb-1 block text-xs px-1 font-semibold text-text-secondary">
        Dob
      </label>

      <input
        type="date"
        name="dob"
        value={employeeForm.dob}
        onChange={handleEmployeeChange}
        className="w-full rounded-lg border border-border-color bg-surface px-4 py-2 text-xs outline-none focus:border-violet-500"
      />
    </div>

    {/* Age */}
    <div>
      <label className="mb-1 block text-xs px-1 font-semibold text-text-secondary">
        Age
      </label>

      <input
        type="text"
        name="age"
        value={employeeForm.age}
        onChange={handleEmployeeChange}
        placeholder="Enter Age"
        className="w-full rounded-lg border border-border-color bg-surface px-4 py-2 text-xs outline-none focus:border-violet-500"
      />
    </div>

    {/* Date Of Joining */}
    <div>
      <label className="mb-1 block text-xs px-1 font-semibold text-text-secondary">
        Date Of Joining
      </label>

      <input
        type="date"
        name="date_of_joining"
        value={employeeForm.date_of_joining}
        onChange={handleEmployeeChange}
        className="w-full rounded-lg border border-border-color bg-surface px-4 py-2 text-xs outline-none focus:border-violet-500"
      />
    </div>

    {/* Employment Status */}
    <div>
      <label className="mb-1 block text-xs px-1 font-semibold text-text-secondary">
        Employment Status
      </label>

   <Select
  styles={selectStyles}
  options={employmentStatusOptions}
  placeholder="Select Status"
  value={
    employmentStatusOptions.find(
      item => item.value === employeeForm.employment_status
    ) || null
  }
  onChange={(selected) =>
    setEmployeeForm({
      ...employeeForm,
      employment_status: selected?.value || "",
    })
  }
/>
    </div>

  </div>

</div>

{/* Work & Reporting Information */}

<div className="rounded-2xl border border-indigo-100 dark:border-indigo-500/20 bg-gradient-to-br from-indigo-50/60 to-white p-3">

  <h3 className="mb-2 text-sm font-semibold text-indigo-700 dark:text-indigo-400">
    Work & Reporting Information
  </h3>

  <div className="grid grid-cols-1 gap-2 md:grid-cols-5 xl:grid-cols-6">

    {/* Resigned Date */}
    <div>
      <label className="mb-1 block text-xs px-1 font-semibold text-text-secondary">
        Resigned Date
      </label>

      <input
        type="date"
        name="resigned_date"
        value={employeeForm.resigned_date}
        onChange={handleEmployeeChange}
        className="w-full rounded-lg border border-border-color bg-surface px-4 py-2 text-xs outline-none focus:border-violet-500"
      />
    </div>

    {/* Last Working Date */}
    <div>
      <label className="mb-1 block text-xs px-1 font-semibold text-text-secondary">
        Last Working Date
      </label>

      <input
        type="date"
        name="last_working_date"
        value={employeeForm.last_working_date}
        onChange={handleEmployeeChange}
        className="w-full rounded-lg border border-border-color bg-surface px-4 py-2 text-xs outline-none focus:border-violet-500"
      />
    </div>

    {/* RM Code */}
    <div>
      <label className="mb-1 block text-xs px-1 font-semibold text-text-secondary">
        RM Code
      </label>

      <input
        type="text"
        name="rm_code"
        value={employeeForm.rm_code}
        onChange={handleEmployeeChange}
        placeholder="Enter RM Code"
        className="w-full rounded-lg border border-border-color bg-surface px-4 py-2 text-xs outline-none focus:border-violet-500"
      />
    </div>

    {/* Reporting Manager */}
    <div>
      <label className="mb-1 block text-xs px-1 font-semibold text-text-secondary">
        Reporting Manager
      </label>

      <input
        type="text"
        name="reporting_manager"
        value={employeeForm.reporting_manager}
        onChange={handleEmployeeChange}
        placeholder="Enter Reporting Manager"
        className="w-full rounded-lg border border-border-color bg-surface px-4 py-2 text-xs outline-none focus:border-violet-500"
      />
    </div>

    {/* Company Email */}
    <div>
      <label className="mb-1 block text-xs px-1 font-semibold text-text-secondary">
        Company Email Id
      </label>

      <input
        type="email"
        name="company_email_id"
        value={employeeForm.company_email_id}
        onChange={handleEmployeeChange}
        placeholder="Enter Email Id"
        className="w-full rounded-lg border border-border-color bg-surface px-4 py-2 text-xs outline-none focus:border-violet-500"
      />
    </div>

    {/* Laptop Status */}
    <div>
      <label className="mb-1 block text-xs px-1 font-semibold text-text-secondary">
        Laptop Status
      </label>

   <Select
  styles={selectStyles}
  options={laptopStatusOptions}
  placeholder="Select Laptop Status"
  value={
    laptopStatusOptions.find(
      item => item.value === employeeForm.laptop_status
    ) || null
  }
  onChange={(selected) =>
    setEmployeeForm({
      ...employeeForm,
      laptop_status: selected?.value || "",
    })
  }
/>
    </div>

  </div>

</div>



{/* Additional Information */}

<div className="rounded-2xl border border-emerald-100 dark:border-emerald-500/20 bg-gradient-to-br from-emerald-50/60 to-white p-3">

  <h3 className="mb-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
    Additional Information
  </h3>

  <div className="grid grid-cols-1 gap-2 md:grid-cols-5 xl:grid-cols-7">

    {/* IFSC Code */}
    <div>
      <label className="mb-1 block text-xs px-1 font-semibold text-text-secondary">
        IFSC Code
      </label>

      <input
        type="text"
        name="ifsc_code"
        value={employeeForm.ifsc_code}
        onChange={handleEmployeeChange}
        placeholder="Enter IFSC Code"
        className="w-full rounded-lg border border-border-color bg-surface px-4 py-2 text-xs outline-none focus:border-violet-500"
      />
    </div>

    {/* Bank Account No */}
    <div>
      <label className="mb-1 block text-xs px-1 font-semibold text-text-secondary">
        Bank Account No
      </label>

      <input
        type="text"
        name="bank_account_no"
        value={employeeForm.bank_account_no}
        onChange={handleEmployeeChange}
        placeholder="Enter Bank Account No"
        className="w-full rounded-lg border border-border-color bg-surface px-4 py-2 text-xs outline-none focus:border-violet-500"
      />
    </div>

    {/* PAN No */}
    <div>
      <label className="mb-1 block text-xs px-1 font-semibold text-text-secondary">
        PAN No
      </label>

      <input
        type="text"
        name="pan_no"
        value={employeeForm.pan_no}
        onChange={handleEmployeeChange}
        placeholder="Enter PAN No"
        className="w-full rounded-lg border border-border-color bg-surface px-4 py-2 text-xs outline-none focus:border-violet-500"
      />
    </div>

    {/* Aadhaar No */}
    <div>
      <label className="mb-1 block text-xs px-1 font-semibold text-text-secondary">
        Aadhaar No
      </label>

      <input
        type="text"
        name="aadhaar_no"
        value={employeeForm.aadhaar_no}
        onChange={handleEmployeeChange}
        placeholder="Enter Aadhaar No"
        className="w-full rounded-lg border border-border-color bg-surface px-4 py-2 text-xs outline-none focus:border-violet-500"
      />
    </div>

    {/* UAN No */}
    <div>
      <label className="mb-1 block text-xs px-1 font-semibold text-text-secondary">
        UAN No
      </label>

      <input
        type="text"
        name="uan_no"
        value={employeeForm.uan_no}
        onChange={handleEmployeeChange}
        placeholder="Enter UAN No"
        className="w-full rounded-lg border border-border-color bg-surface px-4 py-2 text-xs outline-none focus:border-violet-500"
      />
    </div>

<div>
  <label className="mb-1 block text-xs px-1 font-semibold text-text-secondary">
    PF No
  </label>

  <input
    type="text"
    name="pf_no"
    value={employeeForm.pf_no}
    onChange={handleEmployeeChange}
    placeholder="Enter PF No"
    className="w-full rounded-lg border border-border-color bg-surface px-4 py-2 text-xs outline-none focus:border-violet-500"
  />
</div>

<div>
  <label className="mb-1 block text-xs px-1 font-semibold text-text-secondary">
    GTLI
  </label>

 <Select
  styles={selectStyles}
  options={gtliOptions}
  placeholder="Select GTLI"
  value={
    gtliOptions.find(
      item => item.value === employeeForm.gtli
    ) || null
  }
  onChange={(selected) =>
    setEmployeeForm({
      ...employeeForm,
      gtli: selected?.value || "",
    })
  }
/>
</div>

    {/* ESIC IP No */}
    <div>
      <label className="mb-1 block text-xs px-1 font-semibold text-text-secondary">
        ESIC IP No
      </label>

      <input
        type="text"
        name="esic_ip_no"
        value={employeeForm.esic_ip_no}
        onChange={handleEmployeeChange}
        placeholder="Enter ESIC IP No"
        className="w-full rounded-lg border border-border-color bg-surface px-4 py-2 text-xs outline-none focus:border-violet-500"
      />
    </div>

{/* NTH Salary Amount */}
  <div>
  <label className="mb-1 block text-xs px-1 font-semibold text-text-secondary">
    NTH Salary Amount
  </label>

  <input
    type="number"
    name="nth_salary"
    value={employeeForm.nth_salary}
    onChange={handleEmployeeChange}
    placeholder="Enter Salary Amount"
    className="w-full rounded-lg border border-border-color bg-surface px-4 py-2 text-xs outline-none focus:border-violet-500"
  />
</div>

  </div>

  {/* Remarks */}
  <div className="mt-4">

    <label className="mb-1 block text-xs px-1 font-semibold text-text-secondary">
      Remarks
    </label>

    <textarea
      rows={4}
      name="remarks"
      value={employeeForm.remarks}
      onChange={handleEmployeeChange}
      placeholder="Enter any additional remarks here..."
      className="w-full rounded-lg border border-border-color bg-surface px-4 py-2 text-xs outline-none focus:border-violet-500"
    />

  </div>

</div>

</div>


   <div className="mt-6 flex items-center justify-between rounded-2xl bg-violet-50 dark:bg-violet-500/10 px-5 py-4">

  <div>
    <p className="text-sm font-semibold text-violet-700 dark:text-violet-400">
      Please ensure all the information is accurate before saving.
    </p>

    <p className="text-xs text-text-muted mt-1">
      Fields marked with * are mandatory.
    </p>
  </div>

  <div className="flex items-center gap-3">

    <button
      onClick={() => setShowEmployeeModal(false)}
      className="rounded-xl border border-border-color bg-surface px-5 py-2.5 text-sm font-semibold text-text-secondary"
    >
      Cancel
    </button>

   <button
  onClick={handleAddEmployee}
  disabled={saving}
  className="rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg hover:opacity-90 disabled:opacity-50"
>
  {saving
    ? "Saving..."
    : isEditMode
    ? "Update Employee"
    : "Save Employee"}
</button>

  </div>

</div>

      </div>

    </div>
  )}
          
          </div>
        </div>
      </div>
    );
  }
