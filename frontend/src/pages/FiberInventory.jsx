import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Download, FileSpreadsheet, Pencil, Plus, Trash2, Upload, X } from "lucide-react";
import axios from "axios";
import Card from "../components/Card";
import { buildApiUrl } from "../lib/api";
import PremiumDatePicker from "../components/PremiumDatePicker";

const MotionDiv = motion.div;

const cardConfig = [
  { title: "Intercity", key: "Intercity", tone: "blue" },
  { title: "Intracity", key: "Intracity", tone: "green" },
  { title: "FTTx", key: "FTTx", tone: "gray" },
];

function formatDate(value) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return "-";
  return parsed.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(value) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return "-";
  return parsed.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function FiberInventory() {
  const [summary, setSummary] = useState({
    latestUpload: null,
    cards: [],
  });
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [uploadsLoading, setUploadsLoading] = useState(true);
  const [error, setError] = useState("");
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [uploadForm, setUploadForm] = useState({
    date: "",
    uploadedBy: "",
    file: null,
  });
  const [editForm, setEditForm] = useState({
  
    id: "",
    date: "",
    uploadedBy: "",
  });
  const [allUploads, setAllUploads] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  
  const fetchSummary = async () => {
    setSummaryLoading(true);
    setError("");

    try {
      const response = await axios.get(buildApiUrl("/api/fiber/summary"));
      setSummary(
        response.data || {
          latestUpload: null,
          cards: [],
        }
      );
    } catch (err) {
      setError(err?.response?.data?.message || "Unable to load fiber inventory.");
    } finally {
      setSummaryLoading(false);
    }
  };

const fetchUploads = async () => {
  setUploadsLoading(true);
  try {
    const res = await axios.get(buildApiUrl("/api/fiber/uploads"));
    setAllUploads(res.data || []);
  } catch (err) {
    console.error(err);
  } finally {
    setUploadsLoading(false);
  }
};

 useEffect(() => {
  fetchSummary();
  fetchUploads();
}, []);

useEffect(() => {
  if (showUploadModal || showEditModal) {
    document.body.style.overflow = "hidden";
  } else {
    document.body.style.overflow = "auto";
  }

  return () => {
    document.body.style.overflow = "auto";
  };
}, [showUploadModal, showEditModal]);

  const cardValues = useMemo(() => {
    const map = new Map(
      (summary.cards || []).map((item) => [String(item.fiberType || ""), item])
    );

    return cardConfig.map((card) => {
      const current = map.get(card.key);
      return {
        ...card,
        aerial: Number(current?.aerial || 0),
        ug: Number(current?.ug || 0),
      };
    });
  }, [summary.cards]);

  const uploadTimestampPreview = formatDateTime(new Date());

  const closeUploadModal = () => {
    setShowUploadModal(false);
    setUploadForm({ date: "", uploadedBy: "", file: null });
    setSaveError("");
  };

  const closeEditModal = () => {
    setShowEditModal(false);
    setEditForm({ id: "", date: "", uploadedBy: "" });
    setSaveError("");
  };

  const handleUpload = async (event) => {
    event.preventDefault();
    setSaving(true);
    setSaveError("");

    try {
      const formData = new FormData();
      formData.append("date", uploadForm.date);
      formData.append("uploadedBy", uploadForm.uploadedBy);
      formData.append("file", uploadForm.file);

      await axios.post(buildApiUrl("/api/fiber/uploads"), formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      closeUploadModal();
      await fetchSummary();
      await fetchUploads(); 
    } catch (err) {
      setSaveError(err?.response?.data?.message || "Failed to upload fiber file.");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setSaveError("");

    try {
      await axios.put(buildApiUrl(`/api/fiber/uploads/${editForm.id}`), {
        date: editForm.date,
        uploadedBy: editForm.uploadedBy,
      });

      closeEditModal();
      await fetchSummary();
      fetchUploads();
    } catch (err) {
      setSaveError(err?.response?.data?.message || "Failed to update upload.");
    } finally {
      setSaving(false);
    }
  };

 const handleDelete = async (uploadId) => {
  const confirmed = window.confirm(
    "Delete this upload and all of its fiber data?"
  );

  if (!confirmed) return;

  try {
    const res = await axios.delete(
      buildApiUrl(`/api/fiber/uploads/${uploadId}`)
    );

    alert(res?.data?.message || "Deleted successfully");

    await fetchSummary();
    await fetchUploads();  // refresh UI
  } catch (err) {
    console.error(err);
    alert(err?.response?.data?.message || "Delete failed");
  }
};

  return (
    <div className="relative max-w-full">
      <div className="pointer-events-none absolute -right-24 top-16 h-64 w-64 rounded-full  blur-3xl" />

      <div className={`relative flex min-w-0 h-full flex-col gap-6 ${showUploadModal ? "blur-sm" : ""}`}>
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-[-0.05em] text-slate-900 md:text-[1.6rem]">
                Fiber Inventory
              </h1>
              <p className="max-w-3xl text-sm text-slate-500 md:text-[15px]">
                Each card uses the newest upload for that fiber segment, so FTTx
                uploads do not replace Intercity or Intracity totals.
              </p>
            </div>

      <button
        type="button"
        onClick={() => {
            setSaveError("");
              setShowUploadModal(true);
            }}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-500 px-6 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(59,130,246,0.35)] transition hover:-translate-y-1 hover:shadow-[0_20px_40px_rgba(59,130,246,0.45)]"
          >
            <Plus size={16} />
            Add Upload
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          {cardValues.map((card) => (
            <Card
              key={card.key}
              title={card.title}
              aerialCount={summaryLoading ? "..." : card.aerial}
              ugCount={summaryLoading ? "..." : card.ug}
              tone={card.tone}
            />
          ))}
        </div>


  <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] border border-slate-200/60 bg-white/80 backdrop-blur-xl shadow-[0_20px_50px_rgba(0,0,0,0.06)]">
   <div className="flex items-center justify-between border-b border-slate-200/80 px-6 py-5">

    <div>
     <h2 className="text-lg font-semibold tracking-[-0.03em] text-slate-900">
       Upload History
     </h2>
     <p className="mt-1 text-sm text-slate-500">
        Uploads are stored separately, and each dashboard card resolves its own
        latest matching upload.
      </p>
     </div>

     <div className="flex gap-2">
  <button
    onClick={async () => {
      if (!selectedIds.length) return alert("Select items first");

      await Promise.all(
        selectedIds.map((id) =>
          axios.delete(buildApiUrl(`/api/fiber/uploads/${id}`))
        )
      );

      alert("Deleted selected");
      setSelectedIds([]);
      fetchSummary();
      fetchUploads(); 
    }}
    className="px-3 py-2 text-xs bg-red-100 text-red-700 rounded-lg"
  >
    Delete Selected
  </button>

  <button
    onClick={async () => {
  if (!selectedIds.length) return alert("Select items first");

  try {
    const response = await axios.post(
      buildApiUrl("/api/fiber/uploads/download-zip"),
      { ids: selectedIds },
      { responseType: "blob" }
    );

    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement("a");

    link.href = url;
    link.setAttribute("download", "fiber-files.zip");
    document.body.appendChild(link);
    link.click();
    link.remove();
  } catch (err) {
    console.error(err);
    alert("Download failed");
  }
}}
    className="px-3 py-2 text-xs bg-blue-100 text-blue-700 rounded-lg"
  >
    Download Selected
  </button>
</div>
     </div>

       {error ? (
       <div className="m-6 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
        {error}
        </div>
      ) : null}

      <div className="min-h-0 w-full max-w-full flex-1 overflow-y-auto overflow-x-hidden">
       <table className="w-full border-separate border-spacing-0 text-sm text-slate-600">
        <thead className="sticky top-0 z-10 bg-white/95 backdrop-blur-xl">
  <tr>
    {/* SELECT ALL CHECKBOX */}
    <th className="px-6 py-4">
      <input
        type="checkbox"
        className="h-4 w-4 rounded-md border-slate-300 text-blue-600"
        checked={
          allUploads.length > 0 &&
          selectedIds.length === allUploads.length
        }
        onChange={(e) => {
          if (e.target.checked) {
            setSelectedIds(allUploads.map((item) => item.id));
          } else {
            setSelectedIds([]);
          }
        }}
      />
    </th>

    {/* HEADERS */}
    <th className="px-6 py-4 text-[11px] font-semibold uppercase text-slate-400">Date</th>
    <th className="px-6 py-4 text-[11px] font-semibold uppercase text-slate-400">Uploaded By</th>
    <th className="px-6 py-4 text-[11px] font-semibold uppercase text-slate-400">Scope</th>
    <th className="px-6 py-4 text-[11px] font-semibold uppercase text-slate-400">Uploaded At</th>
    <th className="px-6 py-4 text-[11px] font-semibold uppercase text-slate-400">File Name</th>
    <th className="px-6 py-4 text-[11px] font-semibold uppercase text-slate-400">Actions</th>
  </tr>
</thead>
      <tbody>
    {!uploadsLoading && allUploads.length === 0 ? (      <tr>
       <td
        colSpan={7}
      className="px-6 py-16 text-center text-sm text-slate-500"
        >
        No fiber uploads found. Add an Excel or CSV file to start the
        latest-date dashboard.
          </td>
        </tr>
        ) : null}

      {allUploads.map((item) => (
       <tr key={item.id} className="group transition hover:bg-slate-50/70">
       <td className="px-6 py-4">
  <input
  type="checkbox"
  className="h-4 w-4 rounded-md border-slate-300 text-blue-600"
  checked={selectedIds.includes(item.id)}
  onChange={() => {
    setSelectedIds((prev) => {
      if (prev.includes(item.id)) {
        return prev.filter((i) => i !== item.id);
      } else {
        return [...prev, item.id];
      }
    });
  }}
/>
</td>
     <td className="border-b border-slate-100 px-6 py-4 font-medium text-slate-800 transition duration-150 group-hover:bg-slate-50/90">
     {formatDate(item.date)}
       </td>
        <td className="border-b border-slate-100 px-6 py-4 transition duration-150 group-hover:bg-slate-50/90">
        {item.uploaded_by}
          </td>
        <td className="border-b border-slate-100 px-6 py-4 transition duration-150 group-hover:bg-slate-50/90">
        <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
          {item.upload_scope || "Unknown"}
        </span>
          </td>
        <td className="border-b border-slate-100 px-6 py-4 transition duration-150 group-hover:bg-slate-50/90">
          {formatDateTime(item.uploaded_at)}
        </td>
           <td className="border-b border-slate-100 px-6 py-4 transition duration-150 group-hover:bg-slate-50/90">
          <div className="flex items-center gap-2">
           <FileSpreadsheet size={16} className="text-slate-400" />
          <span className="max-w-[260px] truncate font-medium text-slate-700">{item.file_name}</span>
         </div>
        </td>
        <td className="border-b border-slate-100 px-6 py-4 transition duration-150 group-hover:bg-slate-50/90">
     <div className="flex flex-wrap gap-2">
      <a href={buildApiUrl(`/api/fiber/uploads/${item.id}/download`)}
       className="p-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition"
      >
         <Download size={14} />
               </a>
                        <button
                          type="button"
                          onClick={() => {
                            setSaveError("");
                            setEditForm({
                              id: item.id,
                              date: item.date?.slice?.(0, 10) || "",
                              uploadedBy: item.uploaded_by || "",
                            });
                            setShowEditModal(true);
                          }}
                       className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 transition"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(item.id)}
                         className="p-2 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 transition"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                  
                  
                ))}

                {uploadsLoading
                  ? Array.from({ length: 1 }).map((_, index) => (
                      <tr key={`skeleton-${index}`}>
                        {Array.from({ length: 7 }).map((__, cellIndex) => (
                          <td
                            key={`cell-${cellIndex}`}
                            className="border-b border-slate-100 px-6 py-4"
                          >
                            <div className="h-4 animate-pulse rounded-full bg-slate-100" />
                          </td>
                        ))}
                      </tr>
                    ))
                  : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showUploadModal ? (
          <>
            <MotionDiv
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[9999] bg-black/40 backdrop-blur-sm"
              onClick={closeUploadModal}
            />
            <MotionDiv
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
              onClick={closeUploadModal}
            >
              <div
                className="w-full max-w-xl rounded-3xl bg-white/95 p-8 shadow-2xl backdrop-blur-xl"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900">Upload Fiber File</h2>
                    <p className="mt-1 text-sm text-slate-500">
                      This upload becomes active only for the fiber segments found in
                      the file when its date is the newest for those segments.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={closeUploadModal}
                    className="rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                  >
                    <X size={18} />
                  </button>
                </div>

                {saveError ? (
                  <div className="mt-4 rounded-xl border border-rose-200/60 bg-rose-50/80 px-4 py-3 text-sm text-rose-800">
                    {saveError}
                  </div>
                ) : null}

                <form onSubmit={handleUpload} className="mt-8 space-y-6">
                  <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700">
                        Date
                      </label>
                      <PremiumDatePicker
                        value={uploadForm.date}
                        onChange={(nextValue) =>
                          setUploadForm((prev) => ({ ...prev, date: nextValue }))
                        }
                        className="w-full"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700">
                        Uploaded By
                      </label>
                      <input
                        required
                        type="text"
                        value={uploadForm.uploadedBy}
                        onChange={(event) =>
                          setUploadForm((prev) => ({
                            ...prev,
                            uploadedBy: event.target.value,
                          }))
                        }
                        placeholder="Enter person name"
                        className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      Upload File
                    </label>
                    <label className="flex cursor-pointer items-center justify-between rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 px-4 py-4 transition hover:border-blue-300 hover:bg-blue-50/60">
                      <div className="flex items-center gap-3">
                        <Upload size={18} className="text-blue-500" />
                        <div>
                          <p className="text-sm font-medium text-slate-700">
                            {uploadForm.file ? uploadForm.file.name : "Choose .xlsx or .csv file"}
                          </p>
                          <p className="text-xs text-slate-500">
                            Excel and CSV files only
                          </p>
                        </div>
                      </div>
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm">
                        Browse
                      </span>
                      <input
                        required
                        type="file"
                        accept=".xlsx,.csv"
                        className="hidden"
                        onChange={(event) =>
                          setUploadForm((prev) => ({
                            ...prev,
                            file: event.target.files?.[0] || null,
                          }))
                        }
                      />
                    </label>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      Uploaded At
                    </label>
                    <input
                      value={uploadTimestampPreview}
                      disabled
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500 shadow-sm"
                    />
                  </div>

                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={closeUploadModal}
                      disabled={saving}
                      className="flex-1 rounded-xl border border-slate-200 px-6 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      className="flex-1 rounded-xl bg-gradient-to-r from-blue-600 to-sky-500 px-6 py-3 text-sm font-medium text-white shadow-lg transition hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {saving ? "Uploading..." : "Upload File"}
                    </button>
                  </div>
                </form>
              </div>
            </MotionDiv>
          </>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {showEditModal ? (
          <>
            <MotionDiv
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-sm"
              onClick={closeEditModal}
            />
            <MotionDiv
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              onClick={closeEditModal}
            >
              <div
                className="w-full max-w-lg rounded-3xl bg-white/95 p-8 shadow-2xl backdrop-blur-xl"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900">Edit Upload</h2>
                    <p className="mt-1 text-sm text-slate-500">
                      Update the upload date or uploaded-by name for this dataset.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={closeEditModal}
                    className="rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                  >
                    <X size={18} />
                  </button>
                </div>

                {saveError ? (
                  <div className="mt-4 rounded-xl border border-rose-200/60 bg-rose-50/80 px-4 py-3 text-sm text-rose-800">
                    {saveError}
                  </div>
                ) : null}

                <form onSubmit={handleEdit} className="mt-8 space-y-6">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      Date
                    </label>
                    <PremiumDatePicker
                      value={editForm.date}
                      onChange={(nextValue) =>
                        setEditForm((prev) => ({ ...prev, date: nextValue }))
                      }
                      className="w-full"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      Uploaded By
                    </label>
                    <input
                      required
                      type="text"
                      value={editForm.uploadedBy}
                      onChange={(event) =>
                        setEditForm((prev) => ({
                          ...prev,
                          uploadedBy: event.target.value,
                        }))
                      }
                      className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                    />
                  </div>

                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={closeEditModal}
                      disabled={saving}
                      className="flex-1 rounded-xl border border-slate-200 px-6 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      className="flex-1 rounded-xl bg-gradient-to-r from-blue-600 to-sky-500 px-6 py-3 text-sm font-medium text-white shadow-lg transition hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {saving ? "Saving..." : "Save Changes"}
                    </button>
                  </div>
                </form>
              </div>
            </MotionDiv>
          </>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export default FiberInventory;
