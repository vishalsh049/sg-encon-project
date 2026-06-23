import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { buildApiUrl } from "../lib/api";
import PremiumDatePicker from "../components/PremiumDatePicker";

function UploadReports() {
  const { siteCategory } = useParams();
  const normalizedCategory =
    siteCategory?.toLowerCase() === "fiber" ? "fiber" : "tower";
  const categoryLabel = normalizedCategory === "fiber" ? "Fiber" : "Tower";
  const accent =
    normalizedCategory === "fiber"
      ? {
          badge: "bg-emerald-50 text-emerald-700",
          button: "bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300",
          ring: "focus:border-emerald-400",
          file: "file:bg-emerald-600 hover:file:bg-emerald-700",
        }
      : {
          badge: "bg-indigo-50 text-indigo-700",
          button: "bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300",
          ring: "focus:border-indigo-400",
          file: "file:bg-indigo-600 hover:file:bg-indigo-700",
        };

  const today = useMemo(() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }, []);

  const [date, setDate] = useState(today);
  const [siteType, setSiteType] = useState("");
  const [reportType, setReportType] = useState("");
  const [files, setFiles] = useState([]);
  const [uploadedBy, setUploadedBy] = useState(
    localStorage.getItem("userName") ||
      localStorage.getItem("name") ||
      localStorage.getItem("username") ||
      ""
  );
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");
  const [duplicateDialog, setDuplicateDialog] = useState({
    open: false,
    mode: "single",
    duplicates: [],
  });
  const uploadMode = files.length > 1 ? "bulk" : "single";

  const validExtensions = ["xlsx", "xls", "xlsb", "csv"];
  const isValidFile = (f) => {
    if (!f?.name) return false;
    const ext = f.name.split(".").pop().toLowerCase();
    return validExtensions.includes(ext);
  };

  const handleFileChange = (e) => {
    const picked = Array.from(e.target.files || []);
    if (!picked.length) {
      setFiles([]);
      return;
    }
    const invalidFiles = picked.filter((item) => !isValidFile(item));
    if (invalidFiles.length) {
      setMessageType("error");
      setMessage("Invalid file type. Please upload .xlsx, .xls, .xlsb, or .csv");
      setFiles([]);
      e.target.value = "";
      return;
    }
    setMessage("");
    setFiles(picked);
  };

  const handleUpload = async () => {
    setMessage("");
    if (!siteType || !reportType) {
      setMessageType("error");
      setMessage("Please fill all required fields.");
      return;
    }
    if (uploadMode === "single" && !date) {
      setMessageType("error");
      setMessage("Please select report date.");
      return;
    }
    if (!uploadedBy.trim()) {
      setMessageType("error");
      setMessage("Please enter Uploaded By.");
      return;
    }
    if (!files.length) {
      setMessageType("error");
      setMessage("Please select a valid file to upload.");
      return;
    }

    const submitUpload = async (duplicateAction = "") => {
      const formData = new FormData();
      formData.append("siteCategory", normalizedCategory);
      if (uploadMode === "single") {
        formData.append("date", date);
      }
      formData.append("site_type", siteType);
      formData.append("report_type", reportType);
      formData.append("uploadedBy", uploadedBy.trim());
      if (duplicateAction) {
        formData.append("duplicateAction", duplicateAction);
      }
      files.forEach((file, index) => {
        formData.append(index === 0 && files.length === 1 ? "file" : "files", file);
      });

      return axios.post(buildApiUrl("/api/reports/upload"), formData);
    };
    try {
      setLoading(true);
      setDuplicateDialog({ open: false, mode: "single", duplicates: [] });
      const res = await submitUpload();
      setMessageType("success");
      setMessage(res.data?.message || "Upload completed successfully.");
      setFiles([]);
    } catch (err) {
      const duplicatePayload = err?.response?.data;
      if (err?.response?.status === 409 && duplicatePayload?.duplicate) {
        setDuplicateDialog({
          open: true,
          mode: duplicatePayload.mode || (files.length > 1 ? "bulk" : "single"),
          duplicates: duplicatePayload.duplicates || [],
        });
        return;
      }
      setMessageType("error");
      setMessage(err.response?.data?.message || "Upload failed");
    } finally {
      setLoading(false);
    }
  };

  const handleDuplicateAction = async (duplicateAction) => {
    try {
      setLoading(true);
      setMessage("");
      const formData = new FormData();
      formData.append("siteCategory", normalizedCategory);
      if (uploadMode === "single") {
        formData.append("date", date);
      }
      formData.append("site_type", siteType);
      formData.append("report_type", reportType);
      formData.append("uploadedBy", uploadedBy.trim());
      formData.append("duplicateAction", duplicateAction);
      files.forEach((fileItem, index) => {
        formData.append(index === 0 && files.length === 1 ? "file" : "files", fileItem);
      });

      const res = await axios.post(buildApiUrl("/api/reports/upload"), formData);
      setMessageType("success");
      setMessage(res.data?.message || "Upload completed successfully.");
      setFiles([]);
      setDuplicateDialog({ open: false, mode: "single", duplicates: [] });
    } catch (err) {
      setMessageType("error");
      setMessage(err.response?.data?.message || "Upload failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 w-full">
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-gray-500">
              {categoryLabel} Reports
            </div>
            <h1 className="text-xl text-gray-800">Upload Reports</h1>
          </div>
          <div
            className={`rounded-full px-3 py-1 text-xs ${accent.badge}`}
          >
            Category: {categoryLabel}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {uploadMode === "single" ? (
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-600">Date</label>
                <PremiumDatePicker
                  value={date}
                  onChange={setDate}
                  className="w-full"
                />
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-600">Bulk Upload Date</label>
                <div className="flex h-10 items-center rounded-lg border border-amber-200 bg-amber-50 px-3 text-sm text-amber-800">
                  Date is taken from each file name. Date picker is not used for bulk upload.
                </div>
              </div>
            )}

            {/* Site Type */}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-600">Site Type</label>
              <select
                value={siteType}
                onChange={(e) => setSiteType(e.target.value)}
                className={`h-10 rounded-lg border border-gray-200 px-3 text-sm text-gray-800 focus:outline-none ${accent.ring}`}
              >
                <option value="">Select Site Type</option>
                <option value="ENB">ENB</option>
                <option value="ESC">ESC</option>
                <option value="ISC">ISC</option>
                <option value="WIFI">WIFI</option>
                <option value="5G">5G</option>
              </select>
            </div>

            {/* Report Type */}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-600">Report Type</label>
              <select
                value={reportType}
                onChange={(e) => setReportType(e.target.value)}
                className={`h-10 rounded-lg border border-gray-200 px-3 text-sm text-gray-800 focus:outline-none ${accent.ring}`}
              >
                <option value="">Select Report Type</option>
                <option value="Outage">Outage Report</option>
                <option value="Performance">Performance Report</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-600">Uploaded By</label>
              <input
                value={uploadedBy}
                onChange={(e) => setUploadedBy(e.target.value)}
                className={`h-10 rounded-lg border border-gray-200 px-3 text-sm text-gray-800 focus:outline-none ${accent.ring}`}
                placeholder="Enter uploader name"
              />
            </div>

            {/* File Upload */}
            <div className="flex flex-col gap-1 md:col-span-2">
              <label className="text-xs text-gray-600">Excel Files</label>
              <div className="flex items-center gap-3 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-3">
                <input
                  type="file"
                  multiple
                  accept=".xlsx,.xls,.xlsb,.csv"
                  onChange={handleFileChange}
                  className={`block w-full text-sm text-gray-700 file:mr-4 file:rounded-md file:border-0 file:px-3 file:py-2 file:text-white ${accent.file}`}
                />
                {files.length ? (
                  <span className="text-xs text-gray-500 truncate">
                    {files.length === 1 ? files[0].name : `${files.length} files selected`}
                  </span>
                ) : null}
              </div>
              <p className="text-xs text-gray-500">
                {uploadMode === "bulk"
                  ? "Bulk upload requires each file name in the format reporttype_YYYY-MM-DD.ext."
                  : "Single upload uses the selected date and does not read the date from the file name."}
              </p>
            </div>
          </div>

          {message ? (
            <div
              className={`mt-4 rounded-lg px-3 py-2 text-sm ${
                messageType === "error"
                  ? "border border-red-200 bg-red-50 text-red-700"
                  : "border border-emerald-200 bg-emerald-50 text-emerald-700"
              }`}
            >
              {message}
            </div>
          ) : null}

          <div className="mt-5 flex justify-end">
            <button
              onClick={handleUpload}
              disabled={loading}
              className={`inline-flex items-center gap-2 rounded-lg px-5 py-2 text-sm text-white transition disabled:cursor-not-allowed ${accent.button}`}
            >
              {loading ? "Uploading..." : "Upload Reports"}
            </button>
          </div>
        </div>

        {duplicateDialog.open ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
            <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
              <h3 className="text-lg font-semibold text-gray-800">
                {duplicateDialog.mode === "bulk"
                  ? "Existing reports found"
                  : "Report already exists for this date"}
              </h3>
              <p className="mt-2 text-sm text-gray-600">
                {duplicateDialog.mode === "bulk"
                  ? "The following reports already exist. Choose how you want to continue."
                  : "A matching report already exists for the selected details."}
              </p>

              <div className="mt-4 space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
                {duplicateDialog.duplicates.map((item, index) => (
                  <div key={`${item.fileName}-${item.report_date}-${index}`} className="rounded-lg bg-white px-3 py-2 text-sm text-gray-700">
                    <div className="font-medium text-gray-800">{item.fileName}</div>
                    <div>Date: {item.report_date}</div>
                  </div>
                ))}
              </div>

              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <button
                  onClick={() => setDuplicateDialog({ open: false, mode: "single", duplicates: [] })}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700"
                >
                  Cancel
                </button>
                {duplicateDialog.mode === "bulk" ? (
                  <>
                    <button
                      onClick={() => handleDuplicateAction("skip")}
                      className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-700"
                    >
                      Skip Existing
                    </button>
                    <button
                      onClick={() => handleDuplicateAction("replace")}
                      className={`rounded-lg px-4 py-2 text-sm text-white ${accent.button}`}
                    >
                      Replace All
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => handleDuplicateAction("replace")}
                    className={`rounded-lg px-4 py-2 text-sm text-white ${accent.button}`}
                  >
                    Replace
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default UploadReports;
