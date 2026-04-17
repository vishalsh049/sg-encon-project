import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowDownToLine,
  Building2,
  CalendarDays,
  Clock3,
  FileSpreadsheet,
  Search,
  Sparkles,
  Trash2,
  UploadCloud,
  UserCheck,
  UserX,
  Users,
  X,
} from "lucide-react";
import { buildApiUrl } from "../lib/api";

function formatDate(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "--";
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatTime(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "--";
  return date.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

const statusStyles = {
  All: "bg-slate-200 text-slate-700",
  Active: "bg-emerald-500 text-white shadow-emerald-950/20",
  Inactive: "bg-white text-slate-700",
};

export default function Scrum() {
  const [data, setData] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [stateFilter, setStateFilter] = useState("");
  const [vendorFilter, setVendorFilter] = useState("");
  const [file, setFile] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [uploadDate, setUploadDate] = useState("");
  const [uploadedBy, setUploadedBy] = useState("");
  const [latestUpload, setLatestUpload] = useState(null);
  const [vendorOpen, setVendorOpen] = useState(false);
  const [selected, setSelected] = useState([]); 
  const [uploads, setUploads] = useState([]);
  const [roleSummary, setRoleSummary] = useState([]);

  const refreshScrumData = async () => {
    const [uploadsRes, dataRes, latestRes, roleRes] = await Promise.all([
    fetch(buildApiUrl("/api/manpower/scrum/uploads")),
    fetch(buildApiUrl("/api/manpower/scrum")),
    fetch(buildApiUrl("/api/manpower/scrum/latest-upload")),
    fetch(buildApiUrl("/api/manpower/scrum/job-role-summary"))
   ]);

    const [uploadsData, scrumData, latestData, roleData] = await Promise.all([
    uploadsRes.json(),
    dataRes.json(),
    latestRes.json(),
    roleRes.json()
   ]);
   setRoleSummary(Array.isArray(roleData) ? roleData : []);

    setUploads(Array.isArray(uploadsData) ? uploadsData : []);
    setData(Array.isArray(scrumData) ? scrumData : []);
    setLatestUpload(latestData || null);
  };

  useEffect(() => {
    refreshScrumData().catch(() => {
      setUploads([]);
      setData([]);
      setLatestUpload(null);
    });
  }, []);

  const filteredData = data.filter((item) => {
    const matchSearch =
      item.resource_name?.toLowerCase().includes(search.toLowerCase()) ||
      item.job_role?.toLowerCase().includes(search.toLowerCase());

    const matchStatus =
      statusFilter === "All" || item.status === statusFilter;

    const matchState = !stateFilter || item.state === stateFilter;
    const matchVendor = !vendorFilter || item.vendor === vendorFilter;

    return matchSearch && matchStatus && matchState && matchVendor;
  });

  const uniqueStates = useMemo(
    () => [...new Set(data.map((item) => item.state).filter(Boolean))],
    [data]
  );

  const uniqueVendors = useMemo(
    () => [...new Set(data.map((item) => item.vendor).filter(Boolean))],
    [data]
  );

  const stats = useMemo(() => {
  const activeCount = data.filter(
    (item) => item.status === "Active"
  ).length;

  const inactiveCount = data.length - activeCount;

  return {
    total: data.length,
    active: activeCount,
    inactive: inactiveCount,
    vendors: new Set(
      data.map((item) => item.vendor).filter(Boolean)
    ).size,
  };
}, [data]);

  const handleUpload = async () => {
    if (!file) return alert("Select file");
    if (!uploadDate) return alert("Select date");
    if (!uploadedBy) return alert("Enter uploaded by");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("uploaded_at", new Date().toISOString());
    formData.append("upload_date", uploadDate);
    formData.append("uploaded_by", uploadedBy);

    const res = await fetch(buildApiUrl("/api/manpower/scrum/upload"), {
      method: "POST",
      body: formData,
    });

    const result = await res.json();
    if (!res.ok) {
      throw new Error(result.message || "Upload failed");
    }
    alert(result.message);
    await refreshScrumData();

    setShowModal(false);
    setFile(null);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this file?")) return;

    try {
      const res = await fetch(buildApiUrl(`/api/manpower/upload/${id}`), {
        method: "DELETE",
      });

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.message || "Delete failed");
      }

      alert(result.message);
      setSelected((prev) => prev.filter((value) => value !== id));
      await refreshScrumData();
    } catch (err) {
      console.error(err);
      alert(err.message || "Delete failed");
    }
  };

const handleBulkDelete = async () => {
  if (selected.length === 0) {
    alert("No items selected");
    return;
  }

  if (!window.confirm("Delete selected files?")) return;

  try {
    const res = await fetch(buildApiUrl("/api/manpower/upload/bulk"), {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        batchIds: selected.filter(Boolean),
      }),
    });

    const result = await res.json();
    if (!res.ok) {
      throw new Error(result.message || "Bulk delete failed");
    }

    alert(result.message);
    setSelected([]);
    await refreshScrumData();
  } catch (err) {
    console.error(err);
    alert(err.message || "Bulk delete failed");
  }
};

const handleBulkDownload = async () => {
  if (selected.length === 0) {
    alert("No items selected");
    return;
  }

  try {
    const res = await fetch(buildApiUrl("/api/manpower/download/bulk"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        batchIds: selected,
      }),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.message || "Download failed");
    }

    const blob = await res.blob();

    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "scrum_files.zip";
    a.click();

    window.URL.revokeObjectURL(url);
  } catch (err) {
    console.error(err);
    alert(err.message || "Download failed");
  }
};

const filteredUploads = uploads.filter((item) => {
  const q = search.trim().toLowerCase();

  if (!q) return true; // show all if empty

  return [
    item.file_name,
    item.uploaded_by,
    item.upload_batch_id,
    item.manual_date,
  ]
    .filter(Boolean) // remove null/undefined
    .some((field) =>
      field.toString().toLowerCase().includes(q)
    );
});

const latestDate = uploads[0]?.manual_date;

const latestUploads = uploads.filter(
  (item) => item.manual_date === latestDate
);

  return (
    <div className="min-h-screen text-slate-900">
     <div className="w-full px-4 space-y-6">  
<section className="relative overflow-hidden rounded-[32px] border border-slate-200 bg-white p-4 md:p-8">          <div className="relative grid gap-6 xl:grid-cols-1">
            <div className="space-y-3 relative">
               <button
  onClick={() => {
    setShowModal(true);
    setUploadDate(new Date().toISOString().slice(0, 10));
  }}
  className="absolute right-0 top-0 inline-flex items-center gap-2 rounded-2xl bg-cyan-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-cyan-700"
>
  <UploadCloud size={16} />
  Upload Excel
</button>
             <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.28em] text-cyan-700">
                <Sparkles size={14} />
                Scrum Control Center
              </div>

              <div className="max-w-3xl">
               <h1 className="text-xl font-semibold tracking-tight text-slate-900 md:text-2xl leading-tight">
                  Complete visibility into scrum manpower operations
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-5 text-slate-600">
                  Track workforce activity, refine views instantly, and manage upload history from one unified workspace.
                </p>
              </div>
          
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  {
                    label: "Total",
                    value: stats.total,
                    note: "Total records in current view",
                    icon: Users,
                    chip: "text-cyan-700 bg-cyan-400/15",
                  },
                  {
                    label: "Active",
                    value: stats.active,
                    note: "Active workforce",
                    icon: UserCheck,
                    chip: "text-emerald-100 bg-emerald-400/15",
                  },
                  {
                    label: "Inactive",
                    value: stats.inactive,
                    note: "Inactive workforce",
                    icon: UserX,
                    chip: "text-amber-100 bg-amber-400/15",
                  },
                  {
                    label: "Vendor",
                    value: stats.vendors,
                    note: "Total vendors",
                    icon: Building2,
                    chip: "text-violet-100 bg-violet-400/15",
                  },
                ].map(({ label, value, note, icon: Icon, chip }) => (
                  <div
                    key={label}
                    className="rounded-[24px] border bg-white border border-slate-200 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                          {label}
                        </p>
                        <p className="mt-3 text-3xl font-semibold text-slate-900">
                          {value}
                        </p>
                      </div>
                      <div
                        className={`flex h-11 w-11 items-center justify-center rounded-2xl ${chip}`}
                      >
                        <Icon size={20} />
                      </div>
                    </div>
                    <p className="mt-3 text-sm text-slate-400">{note}</p>
                  </div>
                ))}
              </div>

<div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
  <h3 className="text-md font-semibold mb-3">Job Roles</h3>

  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-[130px] overflow-y-auto hide-scrollbar">
    {roleSummary.map((item) => (
      <div
        key={item.category}
        className="flex justify-between text-sm bg-slate-50 px-2 py-1.5 rounded-lg"
      >
        <span className="text-slate-600 truncate">
          {item.category}
        </span>
        <span className="font-semibold text-blue-600">
          {item.total}
        </span>
      </div>
    ))}
  </div>
</div>

            </div>

          
          </div>
        </section>

<section className="w-full rounded-2xl border border-slate-200 bg-white p-4">
        <div className="grid gap-5 xl:grid-cols-1">
            <div className="space-y-4">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-400">
                    Explore Workforce
                  </p>
                  <h2 className="mt-1 text-2xl font-semibold text-slate-900">
                    Refine workforce view
                  </h2>
                </div>

                <div className="relative w-full xl:max-w-sm">
                  <Search
                    size={16}
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    type="text"
                    placeholder="Search by name, role, or ID"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm text-slate-900 outline-none transition focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
                  />
                </div>
              </div>
            </div>

          </div>
        </section>

<section className="overflow-hidden rounded-[30px] border border-slate-200/10 bg-white pb-24">          <div className="border-b border-slate-200 bg-[linear-gradient(180deg,_#ffffff_0%,_#f8fbff_100%)] px-6 py-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-slate-400">
                  Upload Register
                </p>
                <h2 className="mt-1 text-2xl font-semibold text-slate-900">
                  Upload history
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Track and audit all scrum file submissions.
                </p>
              </div>

              <div className="inline-flex items-center rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-600">
                {latestUploads.length} record{uploads.length === 1 ? "" : "s"}
              </div>
            </div>
          </div>
          
{selected.length > 0 && (
  <div className="flex justify-between items-center mb-3 bg-slate-100 px-4 py-3 rounded-xl border border-slate-200">

    {/* LEFT SIDE TEXT */}
    <span className="text-sm font-medium text-slate-700">
      {selected.length} selected
    </span>

    {/* RIGHT SIDE ACTIONS */}
    <div className="flex gap-2">

      {/* DOWNLOAD BUTTON */}
      <button
        onClick={handleBulkDownload}
        className="px-4 py-2 rounded-xl bg-blue-500 text-white"
      >
        Download
      </button>

      {/* DELETE BUTTON */}
      <button
        onClick={handleBulkDelete}
        className="px-4 py-2 rounded-xl bg-red-500 text-white"
      >
        Delete Selected
      </button>

    </div>

  </div>
)}

          {uploads.length > 0 ? (
            
            <div className="overflow-x-auto">
              <table className="min-w-full">
               <thead>
  <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-xs uppercase tracking-[0.22em] text-slate-500">
    
    <th className="px-6 py-4">
     <input
  type="checkbox"
  checked={
    uploads.length > 0 &&
    selected.length === uploads.length
  }
  onChange={(e) => {
    if (e.target.checked) {
      setSelected(uploads.map((item) => item.upload_batch_id).filter(Boolean));
    } else {
      setSelected([]);
    }
  }}
/>
    </th>

    <th className="px-6 py-4 font-medium">Date</th>
    <th className="px-6 py-4 font-medium">Uploaded By</th>
    <th className="px-6 py-4 font-medium">File</th>
    <th className="px-6 py-4 font-medium">Uploaded At</th>
    <th className="px-6 py-4 text-right font-medium">Actions</th>

  </tr>
</thead>
                <tbody>
                  {filteredUploads.map((item, index) => (
                    <tr
                      key={`${item.file_name}-${index}`}
                      className="border-b border-slate-100 text-sm text-slate-700 transition hover:bg-cyan-50/40"
                    >
                      <td className="px-6 py-5">
  <input
  type="checkbox"
  checked={selected.includes(item.upload_batch_id)}
  onChange={(e) => {
    const id = item.upload_batch_id;

    if (!id) return; // 🔥 safety

    if (e.target.checked) {
setSelected(prev => [...new Set([...prev, id])]);
    } else {
      setSelected(prev => prev.filter(x => x !== id));
    }
  }}
/>
</td>
                      <td className="px-6 py-5">
                        <div className="inline-flex items-center gap-3">
                          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                            <CalendarDays size={16} />
                          </div>
                          <div>
                            <p className="font-medium text-slate-900">
                              {formatDate(item.manual_date)}
                            </p>
                            <p className="text-xs text-slate-500">
                              Register entry
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="inline-flex rounded-full bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700">
                          {item.uploaded_by || "--"}
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex max-w-[320px] items-center gap-3">
                          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-100 text-cyan-700">
                            <FileSpreadsheet size={18} />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-medium text-slate-900">
                              {item.file_name}
                            </p>
                            <p className="text-xs text-slate-500">
                              Excel register file
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5 text-slate-500">
                        {formatDate(item.uploaded_at)} {formatTime(item.uploaded_at)}
                      </td>
                      <td className="px-6 py-5">
                       <div className="flex justify-end gap-2">

  {/* DOWNLOAD */}
  <button
    onClick={() =>
      window.open(
        buildApiUrl(`/api/manpower/download/${encodeURIComponent(item.file_name)}`),
        "_blank"
      )
    }
    className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 text-slate-500 hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-700"
  >
    <ArrowDownToLine size={16} />
  </button>

  {/* DELETE */}
  <button
    onClick={() => handleDelete(item.upload_batch_id)}
    className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 text-slate-500 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600"
  >
    <Trash2 size={16} />
  </button>

</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center px-6 py-24 text-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-[28px] bg-slate-100 text-slate-700">
                <UploadCloud size={28} />
              </div>
              <h3 className="mt-6 text-2xl font-semibold text-slate-900">
                No upload records yet
              </h3>
              <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
                Once a scrum file is uploaded, the register will appear here in a
                premium tabular view.
              </p>
            </div>
          )}

          <div className="fixed bottom-0 z-50 flex flex-col gap-3 border-t border-slate-200 bg-white px-4 py-2 text-sm text-slate-500 md:flex-row md:items-center md:justify-between"
          style={{
          left: "var(--sidebar-width, 280px)",
          right: "0"
          }}
          >
  <div>
    Showing {latestUploads.length} of {latestUploads.length} records
  </div>

  <div className="flex items-center gap-2">
    <button className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-slate-400">
      Prev
    </button>

    <span className="rounded-lg bg-white px-4 py-2 text-slate-600">
      Page 1 of 1
    </span>

    <button className="rounded-lg  border border-slate-200 bg-white px-2 py-1 text-slate-400">
      Next
    </button>
  </div>
</div>
        </section>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 px-4 backdrop-blur-md">
          <div className="relative w-full max-w-2xl overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,_#f8fbff_0%,_#ffffff_100%)] ">
            <div className="bg-white text-slate-900 border-b border-slate-200 px-6 py-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.26em] text-slate-400">
                    Upload Workspace
                  </p>
                  <h3 className="mt-2 text-2xl font-semibold">
                    Upload scrum source file
                  </h3>
                  <p className="mt-2 max-w-xl text-sm text-slate-300">
                    This upload becomes the latest active dataset used for the
                    scrum manpower register.
                  </p>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10 hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="space-y-5 px-6 py-6">
              <div className="grid gap-5 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                    Upload Date
                  </label>
                  <input
                    type="date"
                    value={uploadDate}
                    onChange={(e) => setUploadDate(e.target.value)}
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 outline-none transition focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                    Uploaded By
                  </label>
                  <input
                    type="text"
                    value={uploadedBy}
                    onChange={(e) => setUploadedBy(e.target.value)}
                    placeholder="Enter person name"
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 outline-none transition focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
                  />
                </div>
              </div>

              <div className="rounded-[28px] border border-dashed border-cyan-200 bg-[linear-gradient(180deg,_#f8fdff_0%,_#f0f9ff_100%)] p-5">
                <label className="block cursor-pointer">
                  <div className="flex flex-col items-center justify-center rounded-[24px] border border-white bg-white/80 px-6 py-10 text-center shadow-sm">
                    <div className="flex h-16 w-16 items-center justify-center rounded-[22px] bg-slate-100 text-slate-700">
                      <UploadCloud size={26} />
                    </div>
                    <p className="mt-4 text-lg font-semibold text-slate-900">
                      Drop your file or browse
                    </p>
                    <p className="mt-2 text-sm text-slate-500">
                      Supports `.xlsx` and `.csv` formats only
                    </p>
                    {file ? (
                      <div className="mt-4 inline-flex items-center rounded-full bg-cyan-100 px-4 py-2 text-sm font-medium text-cyan-800">
                        {file.name}
                      </div>
                    ) : null}
                  </div>
                  <input
                    type="file"
                    onChange={(e) => setFile(e.target.files[0])}
                    className="hidden"
                  />
                </label>
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Uploaded At
                </label>
                <input
                  type="text"
                  value={new Date().toLocaleString()}
                  readOnly
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-500 outline-none"
                />
              </div>

              <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
                <button
                  onClick={() => setShowModal(false)}
                  className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpload}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(135deg,_#0891b2_0%,_#2563eb_100%)] px-5 py-3 text-sm font-semibold text-white shadow-[0_14px_35px_rgba(37,99,235,0.28)] transition hover:scale-[1.01]"
                >
                  <UploadCloud size={16} />
                  Upload File
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
