import PremiumDatePicker from "../components/PremiumDatePicker"
import axios from "axios"; 
import React, { useEffect, useMemo, useState } from "react";
import { ArrowDownToLine, Building2, CalendarDays, Clock3, FileSpreadsheet,
  Search, Sparkles, Trash2, UploadCloud, UserCheck, UserX, Users, X, } from "lucide-react";
import { authFetch, buildApiUrl } from "../lib/api";

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
  All: "bg-surface-muted text-text-secondary",
  Active: "bg-emerald-500 text-white shadow-emerald-950/20",
  Inactive: "bg-surface text-text-secondary",
};

export default function Scrum() {
  const [data, setData] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [stateFilter, setStateFilter] = useState("");
  const [vendorFilter, setVendorFilter] = useState("");
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [bulkDownloading, setBulkDownloading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [uploadDate, setUploadDate] = useState("");
  const [uploadedBy, setUploadedBy] = useState("");
  const [latestUpload, setLatestUpload] = useState(null);
  const [vendorOpen, setVendorOpen] = useState(false);
  const [selected, setSelected] = useState([]); 
  const [uploads, setUploads] = useState([]);
  const [roleSummary, setRoleSummary] = useState([]);
  const [progress, setProgress] = useState(0);
  const [processing, setProcessing] = useState(false);

  const refreshScrumData = async () => {
    const [uploadsRes, dataRes, latestRes, roleRes] = await Promise.all([
    authFetch(buildApiUrl("/api/manpower/scrum/uploads")),
    authFetch(buildApiUrl("/api/manpower/scrum")),
    authFetch(buildApiUrl("/api/manpower/scrum/latest-upload")),
    authFetch(buildApiUrl("/api/manpower/scrum/job-role-summary"))
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

  try {
    setUploading(true);
    setProgress(0);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("uploaded_at", new Date().toISOString());
    formData.append("upload_date", uploadDate);
    formData.append("uploaded_by", uploadedBy);

    const res = await axios.post(
      buildApiUrl("/api/manpower/scrum/upload"),
      formData,
      {
       onUploadProgress: (progressEvent) => {
  const percent = Math.round(
    (progressEvent.loaded * 100) / progressEvent.total
  );

  setProgress(percent);

  if (percent === 100) {
    setProcessing(true); // ✅ start processing state
  }
},
      }
    );

    if (res.data?.functionSummary) {
      localStorage.setItem(
        "scrumFunctionSummary",
        JSON.stringify(res.data.functionSummary)
      );
      window.dispatchEvent(
        new CustomEvent("scrum-manpower-updated", {
          detail: res.data.functionSummary,
        })
      );
    }

    alert(res.data.message);
    await refreshScrumData();

    setShowModal(false);
    setFile(null);
  } catch (err) {
    alert(err.response?.data?.message || "Upload failed");
  } finally {
    setUploading(false);
    setProgress(0);
  }
};

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this file?")) return;

    try {
      const res = await authFetch(buildApiUrl(`/api/manpower/upload/${id}`), {
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
    const res = await authFetch(buildApiUrl("/api/manpower/upload/bulk"), {
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

  setBulkDownloading(true);

  try {

    const res = await authFetch(
      buildApiUrl("/api/manpower/download/bulk"),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          batchIds: selected,
        }),
      }
    );

    if (!res.ok) {
      throw new Error("Download failed");
    }

    const blob = await res.blob();

    const url = window.URL.createObjectURL(blob);

    const a = document.createElement("a");

    a.href = url;
    a.download = "scrum_files.zip";

    a.click();

    window.URL.revokeObjectURL(url);

    alert("Bulk download completed successfully");

  } catch (err) {

    console.error(err);

    alert("Bulk download failed");

  } finally {

    setBulkDownloading(false);

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

const handleDownload = async (fileName) => {

  setDownloading(true);

  try {

    const response = await authFetch(
      buildApiUrl(
        `/api/manpower/download/${encodeURIComponent(fileName)}`
      )
    );

    if (!response.ok) {
      throw new Error("Download failed");
    }

    const blob = await response.blob();

    const url = window.URL.createObjectURL(blob);

    const a = document.createElement("a");

    a.href = url;
    a.download = fileName;

    document.body.appendChild(a);

    a.click();

    document.body.removeChild(a);

    window.URL.revokeObjectURL(url);

    alert("File downloaded successfully");

  } catch (error) {

    console.error(error);

    alert("Download failed");

  } finally {

    setDownloading(false);

  }
};

  return (
    <div className="min-h-screen text-text-primary">
     <div className="w-full space-y-2">  
      <section className="relative overflow-hidden rounded-[28px] border border-border-color bg-surface p-3 sm:p-4 md:rounded-[32px] md:p-5">          <div className="relative grid gap-6 xl:grid-cols-1">
            <div className="space-y-3 relative">
               <button
                onClick={() => {
                  setShowModal(true);
                  setUploadDate(new Date().toISOString().slice(0, 10));
                   }}
  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-cyan-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-cyan-700 sm:absolute sm:right-0 sm:top-0 sm:w-auto"
> 
              <UploadCloud size={16} />
               Upload Excel
              </button>
             <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.28em] text-cyan-700 dark:text-cyan-400">
                <Sparkles size={14} />
                Scrum Control Center
              </div>

              <div className="max-w-2xl">
               <h1 className="text-lg font-semibold tracking-tight text-text-primary md:text-xl leading-tight">
                  Complete visibility into scrum manpower operations
                </h1>
                <p className="mt-1 max-w-2xl text-sm leading-5 text-text-secondary">
                  Track workforce activity, refine views instantly, and manage upload history from one unified workspace.
                </p>
                
              </div>
          
              <div className="grid gap-2 sm:grid-cols-2 min-[1024px]:grid-cols-4">
                {[
                  {
                    label: "Total",
                    value: stats.total,
                    note: "Total records in current view",
                    icon: Users,
                    chip: "text-cyan-700 dark:text-cyan-400 bg-cyan-400/15",
                  },
                  {
                    label: "Active",
                    value: stats.active,
                    note: "Active workforce",
                    icon: UserCheck,
                    chip: "text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-500/15",
                  },
                  {
                    label: "Inactive",
                    value: stats.inactive,
                    note: "Inactive workforce",
                    icon: UserX,
                    chip: "text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-500/15",
                  },
                  {
                    label: "Vendor",
                    value: stats.vendors,
                    note: "Total vendors",
                    icon: Building2,
                    chip: "text-violet-700 dark:text-violet-400 bg-violet-100 dark:bg-violet-500/15",
                  },
                  
                ].map(({ label, value, note, icon: Icon, chip }) => (
                  <div
                    key={label}
                    className="rounded-[22px] bg-surface border border-border-color px-4 py-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-text-muted">
                          {label}
                        </p>
                        <p className="text-xl font-semibold text-text-primary">
                          {value}
                        </p>
                      </div>
                      <div
                        className={`flex h-8 w-8 items-center justify-center rounded-2xl ${chip}`}
                      >
                        <Icon size={14} />
                      </div>
                    </div>
                    <p className="text-sm text-text-muted">{note}</p>
                  </div>
                ))}
              </div>

{/* 

<div className="mt-2 rounded-2xl border border-border-color bg-surface px-4 py-2">
  <div className="flex items-center justify-between mb-1">
  <h3 className="text-md font-semibold">
    Job Roles
  </h3>

  <span className="rounded-full bg-blue-100 dark:bg-blue-500/15 px-3 py-1 text-xs font-semibold text-blue-700 dark:text-blue-400">
    Total: {roleSummary.reduce((sum, item) => sum + item.total, 0)}
  </span>
</div>

  <div className="grid grid-cols-1 gap-2 min-[1024px]:grid-cols-6 max-h-[120px]
   overflow-y-auto hide-scrollbar">
    {roleSummary.map((item) => (
      <div
        key={item.category}
        className="flex justify-between text-sm bg-surface-muted px-2 py-1 rounded-lg"
      >
        <span className="text-text-secondary truncate">
          {item.category}
        </span>
        <span className="font-semibold text-blue-600 dark:text-blue-400">
          {item.total}
        </span>
      </div>
    ))}
  </div>
</div>
*/}
            </div>

          
          </div>
        </section>

<section className="w-full rounded-2xl border border-border-color bg-surface px-4 py-2">
        <div className="grid gap-5 xl:grid-cols-1">
            <div className="space-y-4">
              <div className="flex flex-col gap-4 min-[1024px]:flex-row min-[1024px]:items-center
               min-[1024px]:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-text-muted">
                    Explore Workforce
                  </p>
                  <h2 className=" text-lg font-semibold text-text-primary">
                    Refine workforce view
                  </h2>
                </div>

                <div className="relative w-full min-[1024px]:max-w-sm">
                  <Search
                    size={16}
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted"
                  />
                  <input
                    type="text"
                    placeholder="Search by name, role, or ID"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="h-9 w-full rounded-2xl border border-border-color bg-surface-muted pl-10 pr-4 text-xs text-text-primary outline-none transition focus:border-cyan-400 focus:bg-surface focus:ring-4 focus:ring-cyan-100"
                  />
                </div>
              </div>
            </div>

          </div>
        </section>

      <section className="overflow-hidden rounded-[28px] border border-border-color/10 bg-surface pb-28 md:rounded-[30px] md:pb-24"> 
         <div className="border-b border-border-color bg-[linear-gradient(180deg,_#ffffff_0%,_#f8fbff_100%)] px-4 py-3 sm:px-6 sm:py-2">
            <div className="flex flex-col gap-4 min-[1024px]:flex-row min-[1024px]:items-center min-[1024px]:justify-between">
              <div>
                <h2 className="mt-1 text-lg font-semibold text-text-primary">
                  Upload history
                </h2>
                <p className="text-sm text-text-muted">
                  Track and audit all scrum file submissions.
                </p>
              </div>

              <div className="inline-flex items-center rounded-full bg-surface-muted px-4 py-2 text-sm font-medium text-text-secondary">
                {latestUploads.length} record{uploads.length === 1 ? "" : "s"}
              </div>
            </div>
          </div>

   {bulkDownloading && (
  <div className="mb-3 rounded-xl border border-blue-200 dark:border-blue-500/20 bg-blue-50 dark:bg-blue-500/10 px-4 py-3 text-sm font-medium text-blue-700 dark:text-blue-400">
    Downloading selected files...
  </div>
)}

{selected.length > 0 && (
  <div className="mb-3 flex flex-col gap-3 rounded-xl border border-border-color bg-surface-muted px-4 py-3 sm:flex-row sm:items-center sm:justify-between">

    {/* LEFT SIDE TEXT */}
    <span className="text-sm font-medium text-text-secondary">
      {selected.length} selected
    </span>

    {/* RIGHT SIDE ACTIONS */}
    <div className="flex flex-col gap-2 sm:flex-row">

      {/* DOWNLOAD BUTTON */}
     <button
  onClick={handleBulkDownload}
  disabled={bulkDownloading}
  className="w-full rounded-xl bg-blue-500 px-4 py-2 text-white sm:w-auto"
>
  {bulkDownloading
    ? "Downloading..."
    : "Download"}
</button>

      {/* DELETE BUTTON */}
      <button
        onClick={handleBulkDelete}
        className="w-full rounded-xl bg-red-500 px-4 py-2 text-white sm:w-auto"
      >
        Delete Selected
      </button>

    </div>

  </div>
)}

          {uploads.length > 0 ? (
            
            <div className="overflow-x-auto pb-2">
              <div className="mb-3 text-xs text-text-muted sm:hidden">Swipe sideways to view the full table.</div>
              {downloading && (
  <div className="mb-3 rounded-lg bg-blue-100 dark:bg-blue-500/15 p-3 text-blue-700 dark:text-blue-400">
    Downloading file...
  </div>
)}
              <table className="min-w-[860px] w-full">
               <thead>
  <tr className="border-b border-border-color bg-surface-muted/80 text-left text-xs uppercase tracking-[0.22em] text-text-muted">
    
    <th className="px-4 py-4 sm:px-6">
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

    <th className="px-4 py-4 font-medium sm:px-6">Date</th>
    <th className="px-4 py-4 font-medium sm:px-6">Uploaded By</th>
    <th className="px-4 py-4 font-medium sm:px-6">File</th>
    <th className="px-4 py-4 font-medium sm:px-6">Uploaded At</th>
    <th className="px-4 py-4 text-right font-medium sm:px-6">Actions</th>

  </tr>
</thead>
                <tbody>
                  {filteredUploads.map((item, index) => (
                    <tr
                      key={`${item.file_name}-${index}`}
                      className="border-b border-border-color text-sm text-text-secondary transition hover:bg-cyan-50 hover:dark:bg-cyan-500/10/40"
                    >
                      <td className="px-4 py-5 sm:px-6">
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
                      <td className="px-4 py-5 sm:px-6">
                        <div className="inline-flex items-center gap-3">
                          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-surface-muted text-text-secondary">
                            <CalendarDays size={16} />
                          </div>
                          <div>
                            <p className="font-medium text-text-primary">
                              {formatDate(item.manual_date)}
                            </p>
                            <p className="text-xs text-text-muted">
                              Register entry
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-5 sm:px-6">
                        <div className="inline-flex rounded-full bg-surface-muted px-3 py-2 text-sm font-medium text-text-secondary">
                          {item.uploaded_by || "--"}
                        </div>
                      </td>
                      <td className="px-4 py-5 sm:px-6">
                        <div className="flex max-w-[320px] items-center gap-3">
                          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-100 dark:bg-cyan-500/15 text-cyan-700 dark:text-cyan-400">
                            <FileSpreadsheet size={18} />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-medium text-text-primary">
                              {item.file_name}
                            </p>
                            <p className="text-xs text-text-muted">
                              Excel register file
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-5 text-text-muted sm:px-6">
                        {formatDate(item.uploaded_at)} {formatTime(item.uploaded_at)}
                      </td>
                      <td className="px-4 py-5 sm:px-6">
                       <div className="flex justify-end gap-2">

  {/* DOWNLOAD */}
 <button
  onClick={() => handleDownload(item.file_name)}
  disabled={downloading}
  className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-border-color text-text-muted hover:border-cyan-300 hover:dark:border-cyan-500/30 hover:bg-cyan-50 hover:dark:bg-cyan-500/10 hover:text-cyan-700 hover:dark:text-cyan-400"
>
  {downloading ? (
    <span className="text-[10px]">...</span>
  ) : (
    <ArrowDownToLine size={16} />
  )}
</button>

  {/* DELETE */}
  <button
    onClick={() => handleDelete(item.upload_batch_id)}
    className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-border-color text-text-muted hover:border-rose-300 hover:dark:border-rose-500/30 hover:bg-rose-50 hover:dark:bg-rose-500/10 hover:text-rose-600 hover:dark:text-rose-400"
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
              <div className="flex h-20 w-20 items-center justify-center rounded-[28px] bg-surface-muted text-text-secondary">
                <UploadCloud size={28} />
              </div>
              <h3 className="mt-6 text-2xl font-semibold text-text-primary">
                No upload records yet
              </h3>
              <p className="mt-2 max-w-md text-sm leading-6 text-text-muted">
                Once a scrum file is uploaded, the register will appear here in a
                premium tabular view.
              </p>
            </div>
          )}

          <div className="fixed bottom-0 left-0 right-0 z-50 flex flex-col gap-3 border-t border-border-color bg-surface px-4 py-3 text-sm text-text-muted md:flex-row md:items-center md:justify-between md:px-6 md:py-2 md:[left:var(--sidebar-width,280px)]">
  <div>
    Showing {latestUploads.length} of {latestUploads.length} records
  </div>

  <div className="flex items-center justify-between gap-2 sm:justify-end">
    <button className="rounded-lg border border-border-color bg-surface px-2 py-1 text-text-muted">
      Prev
    </button>

    <span className="rounded-lg bg-surface px-4 py-2 text-text-secondary">
      Page 1 of 1
    </span>

    <button className="rounded-lg  border border-border-color bg-surface px-2 py-1 text-text-muted">
      Next
    </button>
  </div>
</div>
        </section>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 px-3 sm:px-4 backdrop-blur-md">
         <div className="relative flex max-h-[82vh] w-full max-w-2xl flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,_#f8fbff_0%,_#ffffff_100%)] md:rounded-[32px]">
            <div className="bg-surface text-text-primary border-b border-border-color px-4 py-5 sm:px-6 sm:py-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  
                  <h3 className=" text-xl font-semibold">
                    Upload scrum source file
                  </h3>
                  <p className="mt-1 max-w-xl text-sm text-text-muted">
                    This upload becomes the latest active dataset used for the
                    scrum manpower register.
                  </p>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-border-color bg-surface text-text-muted transition hover:bg-surface-muted hover:text-text-primary"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5 sm:py-4">
              <div className="grid gap-5 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-text-muted">
                    Upload Date
                  </label>
                  <PremiumDatePicker
                 value={uploadDate}
                 onChange={setUploadDate}
                 className="w-full"
                 />
                </div>

                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-text-muted">
                    Uploaded By
                  </label>
                  <input
                    type="text"
                    value={uploadedBy}
                    onChange={(e) => setUploadedBy(e.target.value)}
                    placeholder="Enter person name"
                    className="h-10 w-full rounded-2xl border border-border-color bg-surface-muted px-4 text-sm text-text-primary outline-none transition focus:border-cyan-400 focus:bg-surface focus:ring-4 focus:ring-cyan-100"
                  />
                </div>
              </div>

  <div className="rounded-[22px] border border-dashed border-cyan-200 dark:border-cyan-500/20 bg-[linear-gradient(180deg,_#f8fdff_0%,_#f0f9ff_100%)] p-4">
   <div className="mb-2 flex items-center justify-between">

  <h4 className="text-sm font-semibold text-text-secondary">
    Upload File
  </h4>

  <a
    href="/formats/scrum_format.xlsx"
    download
    className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-700"
  >
    Download Format
  </a>

</div>
                <label className="block cursor-pointer">
                  <div className="flex flex-col items-center justify-center rounded-[18px] border border-white bg-surface/80 px-6 py-6 text-center shadow-sm">
                    <div className="flex h-12 w-12 items-center justify-center rounded-[22px] bg-surface-muted text-text-secondary">
                      <UploadCloud size={20} />
                    </div>
                    <p className="mt-2 text-md font-semibold text-text-primary">
                      Drop your file or browse
                    </p>
                    <p className="mt-2 text-sm text-text-muted">
                      Supports `.xlsx` and `.csv` formats only
                    </p>
                    {file ? (
                      <div className="mt-4 inline-flex items-center rounded-full bg-cyan-100 dark:bg-cyan-500/15 px-4 py-2 text-sm font-medium text-cyan-800 dark:text-cyan-300">
                        {file.name}
                      </div>
                    ) : null}
                  </div>
                  <input
                 type="file"
                   accept=".xlsx,.xls,.csv"
                  onChange={(e) => setFile(e.target.files[0])}
                   className="hidden"
                   />
                </label>
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-text-muted">
                  Uploaded At
                </label>
                <input
                  type="text"
                  value={new Date().toLocaleString()}
                  readOnly
                  className="h-10 w-full rounded-2xl border border-border-color bg-surface-muted px-4 text-sm text-text-muted outline-none"
                />
              </div>

              <div className="sticky bottom-0 flex flex-col-reverse gap-3 border-t border-border-color bg-surface pt-3 sm:flex-row sm:justify-end">
                <button
                  onClick={() => setShowModal(false)}
                  className="rounded-2xl border border-border-color px-4 py-2 text-sm font-medium text-text-secondary transition hover:bg-surface-muted"
                >
                  Cancel
                </button>
                <button
  onClick={handleUpload}
  disabled={uploading}
  className={`inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold text-white transition 
  ${uploading 
    ? "bg-gray-400 cursor-not-allowed" 
    : "bg-[linear-gradient(135deg,_#0891b2_0%,_#2563eb_100%)] hover:scale-[1.01]"
  }`}
>
  <UploadCloud size={16} />
  {uploading ? "Uploading..." : "Upload File"}
</button>

{uploading && (
  <div className="mt-4">

    {/* STATUS + % */}
    <div className="flex justify-between items-center mb-2">
      <span className={`text-xs font-semibold px-3 py-1 rounded-full
        ${progress < 100 
          ? "bg-blue-100 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400" 
          : "bg-orange-100 dark:bg-orange-500/15 text-orange-600 dark:text-orange-400"
        }`}>
        {progress < 100 ? "Uploading" : "Processing"}
      </span>

      <span className="text-xs text-text-muted">
        {progress < 100 ? `${progress}%` : ""}
      </span>
    </div>

    {/* PROGRESS BAR */}
    <div className="w-full h-2 rounded-full bg-surface-muted overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500
        bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-500"
        style={{ width: `${progress}%` }}
      />
    </div>

  </div>
)}

              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
