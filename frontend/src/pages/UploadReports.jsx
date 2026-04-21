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
  const [uploadType, setUploadType] = useState("single");
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");

  const validExtensions = ["xlsx", "xls", "xlsb", "csv"];
  const isValidFile = (f) => {
    if (!f?.name) return false;
    const ext = f.name.split(".").pop().toLowerCase();
    return validExtensions.includes(ext);
  };

  const handleFileChange = (e) => {
    const picked = e.target.files?.[0] || null;
    if (!picked) {
      setFile(null);
      return;
    }
    if (!isValidFile(picked)) {
      setMessageType("error");
      setMessage("Invalid file type. Please upload .xlsx, .xls, .xlsb, or .csv");
      setFile(null);
      e.target.value = "";
      return;
    }
    setMessage("");
    setFile(picked);
  };

  const handleUpload = async () => {
    setMessage("");
    if (!date || !siteType || !reportType || !uploadType) {
      setMessageType("error");
      setMessage("Please fill all required fields.");
      return;
    }
    if (!file) {
      setMessageType("error");
      setMessage("Please select a valid file to upload.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("siteCategory", normalizedCategory);
    formData.append("date", date);
    formData.append("site_type", siteType);
    formData.append("report_type", reportType);
    formData.append("upload_type", uploadType);

    try {
      setLoading(true);

      const res = await axios.post(buildApiUrl("/api/reports/upload"), formData);
      setMessageType("success");
      setMessage(res.data?.message || "Upload completed successfully.");
      setFile(null);
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
            {/* Date */}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-600">Date</label>
              <PremiumDatePicker
                value={date}
                onChange={setDate}
                className="w-full"
              />
            </div>

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

            {/* Upload Type */}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-600">Upload Type</label>
              <div className="flex items-center gap-4 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="uploadType"
                    value="single"
                    checked={uploadType === "single"}
                    onChange={(e) => setUploadType(e.target.value)}
                    className={normalizedCategory === "fiber" ? "text-emerald-600" : "text-indigo-600"}
                  />
                  Single Upload
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="uploadType"
                    value="bulk"
                    checked={uploadType === "bulk"}
                    onChange={(e) => setUploadType(e.target.value)}
                    className={normalizedCategory === "fiber" ? "text-emerald-600" : "text-indigo-600"}
                  />
                  Bulk Upload
                </label>
              </div>
            </div>

            {/* File Upload */}
            <div className="flex flex-col gap-1 md:col-span-2">
              <label className="text-xs text-gray-600">Excel File</label>
              <div className="flex items-center gap-3 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-3">
                <input
                  type="file"
                  accept=".xlsx,.xls,.xlsb,.csv"
                  onChange={handleFileChange}
                  className={`block w-full text-sm text-gray-700 file:mr-4 file:rounded-md file:border-0 file:px-3 file:py-2 file:text-white ${accent.file}`}
                />
                {file ? (
                  <span className="text-xs text-gray-500 truncate">
                    {file.name}
                  </span>
                ) : null}
              </div>
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
      </div>
    </div>
  );
}

export default UploadReports;
