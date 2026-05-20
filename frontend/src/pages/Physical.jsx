import React, { useEffect, useState } from "react";
import { buildApiUrl } from "../lib/api";

export default function Physical() {
  const [showModal, setShowModal] = useState(false);
  const [uploadedBy, setUploadedBy] = useState("");
const [showUploadModal, setShowUploadModal] = useState(false);

  const [data, setData] = useState([]);
  const [jobRoles, setJobRoles] = useState([]);
  const [circles, setCircles] = useState([]);
  const [employmentStatus, setEmploymentStatus] = useState([]);
  const [selectedRows, setSelectedRows] = useState([]);
  const [reportFile, setReportFile] = useState(null);

const [reportDate, setReportDate] = useState("");

  const loadPhysicalData = async () => {
    try {
       const response = await fetch(
       buildApiUrl("/api/physical/reports")
       );
         const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Failed to load physical data");
      }

      setData(
        (result.data || []).map((item, index) => ({
          ...item,
          srNo: index + 1,
        }))
      );
    } catch (error) {
      console.error(error);
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

  loadPhysicalData();

  loadJobRoles();

  loadCircles();

  loadEmploymentStatus();

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

   <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">

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
  {data.length === 0 ? (
    <tr>
      <td
        colSpan="6"
        className="py-14 text-center text-sm font-medium text-slate-400"
      >
        No Reports Found
      </td>
    </tr>
  ) : (
    data.map((item, index) => (
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
    className="rounded-xl bg-amber-500 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-600"
  >
    Edit
  </button>

  <button
    className="rounded-xl bg-red-500 px-3 py-1 text-xs font-semibold text-white hover:bg-red-600"
  >
    Delete
  </button>

  <button
    className="rounded-xl bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
  >
    Download
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
          <label className="mb-2 block text-sm font-semibold text-slate-700">
            Upload Excel File
          </label>

          <input
            type="file"
            accept=".xlsx,.xls"
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
            className="rounded-2xl bg-green-600 px-5 py-2 text-sm font-semibold text-white shadow-lg hover:bg-green-700"
          >
            Upload Report
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
