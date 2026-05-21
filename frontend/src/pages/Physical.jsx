import React, { useEffect, useMemo, useState } from "react";
import { buildApiUrl } from "../lib/api";

export default function Physical() {
  const [showModal, setShowModal] = useState(false);
  const [uploadedBy, setUploadedBy] = useState("");
const [showUploadModal, setShowUploadModal] = useState(false);
 const [uploading, setUploading] = useState(false);

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

  const loadPhysicalData = async () => {
    try {
      setTableLoading(true);
     const response = await fetch(
  buildApiUrl("/api/physical/reports")
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
  }, 100);

}, []);

const handleSelectAll = (e) => {

  if (e.target.checked) {

    setSelectedRows(
      data.map((item) => item.id)
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

const totalPages = useMemo(() => {
  return Math.ceil(data.length / pageSize);
}, [data, pageSize]);

const paginatedData = useMemo(() => {
  return data.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );
}, [data, currentPage, pageSize]);

const handleDelete = async (id) => {
  const confirmDelete = window.confirm(
    "Warning: This report will be permanently deleted. Do you want to continue?"
  );

  if (!confirmDelete) return;

  setDeletingId(id);

  try {
    const response = await fetch(
      buildApiUrl(`/api/physical/delete-report/${id}`),
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

        <div className="relative p-2">
          {/* Header */}
          <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">Manpower - Physical</h1>
              <div className="mt-1 text-sm text-slate-500">Enterprise employee registry with secure, premium UI.</div>
              <div className="mt-4 rounded-2xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-900 shadow-sm">
                <p className="font-semibold">Warning:</p>
                <p className="mt-1">
                  Uploaded files are stored on the server disk. If a file is removed manually after upload, it cannot be recovered even if its database record remains.
                  Keep a backup copy and re-upload missing files if needed.
                </p>
              </div>
            </div>

<div className="flex items-center gap-3">

  <button
    onClick={() => setShowUploadModal(true)}
    className="rounded-2xl bg-green-600 px-5 py-2 text-sm font-semibold text-white shadow-lg transition hover:bg-green-700"
  >
    Upload Report
  </button>

</div>

          </div>

   {/* Top KPI Row */}

<div className="mx-auto mt-4 grid w-full max-w-7xl grid-cols-1 gap-2 lg:grid-cols-12">

  {/* Total Employees */}

  {/* Total Employees */}

<div className="lg:col-span-3 rounded-[22px] border border-white/70 bg-white/100 px-4 py-3 backdrop-blur-xl">

    <div className="text-sm font-semibold text-slate-500">
      Total Employees
    </div>

    <div className="mt-1 text-xl font-semibold text-slate-900">
      {jobRoles.reduce((sum, item) => sum + item.total, 0)}
    </div>

    <div className="mt-1 text-xs text-emerald-600">
      Active Workforce
    </div>

  </div>
  
  {/* Employment Status */}

<div className="lg:col-span-4 rounded-[22px] border border-white/100 bg-white/100 px-4 py-3 backdrop-blur-xl">

  <div className="mb-3 flex items-center justify-between">

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

<div className="lg:col-span-5 rounded-[22px] border border-white/70 bg-white/100 px-4 py-3 backdrop-blur-xl">
    <div className="mb-4 flex items-center justify-between">

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


{/* Job Role Document Average */}

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

<div className="mx-auto mt-3 w-full max-w-7xl">

  <div className="rounded-[22px] border border-white/70 bg-white/100 px-4 py-3 backdrop-blur-xl">

    <div className="mb-2 flex items-center justify-between">

      <h2 className="text-md font-semibold text-slate-900">
        Job Roles
      </h2>

      <div className="text-xs text-slate-500">
        Role Wise Count
      </div>

    </div>

   <div className="h-[180px] overflow-y-scroll pr-2 custom-scrollbar">

   <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-4">

      {jobRoles.map((role, index) => (

        <div
          key={index}
          className="flex items-center justify-between rounded-2xl bg-slate-50 px-3 py-2"
        >

          <span className="text-sm text-slate-700">
            {role.role_group}
          </span>

          <span className="text-sm font-semibold text-blue-600">
            {role.total}
          </span>

        </div>

      ))}

       </div>

</div>

  </div>

</div>


          {/* Table Section */}
          <div className="mx-auto mt-4 w-full max-w-7xl">
            <div className="relative overflow-hidden rounded-[22px] border border-white/70 bg-white/65 p-4 backdrop-blur-xl">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.18),transparent_45%)]" />

              <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-xl font-semibold tracking-tight text-slate-900">Employee Records</h2>
                <div className="text-sm text-slate-600/80">
                  Total: <span className="font-semibold text-slate-900">{data.length}</span>
                </div>
              </div>

              <div className="relative mt-4 overflow-x-auto custom-scrollbar">
                <div>
                  <table className="w-full table-auto">
              <thead>
  <tr>
    <th className="px-3 py-4">
  <input
  type="checkbox"
  checked={
    data.length > 0 &&
    selectedRows.length === data.length
  }
  onChange={handleSelectAll}
/>
    </th>

    <th className="px-3 py-4 text-left text-sm font-semibold text-slate-600">
      Report Date
    </th>

    <th className="px-3 py-4 text-left text-sm font-semibold text-slate-600">
      File Name
    </th>

    <th className="px-3 py-4 text-left text-sm font-semibold text-slate-600">
      Uploaded By
    </th>

    <th className="px-3 py-4 text-left text-sm font-semibold text-slate-600">
      Uploaded At
    </th>

    <th className="px-3 py-4 text-left text-sm font-semibold text-slate-600">
      Action
    </th>
  </tr>
</thead>

     <tbody>
  {tableLoading ? (

  <tr>
    <td
      colSpan="6"
      className="py-14 text-center text-sm font-medium text-slate-400"
    >
      Loading Reports...
    </td>
  </tr>

) : data.length === 0 ? (
    <tr>
      <td
        colSpan="6"
        className="py-14 text-center text-sm font-medium text-slate-400"
      >
        No Reports Found
      </td>
    </tr>
  ) : (
    paginatedData.map((item, index) => (
      <tr
        key={index}
        className="border-b border-slate-200/60 hover:bg-slate-50"
      >
        <td className="px-3 py-4">
  <input
  type="checkbox"
  checked={selectedRows.includes(item.id)}
  onChange={() =>
    handleSelectRow(item.id)
  }
/>
        </td>

        <td className="px-3 py-4 text-sm">
          {item.report_date
            ? new Date(item.report_date).toLocaleDateString("en-GB")
            : "-"}
        </td>

        <td className="px-3 py-4 text-sm font-medium">
          {item.original_name}
        </td>

        <td className="px-3 py-4 text-sm">
          {item.uploaded_by || "-"}
        </td>

        <td className="px-3 py-4 text-sm">
          {item.uploaded_at
            ? new Date(item.uploaded_at).toLocaleString("en-GB")
            : "-"}
        </td>

       <td className="px-3 py-4">
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
      {data.length}
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
      disabled={currentPage === totalPages}
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
         
        </div>
      </div>
    </div>
  );
}
