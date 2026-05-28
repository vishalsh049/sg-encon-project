  import React, { useEffect, useMemo, useState } from "react";
  import * as XLSX from "xlsx";
  import { saveAs } from "file-saver";
  import { buildApiUrl } from "../lib/api";

  export default function Physical() {
    const [showModal, setShowModal] = useState(false);
    const [uploadedBy, setUploadedBy] = useState("");
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [showEmployeeModal, setShowEmployeeModal] = useState(false);

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
      buildApiUrl(
        "/api/new-joining/upload-excel"
      ),
      {
        method: "POST",
        body: formData,
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

    <div className="grid grid-cols-2 gap-2">

      {employmentStatus.map((item, index) => (

        <div
          key={index}
          className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-2"
        >

          <span className="text-xs font-semibold text-slate-700">
            {item.employment_status}
          </span>

          <span className="text-sm font-semibold text-blue-600">
            {item.total}
          </span>

        </div>

      ))}

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
        disabled={downloadingId === item.id}
        onClick={() => handleDownload(item)}
        className={`rounded-xl px-3 py-1 text-xs font-semibold text-white transition ${
          downloadingId === item.id
            ? "bg-emerald-300 cursor-not-allowed"
            : "bg-emerald-600 hover:bg-emerald-700"
        }`}
      >
        {downloadingId === item.id ? "Downloading..." : "Download"}
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

        <div className="mb-4 flex items-center justify-between">

          <div>
            <h2 className="text-xl font-semibold text-slate-900">
              Add Employee
            </h2>

            <p className=" text-sm text-slate-500">
              Manually Add Employee Details
            </p>
          </div>

          <button
            onClick={() => setShowEmployeeModal(false)}
            className="h-10 w-10 rounded-full bg-slate-100 text-xl text-slate-600 hover:bg-red-100 hover:text-red-600"
          >
            ×
          </button>

        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-6">

          {Object.keys(employeeForm).map((field) => (

            <div key={field}>

              <label className="mb-1 block text-sm font-semibold px-2  text-slate-700 capitalize">
                {field.replaceAll("_", " ")}
              </label>

            {field === "circle" ? (

    <select
      name={field}
      required
      value={employeeForm[field]}
      onChange={handleEmployeeChange}
      className="w-full rounded-xl border border-slate-200 px-4 py-2 text-sm outline-none focus:border-blue-500"
    >

      <option value="">
        Select Circle
      </option>

      <option value="Delhi">Delhi</option>

      <option value="Haryana">
        Haryana
      </option>

      <option value="Punjab">
        Punjab
      </option>

      <option value="UP East">
        UP East
      </option>

    </select>


  ) : field === "cmp" ? (

    <select
      name={field}
      required
      value={employeeForm[field]}
      onChange={handleEmployeeChange}
      className="w-full rounded-xl border border-slate-200 px-4 py-2 text-sm outline-none focus:border-blue-500"
    >

      <option value="">
        Select CMP
      </option>

      {employeeForm.circle === "Delhi" && (
        <>
          <option value="Delhi SHQ">
            Delhi SHQ
          </option>

          <option value="Delhi-1 (West)">
            Delhi-1 (West)
          </option>

          <option value="Delhi-2 (South)">
            Delhi-2 (South)
          </option>

          <option value="Delhi-3 (Central-East)">
            Delhi-3 (Central-East)
          </option>

          <option value="Delhi-4 (North)">
            Delhi-4 (North)
          </option>

          <option value="Faridabad (NCR)">
            Faridabad (NCR)
          </option>

          <option value="Ghaziabad (NCR)">
            Ghaziabad (NCR)
          </option>

          <option value="Gurgaon (NCR)">
            Gurgaon (NCR)
          </option>

          <option value="Noida (NCR)">
            Noida (NCR)
          </option>
        </>
      )}

      {employeeForm.circle === "Haryana" && (
        <>
          <option value="Haryana SHQ">
            Haryana SHQ
          </option>

          <option value="Ambala">
            Ambala
          </option>

          <option value="Hissar">
            Hissar
          </option>

          <option value="Karnal">
            Karnal
          </option>

          <option value="Panipat">
            Panipat
          </option>

          <option value="Rewari">
            Rewari
          </option>

          <option value="Rohtak">
            Rohtak
          </option>
        </>
      )}

      {employeeForm.circle === "Punjab" && (
        <>
          <option value="Punjab SHQ">
            Punjab SHQ
          </option>

          <option value="Amritsar">
            Amritsar
          </option>

          <option value="Bathinda">
            Bathinda
          </option>

          <option value="Chandigarh">
            Chandigarh
          </option>

          <option value="Jalandhar">
            Jalandhar
          </option>

          <option value="Ludhiana-1">
            Ludhiana-1
          </option>

          <option value="Ludhiana-2">
            Ludhiana-2
          </option>

          <option value="Pathankot">
            Pathankot
          </option>

          <option value="Patiala">
            Patiala
          </option>

          <option value="Sangrur">
            Sangrur
          </option>
        </>
      )}

      {employeeForm.circle === "UP East" && (
    <>
      <option value="UP East SHQ">
        UP East SHQ
      </option>

      <option value="Allahabad">
        Allahabad
      </option>

      <option value="Azamgarh">
        Azamgarh
      </option>

      <option value="Faizabad">
        Faizabad
      </option>

      <option value="Gorakhpur">
        Gorakhpur
      </option>

      <option value="Nanded">
        Nanded
      </option>

      <option value="Raibareilly">
        Raibareilly
      </option>

      <option value="Varanasi">
        Varanasi
      </option>
    </>
  )}

    </select>

  ) 

  : field === "dob" ||
      field === "date_of_joining" ||
      field === "resigned_date" ||
      field === "last_working_date" ? (

    <input
      type="date"
      name={field}
      value={employeeForm[field]}
      onChange={handleEmployeeChange}
      className="w-full rounded-xl border border-slate-200 px-4 py-2 text-sm outline-none focus:border-blue-500"
    />

  ) : field === "employment_status" ? (

    <select
      name={field}
      value={employeeForm[field]}
      onChange={handleEmployeeChange}
      className="w-full rounded-xl border border-slate-200 px-4 py-2 text-sm outline-none focus:border-blue-500"
    >

      <option value="">
        Select Status
      </option>

      <option value="ACTIVE">
        ACTIVE
      </option>

      <option value="INACTIVE">
        INACTIVE
      </option>

    </select>

  ) : field === "laptop_status" ? (

    <select
      name={field}
      value={employeeForm[field]}
      onChange={handleEmployeeChange}
      className="w-full rounded-xl border border-slate-200 px-4 py-2 text-sm outline-none focus:border-blue-500"
    >

      <option value="">
        Select Laptop Status
      </option>

      <option value="Assigned">
        Assigned
      </option>

      <option value="Not Assigned">
        Not Assigned
      </option>

      <option value="Pending">
        Pending
      </option>

    </select>

  ) : (

   <input
  type={
    field === "aadhaar_no"
      ? "number"
      : "text"
  }
  name={field}
      value={employeeForm[field]}
      onChange={handleEmployeeChange}
      className="w-full rounded-xl border border-slate-200 px-4 py-2 text-sm outline-none focus:border-blue-500"
    />

  )}
            </div>

          ))}

        </div>

        <div className="mt-4 flex justify-end gap-2">

          <button
            onClick={() => setShowEmployeeModal(false)}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
          >
            Cancel
          </button>

          <button
            onClick={handleAddEmployee}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Save Employee
          </button>

        </div>

      </div>

    </div>
  )}
          
          </div>
        </div>
      </div>
    );
  }
