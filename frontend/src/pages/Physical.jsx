  import React, { useEffect, useMemo, useState } from "react";
  import { UserPlus } from "lucide-react";
  import Select from "react-select";
  import * as XLSX from "xlsx";
  import { saveAs } from "file-saver";
  import { buildApiUrl } from "../lib/api";

  export default function Physical() {
    const [showModal, setShowModal] = useState(false);
    const [uploadedBy, setUploadedBy] = useState("");
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [jobRoleSearch, setJobRoleSearch] = useState("");

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
    job_role_actual_cmp_verify: "",
    job_role: "",
    manpower_signoff_scope: "",
    scrum_job_role: "",
    cluster: "",
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
    remarks: "",
  });

    const [data, setData] = useState([]);
    const [tableLoading, setTableLoading] = useState(true);
    const [jobRoles, setJobRoles] = useState([]);
    const [jobRoleAverage, setJobRoleAverage] = useState([]);
    const [circles, setCircles] = useState([]);
    const [employmentStatus, setEmploymentStatus] = useState([]);
    const [selectedRows, setSelectedRows] = useState([]);
    const [reportFile, setReportFile] = useState(null);
    const [deletingId, setDeletingId] = useState(null);
    const [downloadingId, setDownloadingId] = useState(null);
  

  const [reportDate, setReportDate] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState("");

  const [circleFilter, setCircleFilter] = useState("");

  const [cmpFilter, setCmpFilter] = useState("");

    const loadPhysicalData = async () => {
      try {
        setTableLoading(true);
    
        const response = await fetch(
    buildApiUrl("/api/physical")
  );

          const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(result.message || "Failed to load physical data");
        }

      const formattedData = (result.data || []).map((item, index) => ({
    ...item,
    srNo: index + 1,
  }));

  setData(formattedData);
      } catch (error) {
        console.error(error);
      }
      finally {

    setTableLoading(false);

  }
    };

    const loadJobRoles = async () => {

    try {

      const response = await fetch(
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

      const response = await fetch(
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

      const response = await fetch(
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

  const loadEmploymentStatus = async () => {

    try {

      const response = await fetch(
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

    // FAST TABLE LOAD
    loadPhysicalData();

    // LOAD OTHER DATA IN BACKGROUND
    setTimeout(() => {
      loadJobRoles();
      loadJobRoleAverage();
      loadCircles();
      loadEmploymentStatus();

      const newJoiningEmployee =
    localStorage.getItem(
      "newJoiningEmployee"
    );

  if (newJoiningEmployee) {

    const parsedEmployee =
      JSON.parse(newJoiningEmployee);

    setEmployeeForm((prev) => ({
      ...prev,

      circle:
        parsedEmployee.circle || "",

      cmp:
        parsedEmployee.cmp || "",

      employee_code:
        parsedEmployee.employee_code || "",

      employee_name:
        parsedEmployee.employee_name || "",

      aadhaar_no:
        parsedEmployee.aadhaar_no || "",

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

      const response = await fetch(
        buildApiUrl("/api/physical/upload-report"),
        {
          method: "POST",
          body: formData,
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        alert(result.message);
        return;
      }

      alert("Report Uploaded Successfully");

      await loadPhysicalData();

      await loadJobRoles();

      await loadCircles();

      await loadEmploymentStatus();

      setReportFile(null);

      setReportDate("");

      setUploadedBy("");
  setShowUploadModal(false);

  } catch (error) {

      console.log(error);

      alert("Upload Failed");
    }
    finally {

    setUploading(false);

  }
  };

  // PAGINATION

  const filteredData = useMemo(() => {

    return data.filter((item) => {

  const matchesSearch =

    !search ||

    Object.values(item).some((value) =>
      String(value || "")
        .toLowerCase()
        .includes(search.toLowerCase())
    );

  const matchesCircle =

    !circleFilter ||
    item.circle === circleFilter;

  const matchesCmp =

    !cmpFilter ||
    item.cmp === cmpFilter;
      return (
        matchesSearch &&
        matchesCircle &&
        matchesCmp
      );

    });

  }, [data, search, circleFilter, cmpFilter]);


  const totalPages = useMemo(() => {

  return Math.max(
    1,
    Math.ceil(filteredData.length / pageSize)
  );

  }, [filteredData, pageSize]);

  const paginatedData = useMemo(() => {
    return filteredData.slice(
      (currentPage - 1) * pageSize,
      currentPage * pageSize
    );
  }, [filteredData, currentPage, pageSize]);

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
      const response = await fetch(
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

      for (const id of selectedRows) {

        await fetch(
          buildApiUrl(`/api/physical/delete-employee/${id}`),
          {
            method: "DELETE",
          }
        );

      }

      alert("Selected records deleted successfully");

      setSelectedRows([]);

      loadPhysicalData();

    } catch (error) {

      console.log(error);

      alert("Bulk delete failed");

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

    const response = await fetch(
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

      setEmployeeForm((prev) => ({

        ...prev,

        circle: result.data.circle || "",
        cmp: result.data.cmp || "",
        pprj_status: result.data.pprj_status || "",
        pprj_code: result.data.pprj_code || "",
        employee_code: result.data.employee_code || "",
        employee_name: result.data.employee_name || "",
        father_name: result.data.father_name || "",
        function_name: result.data.function_name || "",
        job_role_actual_cmp_verify:
          result.data.job_role_actual_cmp_verify || "",
        job_role: result.data.job_role || "",
        manpower_signoff_scope:
          result.data.manpower_signoff_scope || "",
        scrum_job_role:
          result.data.scrum_job_role || "",
        cluster: result.data.cluster || "",
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
  };

  const handleAddEmployee = async () => {
    try {
      if (
    !employeeForm.circle ||
    !employeeForm.cmp
  ) {

    alert(
      "Circle and CMP are required"
    );

    return;

  }
  const apiUrl = employeeForm.id
    ? `/api/physical/update-employee/${employeeForm.id}`
    : "/api/physical/add-employee";

  const method = employeeForm.id
    ? "PUT"
    : "POST";

  const response = await fetch(
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

      const newJoiningEmployee =
    localStorage.getItem(
      "newJoiningEmployee"
    );

  if (newJoiningEmployee) {

    const parsedEmployee =
      JSON.parse(newJoiningEmployee);

    await fetch(
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

      if (!response.ok || !result.success) {
        alert(result.message || "Failed");
        return;
      }

    alert(
    employeeForm.id
      ? "Employee Updated Successfully"
      : "Employee Added Successfully"
  );

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
        job_role_actual_cmp_verify: "",
        job_role: "",
        manpower_signoff_scope: "",
        scrum_job_role: "",
        cluster: "",
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
        remarks: "",
      });

      loadPhysicalData();

    } catch (error) {
      console.log(error);
      alert("Failed");
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

  const response = await fetch(

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

  const handleExportExcel = () => {

    const exportData = filteredData.map((item) => ({
      Circle: item.circle,
      CMP: item.cmp,
      "PPRJ Status": item.pprj_status,
      "PPRJ Code": item.pprj_code,
      "Employee Code": item.employee_code,
      "Employee Name": item.employee_name,
      "Father Name": item.father_name,
      Function: item.function_name,
      "Job Role Actual CMP Verify":
        item.job_role_actual_cmp_verify,
      "Job Role": item.job_role,
      "Manpower SignOff Scope":
        item.manpower_signoff_scope,
      "Scrum Job Role": item.scrum_job_role,
      Cluster: item.cluster,
      "Mobile Number": item.mobile_number,
      DOB: item.dob,
      Age: item.age,
      "Date Of Joining": item.date_of_joining,
      "Employment Status": item.employment_status,
      "Resigned Date": item.resigned_date,
      "Last Working Date": item.last_working_date,
      "RM Code": item.rm_code,
      "Reporting Manager": item.reporting_manager,
      "Company Email": item.company_email_id,
      "Laptop Status": item.laptop_status,
      "IFSC Code": item.ifsc_code,
      "Bank Account No": item.bank_account_no,
      "PAN No": item.pan_no,
      "AADHAAR No": item.aadhaar_no,
      "UAN No": item.uan_no,
      "ESIC IP No": item.esic_ip_no,
      Remarks: item.remarks,
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

    const excelBuffer = XLSX.write(
      workbook,
      {
        bookType: "xlsx",
        type: "array",
      }
    );

    const fileData = new Blob(
      [excelBuffer],
      {
        type:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8",
      }
    );

    saveAs(
      fileData,
      `Physical_Data_${new Date().getTime()}.xlsx`
    );

  };

  const handleDownload = async (item) => {
    setDownloadingId(item.id);

    try {
      const response = await fetch(
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
  ],
};

const jobRoleOptions = [
  "Admin Head",
  "Analyst - Fiber",
  "Analyst - Fttx",
  "Analyst - Ipcolo",
  "Analyst - ISP",
  "Analyst - Material",
  "Analyst - Planning",
  "Analyst - Pmo",
  "Analyst - Power & Fuel",
  "Analyst - Utility",
  "Assistant Splicer",
  "CMP LEAD",
  "Commercial Executive",
  "Commercial Lead",
  "Energy Lead",
  "Estate Executive",
  "Fiber Sme",
  "Fibre Supervisor",
  "FRT Helper",
  "Fttx Assistant Splicer",
  "Fttx Engineer",
  "Fttx Helper",
  "Fttx Lead",
  "Fttx Splicer",
  "Fttx Supervisor",
  "Fttx Technician",
  "Hr Executive",
  "ISP Engineer",
  "Legal Executive",
  "MIS Executive",
  "Office Helper",
  "Omcr Lead",
  "Omcr Resources",
  "Other Roles - Temporary Technician",
  "Patroller",
  "Project Technician",
  "Rigger",
  "Route Guard",
  "Splicer",
  "State Fiber SME",
  "State HR Head",
  "State HSEF Officer",
  "State Isp Sme",
  "State Material Manager",
  "State Operation Head",
  "State Utility SME",
  "Technician",
  "Utility Helper",
  "Utility Supervisor",
  "Warehouse Helper",
  "Warehouse Incharge Cum Security"
].map(role => ({
  value: role,
  label: role
}));

const employmentStatusOptions = [
  { value: "Active", label: "Active" },
  { value: "Inactive", label: "Inactive" },
];

const laptopStatusOptions = [
  { value: "Company", label: "Company" },
  { value: "Own", label: "Own" },
  { value: "Not Required", label: "Not Required" },
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
  control: (provided) => ({
    ...provided,
    minHeight: "32px",
    height: "32px",
    borderRadius: "8px",
    borderColor: "#e2e8f0",
    boxShadow: "none",
    fontSize: "12px",
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
  }),

  menuList: (provided) => ({
    ...provided,
    maxHeight: "250px",
    paddingTop: 0,
  }),

  input: (provided) => ({
    ...provided,
    fontSize: "12px",
  }),

  option: (provided, state) => ({
    ...provided,
    fontSize: "13px",
    cursor: "pointer",
  }),
};

const CustomMenuList = (props) => {
  return (
    <div>
      <div className="p-2 border-b bg-white sticky top-0 z-10">
        <input
          type="text"
          placeholder="Search Job Role..."
          value={jobRoleSearch}
          onChange={(e) => setJobRoleSearch(e.target.value)}
          className="w-full rounded border px-3 py-2 text-xs outline-none"
        />
      </div>

      <div>
        {props.children}
      </div>
    </div>
  );
};

    return (
      <div className="min-h-screen">
        <div className="relative min-h-screen overflow-hidden">

          <div className="relative">
            {/* Header */}
            <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4">
              <div>
                <h1 className="text-lg font-semibold tracking-tight text-slate-900">Manpower - Physical</h1>
                <div className=" text-sm text-slate-500">Enterprise employee registry with secure, premium UI.</div>
          
              </div>

  <div className="flex items-center gap-3">

    <button
      onClick={() => setShowEmployeeModal(true)}
      className="rounded-2xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-lg transition hover:bg-blue-700"
    >
     Add Employee
    </button>

    <button
      onClick={() => setShowUploadModal(true)}
      className="rounded-2xl bg-green-600 px-5 py-2 text-sm font-semibold text-white shadow-lg transition hover:bg-green-700"
    >
      Upload Report
    </button>

  </div>

            </div>

            <div className="mt-2 flex flex-wrap items-center gap-3">

    <input
      type="text"
      placeholder="Search Employee..."
      value={search}
      onChange={(e) =>
        setSearch(e.target.value)
      }
      className="rounded-xl border border-slate-200 px-4 py-2 text-sm outline-none focus:border-blue-500"
    />

    <select
      value={circleFilter}
      onChange={(e) =>
        setCircleFilter(e.target.value)
      }
      className="rounded-xl border border-slate-200 px-4 py-2 text-sm outline-none"
    >
      <option value="">Select Circle</option>

      {[...new Set(data.map((item) => item.circle))]
        .filter(Boolean)
        .map((circle, index) => (
          <option key={index} value={circle}>
            {circle}
          </option>
        ))}
    </select>

    <select
      value={cmpFilter}
      onChange={(e) =>
        setCmpFilter(e.target.value)
      }
      className="rounded-xl border border-slate-200 px-4 py-2 text-sm outline-none"
    >
      <option value="">Select CMP</option>

      {[...new Set(data.map((item) => item.cmp))]
        .filter(Boolean)
        .map((cmp, index) => (
          <option key={index} value={cmp}>
            {cmp}
          </option>
        ))}
    </select>

  <button
    onClick={handleExportExcel}
    className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
  >
    Export Excel
  </button>

  <button
    onClick={handleBulkDelete}
    disabled={selectedRows.length === 0}
    className={`rounded-xl px-4 py-2 text-sm font-semibold text-white transition ${
      selectedRows.length === 0
        ? "bg-red-300 cursor-not-allowed"
        : "bg-red-600 hover:bg-red-700"
    }`}
  >
    Delete Selected ({selectedRows.length})
  </button>

    <button
      onClick={() => {
        setSearch("");
        setCircleFilter("");
        setCmpFilter("");
      }}
      className="rounded-xl bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600"
    >
      Reset
    </button>

  </div>

    {/* Top KPI Row */}

  <div className="mx-auto mt-3 grid w-full max-w-7xl grid-cols-1 gap-2 lg:grid-cols-12">

    {/* Total Employees */}

  <div className="lg:col-span-2 rounded-[12px] border border-white/70 bg-white/100 px-4 py-2 backdrop-blur-xl">

      <div className="text-sm font-semibold text-slate-500">
        Total Employees
      </div>

      <div className=" text-xl font-semibold text-slate-900">
        {jobRoles.reduce((sum, item) => sum + item.total, 0)}
      </div>

      <div className=" text-xs text-emerald-600">
        Active Workforce
      </div>

    </div>
  

    {/* Employment Status */}

  <div className="lg:col-span-4 rounded-[12px] border border-white/100 bg-white/100 px-4 py-2 backdrop-blur-xl">

    <div className="mb-2 flex items-center justify-between">

      <h2 className="text-sm font-semibold text-slate-800">
        Employment Status
      </h2>

    </div>

    <div className="grid grid-cols-2 gap-3">

  <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-2 text-center">

    <div className="text-xs font-medium text-slate-500">
      Active
    </div>

  <div className="text-xl font-bold text-emerald-600">
{
  data.filter(
    item =>
      String(item.employment_status || "")
        .trim()
        .toLowerCase() === "active"
  ).length
}
</div>

  </div>

  <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-2 text-center">

    <div className="text-xs font-medium text-slate-500">
      Inactive
    </div>

<div className="text-xl font-bold text-red-600">
{
  data.filter(
    item =>
      String(item.employment_status || "")
        .trim()
        .toLowerCase() === "inactive"
  ).length
}
</div>

  </div>

</div>

  </div>


    {/* Circle Wise Count */}

  <div className="lg:col-span-6 rounded-[12px] border border-white/70 bg-white/100 px-4 py-2 backdrop-blur-xl">
      <div className="mb-2 flex items-center justify-between">

        <h2 className="text-sm font-semibold text-slate-800">
          Circle Wise Count
        </h2>

        <div className="text-xs text-slate-500">
          Workforce Distribution
        </div>

      </div>

      <div className="grid grid-cols-2 gap-1 md:grid-cols-4">

        {circles.map((item, index) => (

          <div
            key={index}
            className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-2"
          >

            <span className="text-sm font-semibold text-slate-700">
              {item.circle}
            </span>

            <span className="text-sm font-semibold text-emerald-600">
              {item.total}
            </span>

          </div>

        ))}

      </div>

    </div>



  </div>



  {/* Job Role Document Average 
  <div className="mx-auto mt-3 w-full max-w-7xl">

    <div className="rounded-[22px] border border-white/70 bg-white/100 px-4 py-3 backdrop-blur-xl">

      <div className="mb-2 flex items-center justify-between">

        <h2 className="text-md font-semibold text-slate-900">
          Job Role Document Average
        </h2>

        <div className="text-xs text-slate-500">
          Aadhaar + UAN + ESIC Average
        </div>

      </div>

      <div className="h-[220px] overflow-y-scroll pr-2 custom-scrollbar">

        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">

          {jobRoleAverage.map((item, index) => (

            <div
              key={index}
              className="rounded-2xl bg-slate-50 px-4 py-3"
            >

              <div className="flex items-center justify-between">

                <span className="text-sm font-semibold text-slate-800">
                  {item.role_group}
                </span>

                <span className="text-sm font-bold text-emerald-600">
                  {item.document_average}%
                </span>

              </div>

              <div className="mt-2 grid grid-cols-3 gap-2 text-center">

                <div className="rounded-xl bg-white py-2">
                  <div className="text-xs text-slate-500">
                    Aadhaar
                  </div>

                  <div className="text-sm font-semibold text-blue-600">
                    {item.aadhaar_count}
                  </div>
                </div>

                <div className="rounded-xl bg-white py-2">
                  <div className="text-xs text-slate-500">
                    UAN
                  </div>

                  <div className="text-sm font-semibold text-purple-600">
                    {item.uan_count}
                  </div>
                </div>

                <div className="rounded-xl bg-white py-2">
                  <div className="text-xs text-slate-500">
                    ESIC
                  </div>

                  <div className="text-sm font-semibold text-orange-600">
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

    <div className="rounded-[22px] border border-white/70 bg-white/100 px-4 py-2 backdrop-blur-xl">

      <div className="mb-2 flex items-center justify-between">

        <h2 className="text-sm font-semibold text-slate-900">
          Job Roles
        </h2>

        <div className="text-xs text-slate-500">
          Role Wise Count
        </div>

      </div>

    <div className="h-[110px] overflow-y-scroll pr-2 custom-scrollbar">

    <div className="grid grid-cols-2 gap-2 md:grid-cols-5 xl:grid-cols-9">

        {jobRoles.map((role, index) => (

          <div
            key={index}
            className="flex items-center justify-between rounded-2xl bg-slate-50 px-3 py-1"
          >

            <span className="text-[14px]  text-slate-700">
              {role.role_group}
            </span>

            <span className="text-[13px] font-medium text-blue-600">
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
            <div className="mx-auto mt-3 w-full max-w-7xl">
              <div className="relative overflow-hidden rounded-[22px] border border-white/70 bg-white/65 px-4 py-2 backdrop-blur-xl">
                <div className="absolute inset-0" />


                <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <h2 className="text-md font-semibold tracking-tight text-slate-900">Employee Records</h2>
                  <div className="text-sm text-slate-600/80">
                    Total: <span className="font-semibold text-slate-900">{filteredData.length}</span>
                  </div>
                </div>

  <div className="relative mt-2 overflow-x-auto overflow-y-auto custom-scrollbar">
  <div>
  <table className="w-max min-w-full border-separate border border-spacing-0">
  <thead className="sticky top-0 z-20 bg-gradient-to-r from-slate-100 to-blue-50 shadow-sm">
    <tr>
    <th className="px-3 py-2">
    <input
      type="checkbox"
      checked={
        filteredData.length > 0 &&
        selectedRows.length === paginatedData.length
      }
      onChange={handleSelectAll}
    />
  </th>

  <th className="border-b border-r border-slate-200 bg-slate-100/90 px-4 py-2 text-left text-sm font-semibold text-slate-700 whitespace-nowrap backdrop-blur-xl">Circle</th>

  <th className="border-b border-r border-slate-200 bg-slate-100/90 px-4 py-2 text-left text-sm font-semibold text-slate-700 whitespace-nowrap backdrop-blur-xl">CMP</th>

  <th className="border-b border-r border-slate-200 bg-slate-100/90 px-4 py-2 text-left text-sm font-semibold text-slate-700 whitespace-nowrap backdrop-blur-xl">PPRJ Status</th>

  <th className="border-b border-r border-slate-200 bg-slate-100/90 px-4 py-2 text-left text-sm font-semibold text-slate-700 whitespace-nowrap backdrop-blur-xl">PPRJ Code</th>

  <th className="border-b border-r border-slate-200 bg-slate-100/90 px-4 py-2 text-left text-sm font-semibold text-slate-700 whitespace-nowrap backdrop-blur-xl">Employee Code</th>
      
  <th className="border-b border-r border-slate-200 bg-slate-100/90 px-4 py-2 text-left text-sm font-semibold text-slate-700 whitespace-nowrap backdrop-blur-xl">Employee Name</th>

  <th className="border-b border-r border-slate-200 bg-slate-100/90 px-4 py-2 text-left text-sm font-semibold text-slate-700 whitespace-nowrap backdrop-blur-xl">Father Name</th>

  <th className="border-b border-r border-slate-200 bg-slate-100/90 px-4 py-2 text-left text-sm font-semibold text-slate-700 whitespace-nowrap backdrop-blur-xl">Function</th>

  <th className="border-b border-r border-slate-200 bg-slate-100/90 px-4 py-2 text-left text-sm font-semibold text-slate-700 whitespace-nowrap backdrop-blur-xl">Job Role Actual CMP Verify</th>

  <th className="border-b border-r border-slate-200 bg-slate-100/90 px-4 py-2 text-left text-sm font-semibold text-slate-700 whitespace-nowrap backdrop-blur-xl">Job Role</th>

  <th className="border-b border-r border-slate-200 bg-slate-100/90 px-4 py-2 text-left text-sm font-semibold text-slate-700 whitespace-nowrap backdrop-blur-xl">Manpower SignOff Scope</th>

  <th className="border-b border-r border-slate-200 bg-slate-100/90 px-4 py-2 text-left text-sm font-semibold text-slate-700 whitespace-nowrap backdrop-blur-xl">Scrum Job Role</th>

  <th className="border-b border-r border-slate-200 bg-slate-100/90 px-4 py-2 text-left text-sm font-semibold text-slate-700 whitespace-nowrap backdrop-blur-xl">Cluster</th>

  <th className="border-b border-r border-slate-200 bg-slate-100/90 px-4 py-2 text-left text-sm font-semibold text-slate-700 whitespace-nowrap backdrop-blur-xl">Mobile Number</th>

  <th className="border-b border-r border-slate-200 bg-slate-100/90 px-4 py-2 text-left text-sm font-semibold text-slate-700 whitespace-nowrap backdrop-blur-xl">DOB</th>

  <th className="border-b border-r border-slate-200 bg-slate-100/90 px-4 py-2 text-left text-sm font-semibold text-slate-700 whitespace-nowrap backdrop-blur-xl">Age</th>

  <th className="border-b border-r border-slate-200 bg-slate-100/90 px-4 py-2 text-left text-sm font-semibold text-slate-700 whitespace-nowrap backdrop-blur-xl">Date Of Joining</th>

  <th className="border-b border-r border-slate-200 bg-slate-100/90 px-4 py-2 text-left text-sm font-semibold text-slate-700 whitespace-nowrap backdrop-blur-xl">Employment Status</th>

  <th className="border-b border-r border-slate-200 bg-slate-100/90 px-4 py-2 text-left text-sm font-semibold text-slate-700 whitespace-nowrap backdrop-blur-xl">Resigned Date</th>

  <th className="border-b border-r border-slate-200 bg-slate-100/90 px-4 py-2 text-left text-sm font-semibold text-slate-700 whitespace-nowrap backdrop-blur-xl">Last Working Date</th>

  <th className="border-b border-r border-slate-200 bg-slate-100/90 px-4 py-2 text-left text-sm font-semibold text-slate-700 whitespace-nowrap backdrop-blur-xl">RM Code</th>

  <th className="border-b border-r border-slate-200 bg-slate-100/90 px-4 py-2 text-left text-sm font-semibold text-slate-700 whitespace-nowrap backdrop-blur-xl">Reporting Manager</th>

  <th className="border-b border-r border-slate-200 bg-slate-100/90 px-4 py-2 text-left text-sm font-semibold text-slate-700 whitespace-nowrap backdrop-blur-xl">Company Email</th>

  <th className="border-b border-r border-slate-200 bg-slate-100/90 px-4 py-2 text-left text-sm font-semibold text-slate-700 whitespace-nowrap backdrop-blur-xl">Laptop Status</th>

  <th className="border-b border-r border-slate-200 bg-slate-100/90 px-4 py-2 text-left text-sm font-semibold text-slate-700 whitespace-nowrap backdrop-blur-xl">IFSC Code</th>

  <th className="border-b border-r border-slate-200 bg-slate-100/90 px-4 py-2 text-left text-sm font-semibold text-slate-700 whitespace-nowrap backdrop-blur-xl">Bank Account No</th>

  <th className="border-b border-r border-slate-200 bg-slate-100/90 px-4 py-2 text-left text-sm font-semibold text-slate-700 whitespace-nowrap backdrop-blur-xl">PAN No</th>

  <th className="border-b border-r border-slate-200 bg-slate-100/90 px-4 py-2 text-left text-sm font-semibold text-slate-700 whitespace-nowrap backdrop-blur-xl">AADHAAR No</th>

  <th className="border-b border-r border-slate-200 bg-slate-100/90 px-4 py-2 text-left text-sm font-semibold text-slate-700 whitespace-nowrap backdrop-blur-xl">UAN No</th>

  <th className="border-b border-r border-slate-200 bg-slate-100/90 px-4 py-2 text-left text-sm font-semibold text-slate-700 whitespace-nowrap backdrop-blur-xl">ESIC IP No</th>

  <th className="border-b border-r border-slate-200 bg-slate-100/90 px-4 py-2 text-left text-sm font-semibold text-slate-700 whitespace-nowrap backdrop-blur-xl">Remarks</th>

  <th className="border-b border-r border-slate-200 bg-slate-100/90 px-4 py-2  text-left text-sm font-semibold text-slate-700 whitespace-nowrap backdrop-blur-xl">
        Action
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
          <span className="text-sm font-semibold text-slate-400">
            Loading Reports...
          </span>
        </div>
      </td>
    </tr>

  ) : filteredData.length === 0 ? (
      <tr>
      <td
    colSpan="100"
    className="py-24 text-center text-sm font-medium w-[70em] text-slate-400"
  >
    <div className="flex items-center justify-center h-full w-[80em]">
          <span className="text-sm font-semibold text-slate-400">
            No Records Found
          </span>
        </div>
  </td>
      </tr>
    ) : (
      paginatedData.map((item, index) => (
        <tr
          key={index}
          className={`transition-all duration-200 hover:bg-blue-50/60 ${
        index % 2 === 0
          ? "bg-white/80"
        : "bg-slate-50/70"
        }`}
        >
      <td className="px-3 py-2">
    <input
      type="checkbox"
      checked={selectedRows.includes(item.id)}
      onChange={() => handleSelectRow(item.id)}
    />
  </td>

  <td className="border-b border-r border-slate-200 px-4 py-2 text-sm text-slate-700 whitespace-nowrap">{item.circle || "-"}</td>
  <td className="border-b border-r border-slate-200 px-4 py-2 text-sm text-slate-700 whitespace-nowrap">{item.cmp || "-"}</td>
  <td className="border-b border-r border-slate-200 px-4 py-2 text-sm text-slate-700 whitespace-nowrap">{item.pprj_status || "-"}</td>
  <td className="border-b border-r border-slate-200 px-4 py-2 text-sm text-slate-700 whitespace-nowrap">{item.pprj_code || "-"}</td>
  <td className="border-b border-r border-slate-200 px-4 py-2 text-sm text-slate-700 whitespace-nowrap">{item.employee_code || "-"}</td>
  <td className="border-b border-r border-slate-200 px-4 py-2 text-sm text-slate-700 whitespace-nowrap">{item.employee_name || "-"}</td>
  <td className="border-b border-r border-slate-200 px-4 py-2 text-sm text-slate-700 whitespace-nowrap">{item.father_name || "-"}</td>
  <td className="border-b border-r border-slate-200 px-4 py-2 text-sm text-slate-700 whitespace-nowrap">{item.function_name || "-"}</td>
  <td className="border-b border-r border-slate-200 px-4 py-2 text-sm text-slate-700 whitespace-nowrap">{item.job_role_actual_cmp_verify || "-"}</td>
  <td className="border-b border-r border-slate-200 px-4 py-2 text-sm text-slate-700 whitespace-nowrap">{item.job_role || "-"}</td>
  <td className="border-b border-r border-slate-200 px-4 py-2 text-sm text-slate-700 whitespace-nowrap">{item.manpower_signoff_scope || "-"}</td>
  <td className="border-b border-r border-slate-200 px-4 py-2 text-sm text-slate-700 whitespace-nowrap">{item.scrum_job_role || "-"}</td>
  <td className="border-b border-r border-slate-200 px-4 py-2 text-sm text-slate-700 whitespace-nowrap">{item.cluster || "-"}</td>
  <td className="border-b border-r border-slate-200 px-4 py-2 text-sm text-slate-700 whitespace-nowrap">{item.mobile_number || "-"}</td>
  <td className="border-b border-r border-slate-200 px-4 py-2 text-sm text-slate-700 whitespace-nowrap">{item.dob ? new Date(item.dob) .toLocaleDateString("en-GB") : "-"}</td>
  <td className="border-b border-r border-slate-200 px-4 py-2 text-sm text-slate-700 whitespace-nowrap">{item.age || "-"}</td>
  <td className="border-b border-r border-slate-200 px-4 py-2 text-sm text-slate-700 whitespace-nowrap">{item.date_of_joining
    ? new Date(item.date_of_joining)
        .toLocaleDateString("en-GB")
    : "-"}</td>
  <td className="border-b border-r border-slate-200 px-4 py-2 text-sm text-slate-700 whitespace-nowrap">{item.employment_status || "-"}</td>
  <td className="border-b border-r border-slate-200 px-4 py-2 text-sm text-slate-700 whitespace-nowrap">{item.resigned_date
    ? new Date(item.resigned_date)
        .toLocaleDateString("en-GB")
    : "-"}</td>
  <td className="border-b border-r border-slate-200 px-4 py-2 text-sm text-slate-700 whitespace-nowrap">{item.last_working_date
    ? new Date(item.last_working_date)
        .toLocaleDateString("en-GB")
    : "-"}</td>
  <td className="border-b border-r border-slate-200 px-4 py-2 text-sm text-slate-700 whitespace-nowrap">{item.rm_code || "-"}</td>
  <td className="border-b border-r border-slate-200 px-4 py-2 text-sm text-slate-700 whitespace-nowrap">{item.reporting_manager || "-"}</td>
  <td className="border-b border-r border-slate-200 px-4 py-2 text-sm text-slate-700 whitespace-nowrap">{item.company_email_id || "-"}</td>
  <td className="border-b border-r border-slate-200 px-4 py-2 text-sm text-slate-700 whitespace-nowrap">{item.laptop_status || "-"}</td>
  <td className="border-b border-r border-slate-200 px-4 py-2 text-sm text-slate-700 whitespace-nowrap">{item.ifsc_code || "-"}</td>
  <td className="border-b border-r border-slate-200 px-4 py-2 text-sm text-slate-700 whitespace-nowrap">{item.bank_account_no || "-"}</td>
  <td className="border-b border-r border-slate-200 px-4 py-2 text-sm text-slate-700 whitespace-nowrap">{item.pan_no || "-"}</td>
  <td className="border-b border-r border-slate-200 px-4 py-2 text-sm text-slate-700 whitespace-nowrap">{item.aadhaar_no || "-"}</td>
  <td className="border-b border-r border-slate-200 px-4 py-2 text-sm text-slate-700 whitespace-nowrap">{item.uan_no || "-"}</td>
  <td className="border-b border-r border-slate-200 px-4 py-2 text-sm text-slate-700 whitespace-nowrap">{item.esic_ip_no || "-"}</td>
  <td className="border-b border-r border-slate-200 px-4 py-2 text-sm text-slate-700 whitespace-nowrap">{item.remarks || "-"}</td>

        <td className="px-3 py-2">
    <div className="flex items-center gap-2">

      <button
        disabled={deletingId === item.id}
        onClick={() => handleDelete(item.id)}
        className={`rounded-xl px-3 py-1 text-xs font-semibold text-white transition ${
          deletingId === item.id
            ? "bg-red-300 cursor-not-allowed"
            : "bg-red-500 hover:bg-red-600"
        }`}
      >
        {deletingId === item.id ? "Deleting..." : "Delete"}
      </button>

    <button
  onClick={() => handleEdit(item)}
  className="rounded-xl bg-blue-600 hover:bg-blue-700 px-3 py-1 text-xs font-semibold text-white transition"
>
  Edit
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
  <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">

    <div className="text-sm text-slate-600">
      Total Files:
      <span className="ml-1 font-semibold text-slate-900">
        {filteredData.length}
      </span>
    </div>

    <div className="flex items-center gap-2">

      <span className="text-sm text-slate-500">
        Show
      </span>

      <select
        value={pageSize}
        onChange={(e) => {
          setPageSize(Number(e.target.value));
          setCurrentPage(1);
        }}
        className="rounded-lg border border-slate-200 px-2 py-1 text-sm"
      >
        {[10, 20, 50, 100].map((size) => (
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
        className="rounded-lg border border-slate-200 px-3 py-1 text-sm disabled:opacity-40"
      >
        Prev
      </button>

      <span className="text-sm text-slate-600">
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
        className="rounded-lg border border-slate-200 px-3 py-1 text-sm disabled:opacity-40"
      >
        Next
      </button>

    </div>

  </div>

            </div>

            {/* Popup Modal */}

            {showUploadModal && (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">

      <div className="w-full max-w-md rounded-[28px] bg-white p-6 shadow-2xl">

        <div className="flex items-center justify-between mb-6">

          <div>
            <h2 className="text-xl font-bold text-slate-900">
              Upload Report
            </h2>

            <p className="text-sm text-slate-500 mt-1">
              Upload manpower physical report
            </p>
          </div>

          <button
            onClick={() => setShowUploadModal(false)}
            className="h-10 w-10 rounded-full bg-slate-100 text-xl text-slate-600 hover:bg-red-100 hover:text-red-600"
          >
            ×
          </button>

        </div>

        <div className="space-y-5">

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">
              Report Date
            </label>

            <input
              type="date"
              value={reportDate}
              onChange={(e) =>
                setReportDate(e.target.value)
              }
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-green-500"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">
              Uploaded By
            </label>

            <input
              type="text"
              placeholder="Enter uploaded by"
              value={uploadedBy}
              onChange={(e) =>
                setUploadedBy(e.target.value)
              }
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-green-500"
            />
          </div>

          <div>
          <div className="mb-2 flex items-center justify-between">

    <label className="block text-sm font-semibold text-slate-700">
      Upload Excel File
    </label>

    <a
      href="/formats/physical_format.xlsx"
      download
      className="rounded-xl bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700"
    >
      Download Format
    </a>

  </div>

            <input
              type="file"
              accept=".xlsx,.xls,.csv,.xlsb"
              onChange={(e) =>
                setReportFile(e.target.files[0])
              }
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">

            <button
              onClick={() => setShowUploadModal(false)}
              className="rounded-2xl border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-700"
            >
              Cancel
            </button>

            <button
    onClick={handleReportUpload}
    disabled={uploading}
    className="rounded-2xl bg-green-600 px-5 py-2 text-sm font-semibold text-white shadow-lg hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed"
  >
    {uploading ? "Uploading..." : "Upload Report"}
  </button>

          </div>

        </div>

      </div>

    </div>
  )}

  {showEmployeeModal && (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">

      <div className="w-full max-w-7xl rounded-[28px] bg-white px-6 py-4 shadow-2xl max-h-[95vh] overflow-y-auto">

        <div className="mb-6 flex items-start justify-between border-b border-slate-200 pb-4">

       <div className="flex items-start gap-4">

  <div className="
    flex h-12 w-12 items-center justify-center
    rounded-xl
    bg-gradient-to-br
    from-indigo-100
    to-violet-100
  ">
    <UserPlus className="h-6 w-6 text-indigo-600" />
  </div>

  <div>

    <h2 className="text-lg font-semibold tracking-tight text-slate-900">
      Add Employee
    </h2>

    <p className=" text-sm text-slate-500">
      Manually add employee details to the system
    </p>

  </div>

</div>

 <button
    onClick={() => setShowEmployeeModal(false)}
    className="h-10 w-10 rounded-full bg-slate-100 text-xl text-slate-600 hover:bg-red-100 hover:text-red-600"
  >
            ×
   </button>

        </div>

     <div className="space-y-2">

  {/* Organization Details */}
  <div className="rounded-xl border border-violet-100 bg-gradient-to-br from-violet-50/60 to-white p-3">

    <h3 className="mb-2 text-sm font-semibold text-violet-700">
      Organization Details
    </h3>

    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">

      <div>
        <label className="mb-1 block text-xs px-1 font-semibold text-slate-700">
          Circle *
        </label>

        <select
  name="circle"
  value={employeeForm.circle}
  onChange={handleEmployeeChange}
  className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs"
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
        <label className="mb-1 block text-xs px-1 font-semibold text-slate-700">
          CMP *
        </label>

  <select
  name="cmp"
  value={employeeForm.cmp}
  onChange={handleEmployeeChange}
  disabled={!employeeForm.circle}
  className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs outline-none focus:border-violet-500 disabled:bg-slate-100 disabled:cursor-not-allowed"
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
        <label className="mb-1 block text-xs px-1 font-semibold text-slate-700">
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
        <label className="mb-1 block text-xs px-1 font-semibold text-slate-700">
          PPRJ Code
        </label>

        <input
          type="text"
          name="pprj_code"
          value={employeeForm.pprj_code}
          onChange={handleEmployeeChange}
          placeholder="Enter PPRJ Code"
          className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs outline-none focus:border-violet-500"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs px-1 font-semibold text-slate-700">
          Employee Code
        </label>

        <input
          type="text"
          name="employee_code"
          value={employeeForm.employee_code}
          onChange={handleEmployeeChange}
          placeholder="Enter Employee Code"
          className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs outline-none focus:border-violet-500"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs px-1 font-semibold text-slate-700">
          Employee Name *
        </label>

        <input
          type="text"
          name="employee_name"
          value={employeeForm.employee_name}
          onChange={handleEmployeeChange}
          placeholder="Enter Employee Name"
          className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs outline-none focus:border-violet-500"
        />
      </div>

    </div>

  </div>

 {/* Personal & Role Information */}

<div className="rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50/60 to-white p-3">

  <h3 className="mb-2 text-sm font-semibold text-blue-700">
    Personal & Role Information
  </h3>

  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">

    {/* Father Name */}
    <div>
      <label className="mb-1 block text-xs px-1 font-semibold text-slate-700">
        Father Name
      </label>

      <input
        type="text"
        name="father_name"
        value={employeeForm.father_name}
        onChange={handleEmployeeChange}
        placeholder="Enter Father Name"
        className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs outline-none focus:border-violet-500"
      />
    </div>

    {/* Function Name */}
    <div>
      <label className="mb-1 block text-xs px-1 font-semibold text-slate-700">
        Function Name
      </label>

      <input
        type="text"
        name="function_name"
        value={employeeForm.function_name}
        onChange={handleEmployeeChange}
        placeholder="Enter Function Name"
        className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs outline-none focus:border-violet-500"
      />
    </div>

    {/* Job Role Actual CMP Verify */}
    <div>
      <label className="mb-1 block text-xs px-1 font-semibold text-slate-700">
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

    {/* Job Role */}
    <div>
      <label className="mb-1 block text-xs px-1 font-semibold text-slate-700">
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
      item => item.value === employeeForm.job_role
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
      <label className="mb-1 block text-xs px-1 font-semibold text-slate-700">
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
      <label className="mb-1 block text-xs px-1 font-semibold text-slate-700">
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
    <div>
      <label className="mb-1 block text-xs px-1 font-semibold text-slate-700">
        Cluster
      </label>

      <input
        type="text"
        name="cluster"
        value={employeeForm.cluster}
        onChange={handleEmployeeChange}
        placeholder="Enter Cluster"
        className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs outline-none focus:border-violet-500"
      />
    </div>

    {/* Mobile Number */}
    <div>
      <label className="mb-1 block text-xs px-1 font-semibold text-slate-700">
        Mobile Number
      </label>

      <input
        type="text"
        name="mobile_number"
        value={employeeForm.mobile_number}
        onChange={handleEmployeeChange}
        placeholder="Enter Mobile Number"
        className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs outline-none focus:border-violet-500"
      />
    </div>

    {/* DOB */}
    <div>
      <label className="mb-1 block text-xs px-1 font-semibold text-slate-700">
        Dob
      </label>

      <input
        type="date"
        name="dob"
        value={employeeForm.dob}
        onChange={handleEmployeeChange}
        className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs outline-none focus:border-violet-500"
      />
    </div>

    {/* Age */}
    <div>
      <label className="mb-1 block text-xs px-1 font-semibold text-slate-700">
        Age
      </label>

      <input
        type="text"
        name="age"
        value={employeeForm.age}
        onChange={handleEmployeeChange}
        placeholder="Enter Age"
        className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs outline-none focus:border-violet-500"
      />
    </div>

    {/* Date Of Joining */}
    <div>
      <label className="mb-1 block text-xs px-1 font-semibold text-slate-700">
        Date Of Joining
      </label>

      <input
        type="date"
        name="date_of_joining"
        value={employeeForm.date_of_joining}
        onChange={handleEmployeeChange}
        className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs outline-none focus:border-violet-500"
      />
    </div>

    {/* Employment Status */}
    <div>
      <label className="mb-1 block text-xs px-1 font-semibold text-slate-700">
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

<div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/60 to-white p-3">

  <h3 className="mb-2 text-sm font-semibold text-indigo-700">
    Work & Reporting Information
  </h3>

  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">

    {/* Resigned Date */}
    <div>
      <label className="mb-1 block text-xs px-1 font-semibold text-slate-700">
        Resigned Date
      </label>

      <input
        type="date"
        name="resigned_date"
        value={employeeForm.resigned_date}
        onChange={handleEmployeeChange}
        className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs outline-none focus:border-violet-500"
      />
    </div>

    {/* Last Working Date */}
    <div>
      <label className="mb-1 block text-xs px-1 font-semibold text-slate-700">
        Last Working Date
      </label>

      <input
        type="date"
        name="last_working_date"
        value={employeeForm.last_working_date}
        onChange={handleEmployeeChange}
        className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs outline-none focus:border-violet-500"
      />
    </div>

    {/* RM Code */}
    <div>
      <label className="mb-1 block text-xs px-1 font-semibold text-slate-700">
        RM Code
      </label>

      <input
        type="text"
        name="rm_code"
        value={employeeForm.rm_code}
        onChange={handleEmployeeChange}
        placeholder="Enter RM Code"
        className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs outline-none focus:border-violet-500"
      />
    </div>

    {/* Reporting Manager */}
    <div>
      <label className="mb-1 block text-xs px-1 font-semibold text-slate-700">
        Reporting Manager
      </label>

      <input
        type="text"
        name="reporting_manager"
        value={employeeForm.reporting_manager}
        onChange={handleEmployeeChange}
        placeholder="Enter Reporting Manager"
        className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs outline-none focus:border-violet-500"
      />
    </div>

    {/* Company Email */}
    <div>
      <label className="mb-1 block text-xs px-1 font-semibold text-slate-700">
        Company Email Id
      </label>

      <input
        type="email"
        name="company_email_id"
        value={employeeForm.company_email_id}
        onChange={handleEmployeeChange}
        placeholder="Enter Email Id"
        className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs outline-none focus:border-violet-500"
      />
    </div>

    {/* Laptop Status */}
    <div>
      <label className="mb-1 block text-xs px-1 font-semibold text-slate-700">
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

<div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50/60 to-white p-3">

  <h3 className="mb-2 text-sm font-semibold text-emerald-700">
    Additional Information
  </h3>

  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">

    {/* IFSC Code */}
    <div>
      <label className="mb-1 block text-xs px-1 font-semibold text-slate-700">
        IFSC Code
      </label>

      <input
        type="text"
        name="ifsc_code"
        value={employeeForm.ifsc_code}
        onChange={handleEmployeeChange}
        placeholder="Enter IFSC Code"
        className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs outline-none focus:border-violet-500"
      />
    </div>

    {/* Bank Account No */}
    <div>
      <label className="mb-1 block text-xs px-1 font-semibold text-slate-700">
        Bank Account No
      </label>

      <input
        type="text"
        name="bank_account_no"
        value={employeeForm.bank_account_no}
        onChange={handleEmployeeChange}
        placeholder="Enter Bank Account No"
        className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs outline-none focus:border-violet-500"
      />
    </div>

    {/* PAN No */}
    <div>
      <label className="mb-1 block text-xs px-1 font-semibold text-slate-700">
        PAN No
      </label>

      <input
        type="text"
        name="pan_no"
        value={employeeForm.pan_no}
        onChange={handleEmployeeChange}
        placeholder="Enter PAN No"
        className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs outline-none focus:border-violet-500"
      />
    </div>

    {/* Aadhaar No */}
    <div>
      <label className="mb-1 block text-xs px-1 font-semibold text-slate-700">
        Aadhaar No
      </label>

      <input
        type="text"
        name="aadhaar_no"
        value={employeeForm.aadhaar_no}
        onChange={handleEmployeeChange}
        placeholder="Enter Aadhaar No"
        className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs outline-none focus:border-violet-500"
      />
    </div>

    {/* UAN No */}
    <div>
      <label className="mb-1 block text-xs px-1 font-semibold text-slate-700">
        UAN No
      </label>

      <input
        type="text"
        name="uan_no"
        value={employeeForm.uan_no}
        onChange={handleEmployeeChange}
        placeholder="Enter UAN No"
        className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs outline-none focus:border-violet-500"
      />
    </div>

    {/* ESIC IP No */}
    <div>
      <label className="mb-1 block text-xs px-1 font-semibold text-slate-700">
        ESIC IP No
      </label>

      <input
        type="text"
        name="esic_ip_no"
        value={employeeForm.esic_ip_no}
        onChange={handleEmployeeChange}
        placeholder="Enter ESIC IP No"
        className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs outline-none focus:border-violet-500"
      />
    </div>

  </div>

  {/* Remarks */}
  <div className="mt-4">

    <label className="mb-1 block text-xs px-1 font-semibold text-slate-700">
      Remarks
    </label>

    <textarea
      rows={4}
      name="remarks"
      value={employeeForm.remarks}
      onChange={handleEmployeeChange}
      placeholder="Enter any additional remarks here..."
      className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs outline-none focus:border-violet-500"
    />

  </div>

</div>

</div>


   <div className="mt-6 flex items-center justify-between rounded-2xl bg-violet-50 px-5 py-4">

  <div>
    <p className="text-sm font-semibold text-violet-700">
      Please ensure all the information is accurate before saving.
    </p>

    <p className="text-xs text-slate-500 mt-1">
      Fields marked with * are mandatory.
    </p>
  </div>

  <div className="flex items-center gap-3">

    <button
      onClick={() => setShowEmployeeModal(false)}
      className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700"
    >
      Cancel
    </button>

    <button
      onClick={handleAddEmployee}
      className="rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg hover:opacity-90"
    >
      {isEditMode ? "Update Employee" : "Save Employee"}
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
