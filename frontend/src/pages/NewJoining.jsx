import React, { useEffect, useMemo, useState } from "react";
import { buildApiUrl } from "../lib/api";
import {
  Bell,
  Search,
  Sparkles,
  UserCircle2,
} from "lucide-react";

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

export default function NewJoining() {


  const [data, setData] = useState([]);
  const [tableLoading, setTableLoading] = useState(true);   
  const [search, setSearch] = useState("");
  const [selectedRows, setSelectedRows] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [deletingId, setDeletingId] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [excelFile, setExcelFile] =
  useState(null);

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

  "Uttar Pradesh (East)": [
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
  l2_status: "",
});

  const loadData = async () => {

    try {

      setTableLoading(true);

      const response = await fetch(
        buildApiUrl("/api/new-joining")
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error("Failed");
      }

      setData(result.data || []);

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
        String(value || "")
          .toLowerCase()
          .includes(search.toLowerCase())
      )

    );

  }, [data, search]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredData.length / pageSize)
  );

  const paginatedData = filteredData.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

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
        selectedRows.filter((item) => item !== id)
      );

    } else {

      setSelectedRows([
        ...selectedRows,
        id,
      ]);

    }

  };

  const handleDelete = async (id) => {

    const confirmDelete =
      window.confirm("Delete record?");

    if (!confirmDelete) return;

    try {

      setDeletingId(id);

      await fetch(
        buildApiUrl(`/api/new-joining/delete/${id}`),
        {
          method: "DELETE",
        }
      );

      loadData();

    } catch (error) {

      console.log(error);

    } finally {

      setDeletingId(null);

    }

  };

const handleStatusUpdate = async (
  id,
  status,
  item
) => {

  const confirmUpdate = window.confirm(
    `Are you sure you want to mark this employee as ${status}?`
  );

  if (!confirmUpdate) return;

  try {

    const employee_status =
      status === "Joined"
        ? "Active"
        : "Inactive";

    const response = await fetch(
      buildApiUrl(
        `/api/new-joining/update-status/${id}`
      ),
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status,
          employee_status,
        }),
      }
    );

    const result = await response.json();

    if (!response.ok || !result.success) {

      alert("Status update failed");

      return;

    }

    // JOINED FLOW
    if (status === "Joined") {

      const goPhysical =
        window.confirm(
          "Employee Joined Successfully.\n\nGo To Physical Page?"
        );

      if (goPhysical) {

        localStorage.setItem(
          "newJoiningEmployee",
          JSON.stringify(item)
        );

        window.location.href =
          "/dashboard/manpower/physical";
      }

    }

    await loadData();

  } catch (error) {

    console.log(error);

    alert("Something went wrong");

  }

};

  const handleAddEmployee = async () => {

  try {

    const response = await fetch(
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

    alert("Employee Added");

    setShowModal(false);

    setEmployeeForm({
      employee_code: "",
      employee_name: "",
      circle: "",
      cmp: "",
      designation: "",
      aadhaar_no: "",
      l2_status: "",
    });

    loadData();

  } catch (error) {

    console.log(error);

  }

};

const handleExcelUpload = async () => {

  if (!excelFile) {

    alert("Please select excel file");

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

      alert(
        result.message || "Upload Failed"
      );

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

  return (

    <div className="min-h-screen relative overflow-hidden bg-slate-50 dark:bg-slate-950">

      <div className="mx-auto max-w-7xl">

<div className="mb-5 flex items-center justify-between">

  <div>

    <h1 className="text-2xl font-bold text-slate-900">
      New Joining
    </h1>

    <p className="text-sm text-slate-500">
      Employee joining management
    </p>

  </div>

 <div className="flex items-center gap-3">

  <button
    onClick={() => setShowModal(true)}
    className="rounded-2xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-lg hover:bg-blue-700"
  >
    + Join Employee
  </button>

</div>

</div>

        <div className="mb-4 flex items-center gap-3">

          <input
            type="text"
            placeholder="Search employee..."
            value={search}
            onChange={(e) =>
              setSearch(e.target.value)
            }
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none"
          />

        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">

          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4">

            <h2 className="text-md font-semibold text-slate-800">
              Employee Records
            </h2>

            <div className="text-sm text-slate-500">
              Total:
              <span className="ml-1 font-semibold text-slate-900">
                {filteredData.length}
              </span>
            </div>

          </div>

          <div className="overflow-x-auto">

            <table className="min-w-full border-separate border-spacing-0">

              <thead className="bg-slate-100">

                <tr>

                  <th className="border-b border-r border-slate-200 px-4 py-2">

                    <input
                      type="checkbox"
                      checked={
                        filteredData.length > 0 &&
                        selectedRows.length === paginatedData.length
                      }
                      onChange={handleSelectAll}
                    />

                  </th>

                  <th className="border-b border-r border-slate-200 px-4 py-2 text-left text-sm font-semibold text-slate-700">
                    Employee Code
                  </th>

                  <th className="border-b border-r border-slate-200 px-4 py-2 text-left text-sm font-semibold text-slate-700">
                    Employee Name
                  </th>

                  <th className="border-b border-r border-slate-200 px-4 py-2 text-left text-sm font-semibold text-slate-700">
                    Circle
                  </th>

                  <th className="border-b border-r border-slate-200 px-4 py-2 text-left text-sm font-semibold text-slate-700">
                     CMP / Cluster
                  </th>

                  <th className="border-b border-r border-slate-200 px-4 py-2 text-left text-sm font-semibold text-slate-700">
                    Designation
                  </th>

                  <th className="border-b border-r border-slate-200 px-4 py-2 text-left text-sm font-semibold text-slate-700">
                    Aadhaar Number
                  </th>

                  <th className="border-b border-r border-slate-200 px-4 py-2 text-left text-sm font-semibold text-slate-700">
                    L2 Status
                  </th>

                  <th className="border-b border-r border-slate-200 px-4 py-2 text-left text-sm font-semibold text-slate-700">
                   Employee Status
                </th>

                  <th className="border-b border-slate-200 px-4 py-2 text-center text-sm font-semibold text-slate-700">
                    Action
                  </th>

                </tr>

              </thead>

              <tbody>

                {tableLoading ? (

                  <tr>

                    <td
                      colSpan="9"
                      className="h-[260px] text-center align-middle"
                    >

                      <div className="flex h-full items-center justify-center">

                        <span className="text-base font-semibold text-slate-400">
                          Loading Reports...
                        </span>

                      </div>

                    </td>

                  </tr>

                ) : filteredData.length === 0 ? (

                  <tr>

                    <td
                      colSpan="9"
                      className="h-[260px] text-center text-sm font-medium text-slate-400"
                    >
                      No Records Found
                    </td>

                  </tr>

                ) : (

                  paginatedData.map((item, index) => (

                    <tr
                      key={index}
                      className={`transition hover:bg-blue-50 ${
                        index % 2 === 0
                          ? "bg-white"
                          : "bg-slate-50"
                      }`}
                    >

                      <td className="border-b border-r border-slate-200 px-4 py-2">

                        <input
                          type="checkbox"
                          checked={selectedRows.includes(item.id)}
                          onChange={() => handleSelectRow(item.id)}
                        />

                      </td>

                      <td className="border-b border-r border-slate-200 px-4 py-2 text-sm font-medium text-slate-700">
                        {item.employee_code || "-"}
                      </td>

                      <td className="border-b border-r border-slate-200 px-4 py-2 text-sm text-slate-700">
                        {item.employee_name || "-"}
                      </td>

                      <td className="border-b border-r border-slate-200 px-4 py-2 text-sm text-slate-700">
                        {item.circle || "-"}
                      </td>

                      <td className="border-b border-r border-slate-200 px-4 py-2 text-sm text-slate-700">
                        {item.cmp || item.cluster || "-"}
                      </td>

                      <td className="border-b border-r border-slate-200 px-4 py-2 text-sm text-slate-700">
                        {item.designation || "-"}
                      </td>

                      <td className="border-b border-r border-slate-200 px-4 py-2 text-sm text-slate-700">
                        {item.aadhaar_no || "-"}
                      </td>

                      <td className="border-b border-r border-slate-200 px-4 py-2">

                  <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  item.l2_status === "Joined"
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-red-100 text-red-700"
                    }`}
                  >
                 {item.l2_status || "-"}
                   </span>
                      </td>

                      <td className="border-b border-r border-slate-200 px-5 py-3">

 <span
  className={`rounded-full px-3 py-1 text-xs font-semibold ${
    item.employee_status === "Inactive"
      ? "bg-red-100 text-red-700"
      : "bg-emerald-100 text-emerald-700"
  }`}
>
  {item.employee_status || "Active"}
</span>

</td>

      <td className="border-b border-slate-200 px-5 py-3">

  <div className="flex items-center justify-center gap-2">

<button
  onClick={() =>
 handleStatusUpdate(
  item.id,
  "Joined",
  item
)
  }
  className="rounded-xl bg-emerald-500 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-600"
>
  Joined
</button>

<button
  onClick={() =>
    handleStatusUpdate(
      item.id,
      "Not Joined"
    )
  }
  className="rounded-xl bg-red-500 px-3 py-1 text-xs font-semibold text-white hover:bg-red-600"
>
  Not Joined
</button>

    <button
      disabled={deletingId === item.id}
      onClick={() => handleDelete(item.id)}
      className={`rounded-xl px-3 py-1 text-xs font-semibold text-white ${
        deletingId === item.id
          ? "bg-slate-300"
          : "bg-slate-700 hover:bg-slate-800"
      }`}
    >
      Delete
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

        <div className="mt-4 flex items-center justify-between">

          <div className="text-sm text-slate-600">

            Total Records:

            <span className="ml-1 font-semibold">
              {filteredData.length}
            </span>

          </div>

          <div className="flex items-center gap-2">

            <button
              onClick={() =>
                setCurrentPage((prev) =>
                  Math.max(prev - 1, 1)
                )
              }
              className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-sm"
            >
              Prev
            </button>

            <span className="text-sm">
              {currentPage} / {totalPages}
            </span>

            <button
              onClick={() =>
                setCurrentPage((prev) =>
                  Math.min(prev + 1, totalPages)
                )
              }
              className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-sm"
            >
              Next
            </button>

          </div>

        </div>

        {showModal && (

<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">

  <div className="w-full max-w-3xl rounded-3xl bg-white p-6">

    <div className="mb-5 flex items-center justify-between">

      <h2 className="text-xl font-bold">
        Add Employee
      </h2>

      <button
        onClick={() => setShowModal(false)}
        className="text-2xl"
      >
        ×
      </button>

    </div>

    <div className="grid grid-cols-2 gap-4">

      <input
        type="text"
        placeholder="Employee Code"
        value={employeeForm.employee_code}
        onChange={(e) =>
          setEmployeeForm({
            ...employeeForm,
            employee_code: e.target.value,
          })
        }
        className="rounded-xl border px-4 py-3"
      />

      <input
        type="text"
        placeholder="Employee Name"
        value={employeeForm.employee_name}
        onChange={(e) =>
          setEmployeeForm({
            ...employeeForm,
            employee_name: e.target.value,
          })
        }
        className="rounded-xl border px-4 py-3"
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
  className="rounded-xl border px-4 py-3"
>

  <option value="">
    Select Circle
  </option>

  {Object.keys(circleCmpData).map(
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
  value={employeeForm.cmp}
  onChange={(e) =>
    setEmployeeForm({
      ...employeeForm,
      cmp: e.target.value,
    })
  }
  className="rounded-xl border px-4 py-3"
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

      <input
        type="text"
        placeholder="Designation"
        value={employeeForm.designation}
        onChange={(e) =>
          setEmployeeForm({
            ...employeeForm,
            designation: e.target.value,
          })
        }
        className="rounded-xl border px-4 py-3"
      />

      <input
        type="text"
        placeholder="Aadhaar Number"
        value={employeeForm.aadhaar_no}
        onChange={(e) =>
          setEmployeeForm({
            ...employeeForm,
            aadhaar_no: e.target.value,
          })
        }
        className="rounded-xl border px-4 py-3"
      />

    </div>

    <div className="mt-6 rounded-2xl border border-dashed border-emerald-300 bg-emerald-50 p-5">

  <h3 className="mb-3 text-lg font-bold text-emerald-700">
    Upload Excel File
  </h3>

  <div className="flex items-center gap-3">

    <label className="cursor-pointer rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">

      Select Excel

      <input
        type="file"
        accept=".xlsx,.xls,.csv"
        hidden
        onChange={(e) =>
          setExcelFile(e.target.files[0])
        }
      />

    </label>

    <button
      onClick={handleExcelUpload}
      className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
    >
      Upload File
    </button>

    <span className="text-sm text-slate-600">

      {excelFile
        ? excelFile.name
        : "No file selected"}

    </span>

  </div>

</div>

    <div className="mt-5 flex justify-end gap-3">

      <button
        onClick={() => setShowModal(false)}
        className="rounded-xl border px-4 py-2"
      >
        Cancel
      </button>

      <button
        onClick={handleAddEmployee}
        className="rounded-xl bg-blue-600 px-5 py-2 font-semibold text-white"
      >
        Save Employee
      </button>

    </div>

  </div>

</div>

)}

      </div>

    </div>

  );

}