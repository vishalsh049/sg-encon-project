  import { Fragment, useEffect, useMemo, useState } from "react";
  import axios from "axios";
  import toast from "react-hot-toast";

  import {
    Plus,
    Pencil,
    Trash2,
    Search,
    Download,
    Upload,
    Users,
    Briefcase,
    Wifi,
    ShieldCheck,
    Activity,
    Bell,
    ClipboardList,
    History,
    X,
  } from "lucide-react";
  import { getUserCircle } from "../utils/auth";

  import { buildApiUrl } from "../lib/api";
  import * as XLSX from "xlsx";

  const initialForm = {
    circle: "",
    cmp: "",
    state_leadership_team: "",
    noc_executive: "",
    analyst: "",
    technician: "",
    rigger: "",
    utility_supervisor: "",
    splicer: "",
    assistant_splicer: "",
    patroller: "",
    fiber_supervisor: "",
    fttx_splicer: "",
    fttx_assistant_splicer: "",
    fttx_supervisor: "",
    fttx_helper: "",
    isp_engineer: "",
    wh_incharge_cum_security: "",
    fttx_engineer: "",
    fttx_technician: "",
    cmp_lead: "",
    fiber_helper: "",
    fibre_engineer: "",
    utility_engineer: "",
  };

  const circleCMPMap = {

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

  const PENDING_FIELD_GROUPS = [
    {
      label: "Admin",
      color: "blue",
      fields: [
        { key: "state_leadership_team", label: "State Leadership Team" },
        { key: "noc_executive", label: "NOC Executive" },
        { key: "analyst", label: "Analyst" },
        { key: "cmp_lead", label: "CMP Lead" },
      ],
    },
    {
      label: "Utility & ISP",
      color: "orange",
      fields: [
        { key: "technician", label: "Technician" },
        { key: "rigger", label: "Rigger" },
        { key: "utility_supervisor", label: "Utility Supervisor" },
        { key: "utility_engineer", label: "Utility Engineer" },
        { key: "isp_engineer", label: "ISP Engineer" },
        { key: "wh_incharge_cum_security", label: "WH Incharge" },
      ],
    },
    {
      label: "Fiber",
      color: "violet",
      fields: [
        { key: "splicer", label: "Splicer" },
        { key: "assistant_splicer", label: "Assistant Splicer" },
        { key: "fiber_helper", label: "Fiber Helper" },
        { key: "patroller", label: "Patroller" },
        { key: "fiber_supervisor", label: "Fiber Supervisor" },
        { key: "fibre_engineer", label: "Fibre Engineer" },
      ],
    },
    {
      label: "FTTX",
      color: "pink",
      fields: [
        { key: "fttx_splicer", label: "FTTX Splicer" },
        { key: "fttx_assistant_splicer", label: "FTTX Assistant Splicer" },
        { key: "fttx_supervisor", label: "FTTX Supervisor" },
        { key: "fttx_helper", label: "FTTX Helper" },
      ],
    },
    {
      label: "FTTX PO Based",
      color: "green",
      fields: [
        { key: "fttx_engineer", label: "FTTX Engineer" },
        { key: "fttx_technician", label: "FTTX Technician" },
      ],
    },
  ];

  const KPI_COLOR_CLASSES = {
    blue: "bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400",
    green: "bg-green-100 text-green-600 dark:bg-green-500/15 dark:text-green-400",
    violet: "bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400",
    orange: "bg-orange-100 text-orange-600 dark:bg-orange-500/15 dark:text-orange-400",
    pink: "bg-pink-100 text-pink-600 dark:bg-pink-500/15 dark:text-pink-400",
  };

  function formatDateTime(value) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function NumberField({ label, value, onChange }) {
    return (
      <div className="mb-2">
        <label className="mb-1 block text-[11px] font-medium text-text-muted">
          {label}
        </label>
        <input
          type="number"
          min="0"
          placeholder="0"
          value={value}
          onChange={onChange}
          className="h-9 w-full rounded-xl border border-border-color bg-surface px-4 text-sm outline-none transition-colors focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
        />
      </div>
    );
  }

  function Signoff() {

    const [rows, setRows] = useState([]);
    const [search, setSearch] =
      useState("");

    const [modalOpen, setModalOpen] =
      useState(false);

    const [editingId, setEditingId] =
      useState(null);

    const [form, setForm] =
      useState(initialForm);

      const [errors, setErrors] =
    useState({});

    const headers = useMemo(
      () => ({
        Authorization: `Bearer ${localStorage.getItem(
          "token"
        )}`,
      }),
      []
    );

  const loadData = async () => {

    setLoadingTable(true);

    try {

      const res = await axios.get(
        buildApiUrl("/api/signoff"),
        { headers }
      );

      setRows(res.data?.rows || []);

    } catch (error) {

      console.error(error);

      toast.error(
        "Failed to load data"
      );
    } finally {

      setLoadingTable(false);
    }
  };

  const loadPendingCount = async () => {

    try {

      const res = await axios.get(
        buildApiUrl("/api/signoff/request-count"),
        { headers }
      );

      setPendingCount(
        res.data.count || 0
      );

    } catch (error) {

      console.error(
        "Pending count error",
        error
      );

    }

  };

  const loadPendingRequests = async () => {

    setLoadingPending(true);

    try {

      const res = await axios.get(
        buildApiUrl("/api/signoff/pending-requests"),
        { headers }
      );

  setPendingRequests(
    res.data?.rows || []
  );

    } catch (error) {

      console.error(error);

      toast.error(
        "Failed to load requests"
      );

    } finally {

      setLoadingPending(false);
    }

  };

  const loadMyRequests = async () => {

    setLoadingMyRequests(true);

    try {

      const res = await axios.get(
        buildApiUrl("/api/signoff/my-requests"),
        { headers }
      );

      setMyRequests(
        res.data?.rows || []
      );

    } catch (error) {

      console.error(error);

      toast.error(
        "Failed to load your requests"
      );

    } finally {

      setLoadingMyRequests(false);
    }

  };

  const [selectedCircle, setSelectedCircle] =
    useState("");

  const [selectedCMP, setSelectedCMP] =
    useState("");

  const [pendingCount, setPendingCount] =
    useState(0);

    const [approvalModalOpen, setApprovalModalOpen] =
    useState(false);

  const [pendingRequests, setPendingRequests] =
    useState([]);

  const [uploading, setUploading] =
    useState(false);

  const [saving, setSaving] =
    useState(false);

  const [loadingTable, setLoadingTable] =
    useState(true);

  const [loadingPending, setLoadingPending] =
    useState(false);

  const [actioningId, setActioningId] =
    useState(null);

  const [myRequests, setMyRequests] =
    useState([]);

  const [loadingMyRequests, setLoadingMyRequests] =
    useState(false);

  const [myRequestsModalOpen, setMyRequestsModalOpen] =
    useState(false);

  const [confirmDialog, setConfirmDialog] =
    useState(null);

  const [remarksInput, setRemarksInput] =
    useState("");

  const userCircle = getUserCircle();

  useEffect(() => {

    loadData();

    if (
      userCircle
        ?.trim()
        ?.toUpperCase() === "ALL"
    ) {

      loadPendingCount();

    } else {

      loadMyRequests();

    }

  }, []);

    /* KPI CARDS DATA */

  const totalCircles =
    [...new Set(rows.map((r) => r.circle))]
      .filter(Boolean).length;

  const totalCMPs =
    [...new Set(rows.map((r) => r.cmp))]
      .filter(Boolean).length;

  const totalWorkforce = rows.reduce(
    (sum, row) =>
      sum +
      Number(row.state_leadership_team || 0) +
      Number(row.noc_executive || 0) +
      Number(row.analyst || 0) +
      Number(row.cmp_lead || 0) +
      Number(row.technician || 0) +
      Number(row.rigger || 0) +
      Number(row.utility_supervisor || 0) +
      Number(row.utility_engineer || 0) +
      Number(row.isp_engineer || 0) +
      Number(row.wh_incharge_cum_security || 0) +
      Number(row.splicer || 0) +
      Number(row.assistant_splicer || 0) +
      Number(row.fiber_helper || 0) +
      Number(row.patroller || 0) +
      Number(row.fiber_supervisor || 0) +
      Number(row.fibre_engineer || 0) +
      Number(row.fttx_splicer || 0) +
      Number(row.fttx_assistant_splicer || 0) +
      Number(row.fttx_supervisor || 0) +
      Number(row.fttx_helper || 0) +
      Number(row.fttx_engineer || 0) +
      Number(row.fttx_technician || 0),
    0
  );

  const totalISP = rows.reduce(
    (sum, row) =>
      sum + Number(row.isp_engineer || 0),
    0
  );

  const totalUtility = rows.reduce(
    (sum, row) =>
      sum +
      Number(row.utility_supervisor || 0) +
      Number(row.utility_engineer || 0),
    0
  );

    const filteredRows = rows.filter((row) => {

    const searchValue = search.toLowerCase();

    const matchSearch =
      !search ||
      Object.values(row).some((value) =>
        String(value)
          .toLowerCase()
          .includes(searchValue)
      );

  const normalizeCircle = (value) => {

    const normalized = value
      ?.trim()
      ?.toLowerCase();

    if (
      normalized === "Uttar Pradesh (East)" ||
      normalized === "Up East"
    ) {
      return "upeast";
    }

    return normalized
      ?.replace(/\s+/g, "");

  };

  const matchCircle =
    !selectedCircle ||
    normalizeCircle(row.circle) ===
      normalizeCircle(selectedCircle);

    const matchCMP =
      !selectedCMP ||
      row.cmp === selectedCMP;

    return (
      matchSearch &&
      matchCircle &&
      matchCMP
    );
  });

  const normalizeCircleName = (value) => {

    const normalized = value
      ?.trim()
      ?.toLowerCase();

    if (
      normalized === "Uttar Pradesh (East)" ||
      normalized === "Up East"
    ) {
      return "UP East";
    }

    return value;

  };

  const groupedRows = Object.entries(
    filteredRows.reduce((acc, row) => {

      const normalizedCircle =
        normalizeCircleName(
          row.circle
        );

      if (!acc[normalizedCircle]) {
        acc[normalizedCircle] = [];
      }

      acc[normalizedCircle].push({
        ...row,
        circle: normalizedCircle,
      });

      return acc;

    }, {})
  );

  const VALID_CIRCLES = [
    "Punjab",
    "Delhi",
    "Haryana",
    "UP East",
  ];

  const VALID_CMPS = [
    "Delhi SHQ",
    "Haryana SHQ",
    "Punjab SHQ",
    "UP East SHQ",

    "Delhi-1 (West)",
    "Delhi-2 (South)",
    "Delhi-3 (Central-East)",
    "Delhi-4 (North)",
    "Faridabad (NCR)",
    "Ghaziabad (NCR)",
    "Gurgaon (NCR)",
    "Noida (NCR)",

    "Ambala",
    "Hissar",
    "Karnal",
    "Panipat",
    "Palwal",
    "Rewari",
    "Rohtak",

    "Amritsar",
    "Bathinda",
    "Chandigarh",
    "Jalandhar",
    "Ludhiana-1",
    "Ludhiana-2",
    "Pathankot",
    "Patiala",
    "Sangrur",

    "Allahabad",
    "Azamgarh",
    "Faizabad",
    "Gorakhpur",
    "Raibareilly",
    "Varanasi",
  ];

    const handleExcelUpload = async (e) => {

    const file = e.target.files[0];
    const fileInput = e.target;

    if (!file) return;
    setUploading(true);

  toast.loading(
    "Uploading Excel file...",
    {
      id: "uploadExcel",
    }
  );

    const data =
      await file.arrayBuffer();

    const workbook =
      XLSX.read(data);

    const sheet =
      workbook.Sheets[
        workbook.SheetNames[0]
      ];

  const jsonData =
    XLSX.utils.sheet_to_json(sheet);

  const normalizedData =
    jsonData.map((row) => {

      const cleanRow = {};

      Object.keys(row).forEach((key) => {

        cleanRow[
          key
            .trim()
            .toLowerCase()
            .replace(/\s+/g, "_")
        ] = row[key];

      });

      return cleanRow;
    });

  const invalidRows = [];

  normalizedData.forEach((row, index) => {

    const circle = String(
      row.circle || ""
    ).trim();

    const cmp = String(
      row.cmp || ""
    ).trim();

    if (
      !VALID_CIRCLES.includes(circle)
    ) {

      invalidRows.push(
        `Row ${index + 2}: Invalid Circle -> ${circle}`
      );

    }

    if (
      !VALID_CMPS.includes(cmp)
    ) {

      invalidRows.push(
        `Row ${index + 2}: Invalid CMP -> ${cmp}`
      );

    }

  });

  if (invalidRows.length > 0) {

    toast.error(
      invalidRows[0],
      { id: "uploadExcel" }
    );

    console.log(
      "Invalid Rows:",
      invalidRows
    );

    setUploading(false);
    fileInput.value = "";

    return;
  }

    const formattedData =
      normalizedData.map((row, index) => ({
        id: index + 1,

        circle:
    row.circle || "",

  cmp:
    row.cmp || "",

  state_leadership_team:
    Number(row.state_leadership_team) || 0,

  noc_executive:
    Number(row.noc_executive) || 0,

  analyst:
    Number(row.analyst) || 0,

  cmp_lead:
    Number(row.cmp_lead) || 0,

  technician:
    Number(row.technician) || 0,

  rigger:
    Number(row.rigger) || 0,

  utility_supervisor:
    Number(row.utility_supervisor) || 0,

  utility_engineer:
    Number(row.utility_engineer) || 0,

  isp_engineer:
    Number(row.isp_engineer) || 0,

  wh_incharge_cum_security:
    Number(row.wh_incharge_cum_security) || 0,

  splicer:
    Number(row.splicer) || 0,

  assistant_splicer:
    Number(row.assistant_splicer) || 0,

  fiber_helper:
    Number(row.fiber_helper) || 0,

  patroller:
    Number(row.patroller) || 0,

  fiber_supervisor:
    Number(row.fiber_supervisor) || 0,

  fibre_engineer:
    Number(row.fibre_engineer) || 0,

  fttx_splicer:
    Number(row.fttx_splicer) || 0,

  fttx_assistant_splicer:
    Number(row.fttx_assistant_splicer) || 0,

  fttx_supervisor:
    Number(row.fttx_supervisor) || 0,

  fttx_helper:
    Number(row.fttx_helper) || 0,

  fttx_engineer:
    Number(row.fttx_engineer) || 0,

  fttx_technician:
    Number(row.fttx_technician) || 0,

      }));

    try {

 await axios.post(
  buildApiUrl("/api/signoff/bulk"),
  formattedData,
  { headers }
);

  toast.success(
    "Excel uploaded successfully",
    {
      id: "uploadExcel",
    }
  );

    loadData();

  } catch (error) {

    console.error(error);

    toast.error(
    "Excel upload failed",
    {
      id: "uploadExcel",
    }
  );
  } finally {

    setUploading(false);
    fileInput.value = "";
  }
  };

    const openAdd = () => {
      setEditingId(null);

      setForm(initialForm);

      setErrors({});

      setModalOpen(true);
    };

    const openEdit = (row) => {

      setEditingId(row.id);

      setForm({
        ...initialForm,
        ...row,
      });

      setErrors({});

      setModalOpen(true);
    };

    const saveData = async () => {

      try {

  const newErrors = {};

  if (!form.circle) {
    newErrors.circle =
      "Please select Circle";
  }

  if (!form.cmp) {
    newErrors.cmp =
      "Please select CMP";
  }

  setErrors(newErrors);

  if (
    Object.keys(newErrors).length > 0
  ) {
    toast.error("Please fix the highlighted fields");
    return;
  }

  setSaving(true);

    const response = await axios.post(
    buildApiUrl("/api/signoff/request"),
    {
      ...form,

      request_type: editingId
        ? "UPDATE"
        : "CREATE",

      signoff_id: editingId || null,

      status: "PENDING",
    },
    { headers }
  );

  console.log("API RESPONSE", response.data);

  toast.success(
    "Your request has been sent for approval"
  );

    setModalOpen(false);

  setForm(initialForm);

  if (userCircle?.trim()?.toUpperCase() !== "ALL") {
    loadMyRequests();
  }

      } catch {

        toast.error(
    "Request submission failed"
  );
      } finally {

        setSaving(false);
      }
    };

    /* EXPORT CSV */

  const exportCSV = () => {
  
    const exportData = filteredRows.map((row) => ({
    Circle: row.circle,
    CMP: row.cmp,

    "State Leadership Team":
      row.state_leadership_team,

    "NOC Executive":
      row.noc_executive,

    Analyst:
      row.analyst,

    "CMP Lead":
      row.cmp_lead,

    Technician:
      row.technician,

    Rigger:
      row.rigger,

    "Utility Supervisor":
      row.utility_supervisor,

    "Utility Engineer":
      row.utility_engineer,

    "ISP Engineer":
      row.isp_engineer,

    "WH Incharge Cum Security":
      row.wh_incharge_cum_security,

    Splicer:
      row.splicer,

    "Assistant Splicer":
      row.assistant_splicer,

    "Fiber Helper":
      row.fiber_helper,

    Patroller:
      row.patroller,

    "Fiber Supervisor":
      row.fiber_supervisor,

    "Fibre Engineer":
      row.fibre_engineer,

    "FTTX Splicer":
      row.fttx_splicer,

    "FTTX Assistant Splicer":
      row.fttx_assistant_splicer,

    "FTTX Supervisor":
      row.fttx_supervisor,

    "FTTX Helper":
      row.fttx_helper,

    "FTTX Engineer":
      row.fttx_engineer,

    "FTTX Technician":
      row.fttx_technician,
  }));
  

    const worksheet =
      XLSX.utils.json_to_sheet(
        exportData
      );

    const workbook =
      XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      "Signoff Data"
    );

    XLSX.writeFile(
      workbook,
      "signoff-report.xlsx"
    );
  };

    const deleteRow = async (id) => {

      if (!window.confirm("Delete?"))
        return;

      try {

        await axios.delete(
          buildApiUrl(`/api/signoff/${id}`),
          { headers }
        );

        toast.success("Deleted");

        loadData();

      } catch {

        toast.error("Delete failed");
      }
    };

    const categoryTotals = useMemo(() => {

    return filteredRows.reduce(

      (sum, row) => {

        sum.admin +=
          Number(row.state_leadership_team || 0) +
          Number(row.noc_executive || 0) +
          Number(row.analyst || 0) +
          Number(row.cmp_lead || 0);

        sum.utility +=
          Number(row.technician || 0) +
          Number(row.rigger || 0) +
          Number(row.utility_supervisor || 0) +
          Number(row.utility_engineer || 0) +
          Number(row.isp_engineer || 0) +
          Number(row.wh_incharge_cum_security || 0);

        sum.fiber +=
          Number(row.splicer || 0) +
          Number(row.assistant_splicer || 0) +
          Number(row.fiber_helper || 0) +
          Number(row.patroller || 0) +
          Number(row.fiber_supervisor || 0) +
          Number(row.fibre_engineer || 0);

        sum.fttx +=
          Number(row.fttx_splicer || 0) +
          Number(row.fttx_assistant_splicer || 0) +
          Number(row.fttx_supervisor || 0) +
          Number(row.fttx_helper || 0);

          sum.fttxPo +=
    Number(row.fttx_engineer || 0) +
    Number(row.fttx_technician || 0);

        return sum;

      },

    {
    admin: 0,
    utility: 0,
    fiber: 0,
    fttx: 0,
    fttxPo: 0,
  }

    );

  }, [filteredRows]);

  const approveRequest = async (id, remarks) => {

    setActioningId(id);

    try {

      await axios.put(
        buildApiUrl(`/api/signoff/approve/${id}`),
        { remarks: remarks || undefined },
        { headers }
      );

      toast.success("Request approved");

    setPendingRequests((prev) =>
  prev.filter((row) => row.id !== id)
);

setPendingCount((prev) =>
  Math.max(0, prev - 1)
);

    // Approving writes into the main signoff table, so refresh it too.
    loadData();

    } catch (error) {

      console.error(error);

      toast.error("Approval failed");

    } finally {

      setActioningId(null);
    }

  };

const rejectRequest = async (id, remarks) => {

  setActioningId(id);

  try {

    await axios.put(
      buildApiUrl(`/api/signoff/reject/${id}`),
      { remarks: remarks || undefined },
      { headers }
    );

    toast.success("Request rejected");

    setPendingRequests((prev) =>
      prev.map((row) =>
        row.id === id
          ? { ...row, status: "REJECTED" }
          : row
      )
    );

    loadPendingCount();

  } catch (error) {

    console.error(error);

    toast.error("Rejection failed");

  } finally {

    setActioningId(null);
  }

};

  const openConfirm = (type, row) => {
    setRemarksInput("");
    setConfirmDialog({ type, id: row.id, circle: row.circle, cmp: row.cmp });
  };

  const handleConfirmAction = async () => {
    if (!confirmDialog) return;

    if (confirmDialog.type === "approve") {
      await approveRequest(confirmDialog.id, remarksInput);
    } else {
      await rejectRequest(confirmDialog.id, remarksInput);
    }

    setConfirmDialog(null);
    setRemarksInput("");
  };

    return (
      <div className="min-h-screen space-y-3">

        {/* HEADER */}
        <div className="rounded-[14px] border border-white/70 bg-surface/80 px-4 py-3 shadow-sm">

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">

            <div className="flex items-center gap-3">

              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400">
                <ClipboardList size={18} />
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
                  MANPOWER
                </p>

                <h1 className="text-lg font-semibold text-text-primary">
                  Signoff Management
                </h1>
              </div>

            </div>

      <div className="flex flex-wrap items-center gap-2 sm:gap-3">

    {userCircle?.trim()?.toUpperCase() === "ALL" && (

  <button
  onClick={() => {

    loadPendingRequests();

    setApprovalModalOpen(true);

  }}
    title="Pending Requests"
    className="
      relative
      flex h-9 w-9 items-center justify-center
      rounded-xl
      border border-border-color
      bg-surface
      text-text-secondary
      shadow-sm
      transition-all
      hover:-translate-y-0.5
      hover:bg-surface-muted
      hover:shadow-md
    "
  >
    <Bell size={16} />
    {pendingCount > 0 && (
      <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-surface">
        {pendingCount > 9 ? "9+" : pendingCount}
      </span>
    )}
  </button>

  )}

    {userCircle?.trim()?.toUpperCase() !== "ALL" && (

  <button
  onClick={() => {

    loadMyRequests();

    setMyRequestsModalOpen(true);

  }}
    title="My Requests"
    className="
      relative
      flex h-9 w-9 items-center justify-center
      rounded-xl
      border border-border-color
      bg-surface
      text-text-secondary
      shadow-sm
      transition-all
      hover:-translate-y-0.5
      hover:bg-surface-muted
      hover:shadow-md
    "
  >
    <History size={16} />
    {myRequests.filter((r) => r.status === "PENDING").length > 0 && (
      <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-bold text-white ring-2 ring-surface">
        {myRequests.filter((r) => r.status === "PENDING").length > 9
          ? "9+"
          : myRequests.filter((r) => r.status === "PENDING").length}
      </span>
    )}
  </button>

  )}

        <button
    onClick={exportCSV}
    title="Export the currently filtered rows to an Excel file"
    className="
      flex
      items-center
      gap-2
      rounded-xl
      border
      border-border-color
      bg-surface
      px-4
      py-2
      text-sm
      text-text-secondary
      shadow-sm
      transition-all
      hover:-translate-y-0.5
      hover:bg-surface-muted
      hover:shadow-md
    "
  >

    <Download size={14} />

    Export Excel

  </button>

    <label
    title="Upload a .xlsx/.xls/.csv file to bulk add or update records"
    className={`flex cursor-pointer items-center gap-2 rounded-xl border
    border-border-color bg-surface px-4 py-2 text-text-secondary text-sm shadow-sm transition-all
    hover:-translate-y-0.5 hover:bg-surface-muted hover:shadow-md
    ${
      uploading
        ? "cursor-not-allowed opacity-70"
        : ""
    }`}
  >

  <div className="flex items-center gap-2">

    {uploading ? (
      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
    ) : (
      <Upload size={14} />
    )}

    <span>
      {uploading ? "Uploading..." : "Upload Excel"}
    </span>

  </div>

      <input
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={handleExcelUpload}
        disabled={uploading}
        className="hidden"
      />

    </label>

    <button
      onClick={openAdd}
      className="flex items-center gap-1 rounded-xl bg-indigo-600 px-4 py-2 text-sm text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-indigo-700 hover:shadow-md"
    >
      <Plus size={14} />
      Add Row
    </button>

  </div>

    </div>
    </div>

    {/* KPI CARDS */}

  <div className="grid gap-2 md:grid-cols-5 xl:grid-cols-5">

    {[
      {
        key: "circles",
        label: "Total Circles",
        value: totalCircles,
        hint: "Across all regions",
        icon: Users,
        color: "blue",
      },
      {
        key: "cmps",
        label: "Total CMPs",
        value: totalCMPs,
        hint: "Active CMP Partners",
        icon: Briefcase,
        color: "green",
      },
      {
        key: "workforce",
        label: "Total Workforce",
        value: totalWorkforce,
        hint: "All teams combined",
        icon: Activity,
        color: "violet",
      },
      {
        key: "utility",
        label: "Utility Team",
        value: totalUtility,
        hint: "Utility + Operations",
        icon: ShieldCheck,
        color: "orange",
      },
      {
        key: "isp",
        label: "ISP Engineers",
        value: totalISP,
        hint: "ISP Network Team",
        icon: Wifi,
        color: "pink",
      },
    ].map((kpi) => (

    <div
      key={kpi.key}
      className="group relative overflow-hidden rounded-[14px] border border-white/60
      bg-surface/90 px-4 py-2 hover:-translate-y-1
      transition-all duration-300 hover:shadow-[0_20px_60px_rgba(79,70,229,0.18)]"
    >

      <div className="flex items-center justify-between">

        <div>

          <p className="text-sm font-medium text-text-muted">
            {kpi.label}
          </p>

          {loadingTable ? (
            <div className="mt-1.5 h-6 w-14 animate-pulse rounded-md bg-surface-muted" />
          ) : (
            <h2 className="mt-1 text-xl font-semibold text-text-primary">
              {kpi.value}
            </h2>
          )}

          <p className="mt-1 text-xs text-text-muted">
            {kpi.hint}
          </p>

        </div>

        <div className={`flex h-9 w-9 items-center justify-center rounded-2xl ${KPI_COLOR_CLASSES[kpi.color]}`}>

          <kpi.icon size={14} />

        </div>

      </div>

    </div>

    ))}

  </div>

      
      {/* SEARCH, FILTERS */}

  <div className="rounded-[14px] border border-border-color bg-surface p-3 shadow-sm">

    <div className="grid gap-2 lg:grid-cols-12">

        {/* Search */}
      <div className="lg:col-span-6">

        <div className="relative">

          <Search
            size={14}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted"
          />

          <input
            type="text"
            placeholder="Search by Circle or CMP..."
            value={search}
            onChange={(e) =>
              setSearch(e.target.value)
            }
            className="h-9 w-full text-sm rounded-xl border border-border-color pl-10 pr-4 outline-none transition-colors focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
          />

        </div>

      </div>



      {/* Circle Filter */}
  <div className="lg:col-span-2">

        <select
    value={selectedCircle}
    onChange={(e) => {
      setSelectedCircle(e.target.value);
      setSelectedCMP("");
    }}
    className="h-9 w-full text-sm rounded-xl border border-border-color px-4 outline-none transition-colors focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
  >

    <option value="">
      All Circles
    </option>

    {[...new Set(rows.map((r) => r.circle))]
      .filter(Boolean)
      .map((circle) => (
        <option
          key={circle}
          value={circle}
        >
          {circle}
        </option>
      ))}

  </select>

      </div>

  {/* CMP Filter */}
  <div className="lg:col-span-2">

        <select
    value={selectedCMP}
    onChange={(e) =>
      setSelectedCMP(e.target.value)
    }
    className="h-9 w-full text-sm rounded-xl border border-border-color px-4 outline-none transition-colors focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
  >

    <option value="">
      All CMPs
    </option>

    {[
      ...new Set(
        rows
          .filter((r) =>
            selectedCircle
              ? r.circle ===
                selectedCircle
              : true
          )
          .map((r) => r.cmp)
      ),
    ]
      .filter(Boolean)
      .map((cmp) => (
        <option
          key={cmp}
          value={cmp}
        >
          {cmp}
        </option>
      ))}

  </select>

      </div>

  {/* Reset */}
  <div className="flex items-stretch lg:col-span-2">

      <button
    onClick={() => {
      setSelectedCircle("");
      setSelectedCMP("");
      setSearch("");
    }}
    disabled={!search && !selectedCircle && !selectedCMP}
    className="h-9 w-full text-sm rounded-xl border border-border-color bg-surface-muted font-semibold text-text-secondary transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
  >
    Reset
  </button>

      </div>

    </div>

    {(search || selectedCircle || selectedCMP) && (
      <p className="mt-2 px-1 text-xs text-text-muted">
        Showing <span className="font-semibold text-text-secondary">{filteredRows.length}</span> of {rows.length} records
      </p>
    )}

  </div>


  {/* TABLE */}

  <div
    className="
      relative
      overflow-hidden
      rounded-[20px]
      border
      border-border-color
      bg-surface
    "
    style={{
      scrollbarColor: "#f1f5f9 #e2e8f0",
    }}
  >

  {loadingTable && (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-surface/80 backdrop-blur-sm">
      <div className="flex items-center gap-3 text-sm font-medium text-text-secondary">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
        Loading signoff data...
      </div>
    </div>
  )}

  <div
    className="
      overflow-auto
      rounded-b-[20px]
      scrollbar-thin
      scrollbar-thumb-indigo-600
      scrollbar-track-slate-200
    "
    style={{
      height: "52vh",
    }}
  >

      <table className="min-w-max border-separate border-spacing-0 text-xs">

        {/* HEADER GROUPS */}

        <thead className="sticky top-0 z-30 shadow-md">

        <tr className="sticky top-0 bg-gradient-to-r from-[#071c33] to-[#0d3557] text-white backdrop-blur-md">

    <th
      colSpan={2}
      className="sticky left-0 z-50 w-[260px] min-w-[260px] border border-slate-500 bg-[#0b2945] px-4 py-2"
    />

    {/* ADMIN */}
    <th
      colSpan={4}
      className="border border-slate-500 px-4 py-2 text-center text-xs font-semibold"
    >
      {`Admin (${categoryTotals.admin})`}
    </th>

    {/* UTILITY + ISP */}
    <th
      colSpan={6}
      className="border border-slate-500 px-4 py-2 text-center text-xs font-semibold"
    >
      {`Utility and ISP (${categoryTotals.utility})`}
    </th>

    {/* FIBER */}
    <th
      colSpan={6}
      className="border border-slate-500 px-4 py-2 text-center text-xs font-semibold"
    >
      {`Fiber (${categoryTotals.fiber})`}
    </th>

    {/* FTTX */}
    <th
      colSpan={4}
      className="border border-slate-500 px-4 py-2 text-center text-xs font-semibold"
    >
      {`FTTX (${categoryTotals.fttx})`}
    </th>

    {/* FTTX PO BASED */}
    <th
      colSpan={2}
      className="border border-slate-500 px-4 py-2 text-center text-xs font-semibold"
    >
    {`FTTX PO Based (${categoryTotals.fttxPo})`}
    </th>


  </tr>

          {/* COLUMN HEADERS */}

        <tr className="sticky bg-[#0d3557] text-white text-xs backdrop-blur-md">

          <th className="sticky left-0 z-50 w-[100px] min-w-[100px] border border-slate-500 bg-[#0d3557] px-2 py-2 whitespace-nowrap">
              Circle
            </th>

            <th className="sticky left-[100px] z-50 w-[160px] min-w-[160px] border border-slate-500 bg-[#0d3557] px-4 py-2 whitespace-nowrap">
              CMP
            </th>

          <th className="border border-slate-500 px-4 py-2 whitespace-nowrap">
            State Leadership Team
          </th>

            <th className="border border-slate-500 px-4 py-2 whitespace-nowrap">
              NOC Executive
            </th>

            <th className="border border-slate-500 px-4 py-2 whitespace-nowrap">
              Analyst
            </th>

            <th className="border border-slate-500 px-4 py-2 whitespace-nowrap">
              CMP Lead
            </th>

            <th className="border border-slate-500 px-4 py-2 whitespace-nowrap">
              Technician
            </th>

            <th className="border border-slate-500 px-4 py-2 whitespace-nowrap">
              Rigger
            </th>

            <th className="border border-slate-500 px-4 py-2 whitespace-nowrap">
              Utility Supervisor
            </th>

            <th className="border border-slate-500 px-4 py-2 whitespace-nowrap">
              Utility Engineer
            </th>

            <th className="border border-slate-500 px-4 py-2 whitespace-nowrap">
              ISP Engineer
            </th>

        <th className="border border-slate-500 px-4 py-2 whitespace-nowrap">
        WH Incharge cum Security
        </th>

            <th className="border border-slate-500 px-4 py-2">
              Splicer
            </th>

            <th className="border border-slate-500 px-4 py-2">
              Assistant Splicer
            </th>

            <th className="border border-slate-500 px-4 py-2">
              Fiber Helper
            </th>

            <th className="border border-slate-500 px-4 py-2">
              Patroller
            </th>

            <th className="border border-slate-500 px-4 py-2">
              Fiber Supervisor
            </th>

            <th className="border border-slate-500 px-4 py-2">
              Fibre Engineer
            </th>

            <th className="border border-slate-500 px-4 py-2">
              FTTx Splicer
            </th>

            <th className="border border-slate-500 px-4 py-2 whitespace-nowrap">
              FTTx Assistant Splicer
              </th>

            <th className="border border-slate-500 px-4 py-2">
              FTTx Supervisor
            </th>

            <th className="border border-slate-500 px-4 py-2">
              FTTx Helper
            </th>

            <th className="border border-slate-500 px-4 py-2">
              FTTx Engineer
            </th>

            <th className="border border-slate-500 px-4 py-2">
              FTTx Technician
            </th>


          

          </tr>

        </thead>

        {/* BODY */}

        <tbody>

        {!loadingTable && groupedRows.length === 0 && (
          <tr>
            <td colSpan={24} className="px-4 py-10 text-center text-sm text-text-muted">
              No signoff records found. Try adjusting your filters or add a new record.
            </td>
          </tr>
        )}

        {groupedRows.map(([circle, circleRows]) => {

    const total = circleRows.reduce(
      (sum, row) => ({
        state_leadership_team:
          sum.state_leadership_team +
          Number(row.state_leadership_team || 0),

        noc_executive:
          sum.noc_executive +
          Number(row.noc_executive || 0),

        analyst:
          sum.analyst +
          Number(row.analyst || 0),

        cmp_lead:
          sum.cmp_lead +
          Number(row.cmp_lead || 0),

        technician:
          sum.technician +
          Number(row.technician || 0),

        rigger:
          sum.rigger +
          Number(row.rigger || 0),

        utility_supervisor:
          sum.utility_supervisor +
          Number(row.utility_supervisor || 0),

        utility_engineer:
          sum.utility_engineer +
          Number(row.utility_engineer || 0),

        isp_engineer:
          sum.isp_engineer +
          Number(row.isp_engineer || 0),

        wh_incharge_cum_security:
          sum.wh_incharge_cum_security +
          Number(row.wh_incharge_cum_security || 0),

        splicer:
          sum.splicer +
          Number(row.splicer || 0),

        assistant_splicer:
          sum.assistant_splicer +
          Number(row.assistant_splicer || 0),

        fiber_helper:
          sum.fiber_helper +
          Number(row.fiber_helper || 0),

        patroller:
          sum.patroller +
          Number(row.patroller || 0),

        fiber_supervisor:
          sum.fiber_supervisor +
          Number(row.fiber_supervisor || 0),

        fibre_engineer:
          sum.fibre_engineer +
          Number(row.fibre_engineer || 0),

        fttx_splicer:
          sum.fttx_splicer +
          Number(row.fttx_splicer || 0),

        fttx_assistant_splicer:
          sum.fttx_assistant_splicer +
          Number(row.fttx_assistant_splicer || 0),

        fttx_supervisor:
          sum.fttx_supervisor +
          Number(row.fttx_supervisor || 0),

        fttx_helper:
          sum.fttx_helper +
          Number(row.fttx_helper || 0),

        fttx_engineer:
          sum.fttx_engineer +
          Number(row.fttx_engineer || 0),

        fttx_technician:
          sum.fttx_technician +
          Number(row.fttx_technician || 0),

      }),
      {
        state_leadership_team: 0,
        noc_executive: 0,
        analyst: 0,
        cmp_lead: 0,
        technician: 0,
        rigger: 0,
        utility_supervisor: 0,
        utility_engineer: 0,
        isp_engineer: 0,
        wh_incharge_cum_security: 0,
        splicer: 0,
        assistant_splicer: 0,
        fiber_helper: 0,
        patroller: 0,
        fiber_supervisor: 0,
        fibre_engineer: 0,
        fttx_splicer: 0,
        fttx_assistant_splicer: 0,
        fttx_supervisor: 0,
        fttx_helper: 0,
        fttx_engineer: 0,
        fttx_technician: 0,
      }
    );

    return (
    <Fragment key={circle}>

      {/* TOTAL ROW */}

      <tr className="bg-surface-muted font-bold">

        <td className="sticky left-0 z-20 w-[100px] min-w-[100px] border border-border-strong bg-surface-muted px-4 py-2">
            {circle}
          </td>

          <td className="sticky left-[100px] z-20 w-[160px] min-w-[160px] border border-border-strong bg-surface-muted px-4 py-2">
            Total
          </td>

        <td className="border border-border-strong px-4 py-2 text-center">
          {total.state_leadership_team}
        </td>

        <td className="border border-border-strong px-4 py-2 text-center">
          {total.noc_executive}
        </td>

        <td className="border border-border-strong px-4 py-2 text-center">
          {total.analyst}
        </td>

        <td className="border border-border-strong px-4 py-2 text-center">
          {total.cmp_lead}
        </td>

        <td className="border border-border-strong px-4 py-2 text-center">
          {total.technician}
        </td>

        <td className="border border-border-strong px-4 py-2 text-center">
          {total.rigger}
        </td>

        <td className="border border-border-strong px-4 py-2 text-center">
          {total.utility_supervisor}
        </td>

        <td className="border border-border-strong px-4 py-2 text-center">
          {total.utility_engineer}
        </td>

        <td className="border border-border-strong px-4 py-2 text-center">
          {total.isp_engineer}
        </td>

        <td className="border border-border-strong px-4 py-2 text-center">
          {total.wh_incharge_cum_security}
        </td>

        <td className="border border-border-strong px-4 py-2 text-center">
          {total.splicer}
        </td>

        <td className="border border-border-strong px-4 py-2 text-center">
          {total.assistant_splicer}
        </td>

        <td className="border border-border-strong px-4 py-2 text-center">
          {total.fiber_helper}
        </td>

        <td className="border border-border-strong px-4 py-2 text-center">
          {total.patroller}
        </td>

        <td className="border border-border-strong px-4 py-2 text-center">
          {total.fiber_supervisor}
        </td>

        <td className="border border-border-strong px-4 py-2 text-center">
          {total.fibre_engineer}
        </td>

        <td className="border border-border-strong px-4 py-2 text-center">
          {total.fttx_splicer}
        </td>

        <td className="border border-border-strong px-4 py-2 text-center">
          {total.fttx_assistant_splicer}
        </td>

        <td className="border border-border-strong px-4 py-2 text-center">
          {total.fttx_supervisor}
        </td>

        <td className="border border-border-strong px-4 py-2 text-center">
          {total.fttx_helper}
        </td>

        <td className="border border-border-strong px-4 py-2 text-center">
          {total.fttx_engineer}
        </td>

        <td className="border border-border-strong px-4 py-2 text-center">
          {total.fttx_technician}
        </td>

      </tr>

      {/* CMP ROWS */}

      {circleRows.map((row) => (

        <tr
          key={row.id}
          className="border-b border-border-color hover:bg-indigo-50 hover:dark:bg-indigo-500/10/40"
        >

        <td className="sticky left-0 z-10 w-[100px] min-w-[100px] max-w-[100px] border border-border-color bg-surface px-2 py-2">
            {row.circle}
          </td>

          <td className="sticky left-[100px] z-10 w-[160px] min-w-[160px] max-w-[160px] border border-border-color bg-surface px-4 py-2 font-medium">
            {row.cmp}
          </td>

          <td className="border border-border-color px-4 py-2 text-center">
            {row.state_leadership_team}
          </td>

          <td className="border border-border-color px-4 py-2 text-center">
    {row.noc_executive}
  </td>

  <td className="border border-border-color px-4 py-2 text-center">
    {row.analyst}
  </td>

  <td className="border border-border-color px-4 py-2 text-center">
    {row.cmp_lead}
  </td>

  <td className="border border-border-color px-4 py-2 text-center">
    {row.technician}
  </td>

  <td className="border border-border-color px-4 py-2 text-center">
    {row.rigger}
  </td>

  <td className="border border-border-color px-4 py-2 text-center">
    {row.utility_supervisor}
  </td>

  <td className="border border-border-color px-4 py-2 text-center">
    {row.utility_engineer}
  </td>

  <td className="border border-border-color px-4 py-2 text-center">
    {row.isp_engineer}
  </td>

  <td className="border border-border-color px-4 py-2 text-center">
    {row.wh_incharge_cum_security}
  </td>

  <td className="border border-border-color px-4 py-2 text-center">
    {row.splicer}
  </td>

  <td className="border border-border-color px-4 py-2 text-center">
    {row.assistant_splicer}
  </td>

  <td className="border border-border-color px-4 py-2 text-center">
    {row.fiber_helper}
  </td>

  <td className="border border-border-color px-4 py-2 text-center">
    {row.patroller}
  </td>

  <td className="border border-border-color px-4 py-2 text-center">
    {row.fiber_supervisor}
  </td>

  <td className="border border-border-color px-4 py-2 text-center">
    {row.fibre_engineer}
  </td>

  <td className="border border-border-color px-4 py-2 text-center">
    {row.fttx_splicer}
  </td>

  <td className="border border-border-color px-4 py-2 text-center">
    {row.fttx_assistant_splicer}
  </td>

  <td className="border border-border-color px-4 py-2 text-center">
    {row.fttx_supervisor}
  </td>

  <td className="border border-border-color px-4 py-2 text-center">
    {row.fttx_helper}
  </td>

  <td className="border border-border-color px-4 py-2 text-center">
    {row.fttx_engineer}
  </td>

  <td className="border border-border-color px-4 py-2 text-center">
    {row.fttx_technician}
  </td>

        </tr>

      ))}

    </Fragment>
  );
  })}

        </tbody>

      </table>

    </div>

  </div>

  {/* MODAL */}
  {modalOpen && (
  <div className="
  fixed inset-0 z-[99999]
  bg-overlay/60
  backdrop-blur-xl
  flex items-center justify-center
  p-4
  ">

  <div
  className="
  w-full
  max-w-[1380px]
  h-[85vh]
  overflow-y-auto
  rounded-[18px]
  bg-surface
  border border-white/60
  shadow-[0_30px_100px_rgba(15,23,42,0.25)]
  "
  >

  {/* HEADER */}

  <div
  className="
  flex items-center justify-between
  px-6 py-4
  border-b

  "
  >

  <div className="flex items-center gap-4">

  <div
  className="
  h-10 w-10
  rounded-xl
  bg-indigo-500/20
  backdrop-blur-md
  flex items-center justify-center
  "
  >
  {editingId ? (
    <Pencil className="text-text-primary" size={20}/>
  ) : (
    <Plus className="text-text-primary" size={24}/>
  )}
  </div>

  <div>
  <h2 className="text-xl font-semibold text-text-primary">
  {editingId ? "Edit Record" : "Add Record"}
  </h2>

  <p className="text-sm text-text-secondary">
  {editingId
    ? "Update the details below — changes are submitted for approval before they go live."
    : "Fill in the details below to submit a new record for approval."}
  </p>
  </div>

  </div>

  <button
  onClick={() => setModalOpen(false)}
  title="Close"
  className="flex h-9 w-9 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-muted hover:text-text-primary"
  >
  <X size={18} />
  </button>

  </div>

  <div className="p-4">

  {/* ORGANIZATION */}

  <div
  className="
  mb-4
  rounded-[18px]
  bg-surface
  border border-border-color
  px-4 py-2
  "
  >

  <h3 className="font-semibold text-sm mb-2">
  Organization Details
  </h3>

  <div className="grid md:grid-cols-2 gap-4">

  <div>

  <label className="mb-1 block text-xs font-medium text-text-secondary">
  Circle <span className="text-red-500">*</span>
  </label>

  <select
  value={form.circle}
  onChange={(e)=>{
  setForm({
  ...form,
  circle:e.target.value,
  cmp:""
  });
  setErrors((prev) => ({ ...prev, circle: undefined }));
  }
  }
  className={`h-9 w-full text-sm rounded-xl border px-4 ${
  errors.circle ? "border-red-400" : "border-border-color"
  }`}
  >
  <option value="">Select Circle</option>

  {Object.keys(circleCMPMap).map(circle=>(
  <option
  key={circle}
  value={circle}
  >
  {circle}
  </option>
  ))}
  </select>

  {errors.circle && (
  <p className="mt-1 text-xs text-red-500">{errors.circle}</p>
  )}

  </div>

  <div>

  <label className="mb-1 block text-xs font-medium text-text-secondary">
  CMP <span className="text-red-500">*</span>
  </label>

  <select
  value={form.cmp}
  onChange={(e)=>{
  setForm({
  ...form,
  cmp:e.target.value
  });
  setErrors((prev) => ({ ...prev, cmp: undefined }));
  }
  }
  disabled={!form.circle}
  className={`h-9 w-full text-sm rounded-xl border px-4 disabled:cursor-not-allowed disabled:opacity-60 ${
  errors.cmp ? "border-red-400" : "border-border-color"
  }`}
  >
  <option value="">
  {form.circle ? "Select CMP" : "Select Circle first"}
  </option>

  {form.circle &&
  circleCMPMap[form.circle]?.map(cmp=>(
  <option
  key={cmp}
  value={cmp}
  >
  {cmp}
  </option>
  ))}
  </select>

  {errors.cmp && (
  <p className="mt-1 text-xs text-red-500">{errors.cmp}</p>
  )}

  </div>

  </div>

  </div>

  {/* OPERATIONS */}

  <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

    {/* ADMIN */}

  <div className="
  rounded-[18px]
  bg-surface
  p-4
  border border-border-color
  hover:-translate-y-1
  hover:shadow-[0_20px_40px_rgba(99,102,241,0.15)]
  transition-all
  ">

  <h3 className="mb-3 flex items-center gap-2 px-1 text-[13px] font-semibold text-text-primary">
  <Users size={13} className="text-blue-500" />
  ADMIN SECTION
  </h3>

  <NumberField
  label="State Leadership Team"
  value={form.state_leadership_team}
  onChange={(e)=>
  setForm({
  ...form,
  state_leadership_team:e.target.value
  })
  }
  />

  <NumberField
  label="NOC Executive"
  value={form.noc_executive}
  onChange={(e)=>
  setForm({
  ...form,
  noc_executive:e.target.value
  })
  }
  />

  <NumberField
  label="Analyst"
  value={form.analyst}
  onChange={(e)=>
  setForm({
  ...form,
  analyst:e.target.value
  })
  }
  />

  <NumberField
  label="CMP Lead"
  value={form.cmp_lead}
  onChange={(e)=>
  setForm({
  ...form,
  cmp_lead:e.target.value
  })
  }
  />

  </div>

  {/* Utility and ISP  */}

  <div className="
  rounded-[18px]
  bg-surface
  p-4
  border border-border-color
  hover:-translate-y-1
  hover:shadow-[0_20px_40px_rgba(99,102,241,0.15)]
  transition-all
  ">

  <h3 className="mb-3 flex items-center gap-2 px-1 text-[13px] font-semibold text-text-primary">
  <ShieldCheck size={13} className="text-orange-500" />
  Utility and ISP
  </h3>

  <NumberField
  label="Technician"
  value={form.technician}
  onChange={(e)=>setForm({...form,technician:e.target.value})}
  />

  <NumberField
  label="Rigger"
  value={form.rigger}
  onChange={(e)=>setForm({...form,rigger:e.target.value})}
  />

  <NumberField
  label="Utility Engineer"
  value={form.utility_engineer}
  onChange={(e)=>setForm({...form,utility_engineer:e.target.value})}
  />

  <NumberField
  label="Utility Supervisor"
  value={form.utility_supervisor}
  onChange={(e)=>setForm({...form,utility_supervisor:e.target.value})}
  />

  <NumberField
  label="ISP Engineer"
  value={form.isp_engineer}
  onChange={(e)=>setForm({...form,isp_engineer:e.target.value})}
  />

  <NumberField
  label="WH Incharge Cum Security"
  value={form.wh_incharge_cum_security}
  onChange={(e)=>setForm({...form,wh_incharge_cum_security:e.target.value})}
  />

  </div>

  {/* FIBER */}

  <div className="
  rounded-[18px]
  bg-surface
  p-4
  border border-border-color
  hover:-translate-y-1
  hover:shadow-[0_20px_40px_rgba(99,102,241,0.15)]
  transition-all
  ">

  <h3 className="mb-3 flex items-center gap-2 px-1 text-[13px] font-semibold text-text-primary">
  <Activity size={13} className="text-violet-500" />
  FIBER OPERATIONS
  </h3>

  <NumberField
  label="Splicer"
  value={form.splicer}
  onChange={(e)=>setForm({...form,splicer:e.target.value})}
  />

  <NumberField
  label="Assistant Splicer"
  value={form.assistant_splicer}
  onChange={(e)=>setForm({...form,assistant_splicer:e.target.value})}
  />

  <NumberField
  label="Fiber Helper"
  value={form.fiber_helper}
  onChange={(e)=>setForm({...form,fiber_helper:e.target.value})}
  />

  <NumberField
  label="Patroller"
  value={form.patroller}
  onChange={(e)=>setForm({...form,patroller:e.target.value})}
  />

  <NumberField
  label="Fiber Supervisor"
  value={form.fiber_supervisor}
  onChange={(e)=>setForm({...form,fiber_supervisor:e.target.value})}
  />

  <NumberField
  label="Fibre Engineer"
  value={form.fibre_engineer}
  onChange={(e)=>setForm({...form,fibre_engineer:e.target.value})}
  />

  </div>

  {/* FTTX */}

  <div className="
  rounded-[18px]
  bg-surface
  p-4
  border border-border-color
  hover:-translate-y-1
  hover:shadow-[0_20px_40px_rgba(99,102,241,0.15)]
  transition-all
  ">

  <h3 className="mb-3 flex items-center gap-2 px-1 text-[13px] font-semibold text-text-primary">
  <Wifi size={13} className="text-pink-500" />
  FTTX OPERATIONS
  </h3>

  <NumberField label="FTTX Splicer" value={form.fttx_splicer}
  onChange={(e)=>setForm({...form,fttx_splicer:e.target.value})} />

  <NumberField label="FTTX Assistant Splicer" value={form.fttx_assistant_splicer}
  onChange={(e)=>setForm({...form,fttx_assistant_splicer:e.target.value})} />

  <NumberField label="FTTX Supervisor" value={form.fttx_supervisor}
  onChange={(e)=>setForm({...form,fttx_supervisor:e.target.value})} />

  <NumberField label="FTTX Helper" value={form.fttx_helper}
  onChange={(e)=>setForm({...form,fttx_helper:e.target.value})} />

  </div>

  {/* FTTX PO BASED */}
  <div className="
  rounded-[18px]
  bg-surface
  p-4
  border border-border-color
  hover:-translate-y-1
  hover:shadow-[0_20px_40px_rgba(99,102,241,0.15)]
  transition-all
  ">
    <h3 className="mb-3 flex items-center gap-2 px-1 text-[13px] font-semibold text-text-primary">
      <Briefcase size={13} className="text-green-500" />
      FTTX PO BASED
    </h3>

    <NumberField label="FTTX Engineer" value={form.fttx_engineer}
    onChange={(e)=>setForm({...form,fttx_engineer:e.target.value})} />

  <NumberField label="FTTX Technician" value={form.fttx_technician}
  onChange={(e)=>setForm({...form,fttx_technician:e.target.value})} />

    </div>

  </div>

  </div>

  <div className="sticky bottom-0 flex items-center justify-between gap-4 border-t bg-surface p-4">

  <p className="hidden text-xs text-text-muted sm:block">
    Fields marked <span className="text-red-500">*</span> are required. Numeric fields default to 0 when left blank.
  </p>

  <div className="flex items-center gap-3">

  <button
  onClick={() => setModalOpen(false)}
  disabled={saving}
  className="px-4 py-2 rounded-xl border border-border-color text-text-secondary transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60"
  >
  Cancel
  </button>

  <button
  onClick={saveData}
  disabled={saving}
  className="
  flex
  items-center
  gap-2
  px-4
  py-2
  rounded-xl
  bg-gradient-to-r
  from-indigo-600
  to-violet-600
  text-white
  font-semibold
  hover:scale-105
  transition-all
  disabled:cursor-not-allowed
  disabled:opacity-70
  disabled:hover:scale-100
  "
  >
  {saving && (
    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/60 border-t-transparent" />
  )}
  {saving
    ? "Submitting..."
    : editingId
      ? "Submit Update"
      : "Submit Record"}
  </button>

  </div>

  </div>

  </div>
  </div>
  )}

  {approvalModalOpen && (
   <div className="
fixed inset-0 z-[99999]
bg-overlay/40
backdrop-blur-md
flex items-center justify-center
p-4
">
  <div
  className="
  bg-surface
  w-full
  max-w-4xl
  max-h-[88vh]
  rounded-[18px]
  border border-border-color
  shadow-[0_30px_80px_rgba(15,23,42,0.15)]
  flex
  flex-col
  overflow-hidden
  "
>

<div
className="
flex
justify-between
items-center
px-6
py-3
border-b
border-border-color
bg-gradient-to-r
from-surface-muted
to-surface
sticky
top-0
z-30
"
>
       <div className="flex items-center gap-3">
  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-orange-100 text-orange-600 dark:bg-orange-500/15 dark:text-orange-400">
    <Bell size={18} />
  </div>
  <div>
  <div className="flex items-center gap-2">
  <h2 className="text-xl font-semibold text-text-primary">
    Pending Requests
  </h2>
  {!loadingPending && pendingRequests.length > 0 && (
    <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-bold text-orange-600 dark:bg-orange-500/15 dark:text-orange-400">
      {pendingRequests.length}
    </span>
  )}
  </div>

  <p className="text-sm text-text-muted">
    Review each request below, then approve or reject it
  </p>
  </div>
</div>
          <button
            onClick={() => setApprovalModalOpen(false)}
            title="Close"
            className="flex h-9 w-9 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-muted hover:text-text-primary"
          >
            <X size={18} />
          </button>
        </div>

      <div className="flex-1 overflow-y-auto scroll-smooth bg-surface-muted/40 p-4">

  {loadingPending ? (

    <div className="flex items-center justify-center gap-3 py-16 text-sm font-medium text-text-secondary">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
      Loading pending requests...
    </div>

  ) : !pendingRequests?.length ? (

    <div className="flex flex-col items-center justify-center gap-1 py-16 text-center">
      <span className="text-2xl">🎉</span>
      <p className="text-sm font-medium text-text-primary">You're all caught up</p>
      <p className="text-xs text-text-muted">There are no pending requests right now.</p>
    </div>

  ) : (

    <div className="space-y-3">

    {pendingRequests.map((row) => (

      <div
        key={row.id}
        className="rounded-2xl border border-border-color bg-surface p-4 shadow-sm transition-shadow hover:shadow-md"
      >

        {/* CARD HEADER */}
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3 border-b border-border-color pb-3">

          <div className="flex items-center gap-3">

            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400">
              <Briefcase size={16} />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-text-primary">
                  {row.circle} <span className="text-text-muted">•</span> {row.cmp}
                </h3>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                  row.request_type === "UPDATE"
                    ? "bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400"
                    : "bg-green-100 text-green-600 dark:bg-green-500/15 dark:text-green-400"
                }`}>
                  {row.request_type === "UPDATE" ? "Update" : "New"}
                </span>
              </div>

              {row.requested_by && (
                <p className="mt-0.5 text-xs text-text-muted">
                  Requested by <span className="font-medium text-text-secondary">{row.requested_by}</span>
                  {formatDateTime(row.created_at) && (
                    <> <span className="text-text-muted">•</span> {formatDateTime(row.created_at)}</>
                  )}
                </p>
              )}
            </div>

          </div>

          <span
            className={`rounded-full px-3 py-1 text-xs font-bold shadow-sm ${
              row.status === "APPROVED"
                ? "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400"
                : row.status === "REJECTED"
                ? "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400"
                : "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-400"
            }`}
          >
            {row.status}
          </span>

        </div>

        {/* CARD BODY — GROUPED FIELDS */}
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">

          {PENDING_FIELD_GROUPS.map((group) => {
            const nonZeroFields = group.fields.filter((field) => Number(row[field.key]) > 0);
            return (
              <div key={group.label} className="rounded-xl bg-surface-muted p-2.5">

                <p className={`mb-1.5 text-[10px] font-bold uppercase tracking-wide ${KPI_COLOR_CLASSES[group.color].split(" ").filter((c) => c.startsWith("text-")).join(" ")}`}>
                  {group.label}
                </p>

                {nonZeroFields.length === 0 ? (
                  <p className="text-xs text-text-muted">—</p>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {nonZeroFields.map((field) => (
                      <span
                        key={field.key}
                        title={field.label}
                        className="rounded-md bg-surface px-1.5 py-0.5 text-[11px] text-text-secondary"
                      >
                        {field.label}: <span className="font-semibold text-text-primary">{row[field.key]}</span>
                      </span>
                    ))}
                  </div>
                )}

              </div>
            );
          })}

        </div>

        {/* CARD FOOTER — ACTIONS */}
        <div className="mt-3 flex justify-end gap-2 border-t border-border-color pt-3">

          <button
            onClick={() => openConfirm("approve", row)}
            disabled={actioningId === row.id}
            className="flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {actioningId === row.id && (
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/60 border-t-transparent" />
            )}
            Approve
          </button>

          <button
            onClick={() => openConfirm("reject", row)}
            disabled={actioningId === row.id || row.status === "REJECTED"}
            className="flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {actioningId === row.id && (
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/60 border-t-transparent" />
            )}
            Reject
          </button>

        </div>

      </div>

    ))}

    </div>

  )}

      </div>
    </div>
    </div>
  )}

  {myRequestsModalOpen && (
   <div className="
fixed inset-0 z-[99999]
bg-overlay/40
backdrop-blur-md
flex items-center justify-center
p-4
">
  <div
  className="
  bg-surface
  w-full
  max-w-4xl
  max-h-[88vh]
  rounded-[18px]
  border border-border-color
  shadow-[0_30px_80px_rgba(15,23,42,0.15)]
  flex
  flex-col
  overflow-hidden
  "
>

<div
className="
flex
justify-between
items-center
px-6
py-3
border-b
border-border-color
bg-gradient-to-r
from-surface-muted
to-surface
sticky
top-0
z-30
"
>
       <div className="flex items-center gap-3">
  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400">
    <History size={18} />
  </div>
  <div>
  <div className="flex items-center gap-2">
  <h2 className="text-xl font-semibold text-text-primary">
    My Requests
  </h2>
  {!loadingMyRequests && myRequests.length > 0 && (
    <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400">
      {myRequests.length}
    </span>
  )}
  </div>

  <p className="text-sm text-text-muted">
    Track the status of records you've submitted for approval
  </p>
  </div>
</div>
          <button
            onClick={() => setMyRequestsModalOpen(false)}
            title="Close"
            className="flex h-9 w-9 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-muted hover:text-text-primary"
          >
            <X size={18} />
          </button>
        </div>

      <div className="flex-1 overflow-y-auto scroll-smooth bg-surface-muted/40 p-4">

  {loadingMyRequests ? (

    <div className="flex items-center justify-center gap-3 py-16 text-sm font-medium text-text-secondary">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
      Loading your requests...
    </div>

  ) : !myRequests?.length ? (

    <div className="flex flex-col items-center justify-center gap-1 py-16 text-center">
      <span className="text-2xl">📭</span>
      <p className="text-sm font-medium text-text-primary">No requests yet</p>
      <p className="text-xs text-text-muted">Records you add or edit will show up here once submitted.</p>
    </div>

  ) : (

    <div className="space-y-3">

    {myRequests.map((row) => (

      <div
        key={row.id}
        className="rounded-2xl border border-border-color bg-surface p-4 shadow-sm transition-shadow hover:shadow-md"
      >

        {/* CARD HEADER */}
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3 border-b border-border-color pb-3">

          <div className="flex items-center gap-3">

            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400">
              <Briefcase size={16} />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-text-primary">
                  {row.circle} <span className="text-text-muted">•</span> {row.cmp}
                </h3>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                  row.request_type === "UPDATE"
                    ? "bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400"
                    : "bg-green-100 text-green-600 dark:bg-green-500/15 dark:text-green-400"
                }`}>
                  {row.request_type === "UPDATE" ? "Update" : "New"}
                </span>
              </div>

              <p className="mt-0.5 text-xs text-text-muted">
                {row.status === "APPROVED"
                  ? "Approved — now live in the system"
                  : row.status === "REJECTED"
                  ? "Rejected — you can submit an updated request"
                  : "Awaiting approval"}
                {formatDateTime(row.created_at) && (
                  <> <span className="text-text-muted">•</span> Submitted {formatDateTime(row.created_at)}</>
                )}
              </p>
            </div>

          </div>

          <span
            className={`rounded-full px-3 py-1 text-xs font-bold shadow-sm ${
              row.status === "APPROVED"
                ? "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400"
                : row.status === "REJECTED"
                ? "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400"
                : "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-400"
            }`}
          >
            {row.status}
          </span>

        </div>

        {row.status !== "PENDING" && (row.approved_by || row.remarks) && (
          <div className="mb-3 rounded-xl bg-surface-muted p-2.5 text-xs">
            {row.approved_by && (
              <p className="text-text-secondary">
                Reviewed by <span className="font-medium text-text-primary">{row.approved_by}</span>
                {formatDateTime(row.approved_at) && <> on {formatDateTime(row.approved_at)}</>}
              </p>
            )}
            {row.remarks && (
              <p className="mt-1 text-text-secondary">
                <span className="font-medium text-text-primary">Remarks:</span> {row.remarks}
              </p>
            )}
          </div>
        )}

        {/* CARD BODY — GROUPED FIELDS */}
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">

          {PENDING_FIELD_GROUPS.map((group) => {
            const nonZeroFields = group.fields.filter((field) => Number(row[field.key]) > 0);
            return (
              <div key={group.label} className="rounded-xl bg-surface-muted p-2.5">

                <p className={`mb-1.5 text-[10px] font-bold uppercase tracking-wide ${KPI_COLOR_CLASSES[group.color].split(" ").filter((c) => c.startsWith("text-")).join(" ")}`}>
                  {group.label}
                </p>

                {nonZeroFields.length === 0 ? (
                  <p className="text-xs text-text-muted">—</p>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {nonZeroFields.map((field) => (
                      <span
                        key={field.key}
                        title={field.label}
                        className="rounded-md bg-surface px-1.5 py-0.5 text-[11px] text-text-secondary"
                      >
                        {field.label}: <span className="font-semibold text-text-primary">{row[field.key]}</span>
                      </span>
                    ))}
                  </div>
                )}

              </div>
            );
          })}

        </div>

      </div>

    ))}

    </div>

  )}

      </div>
    </div>
    </div>
  )}

  {confirmDialog && (
    <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-overlay/50 p-4 backdrop-blur-sm">

      <div className="w-full max-w-sm rounded-2xl border border-border-color bg-surface p-5 shadow-[0_30px_80px_rgba(15,23,42,0.25)]">

        <div className="mb-4 flex items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${
            confirmDialog.type === "approve"
              ? "bg-green-100 text-green-600 dark:bg-green-500/15 dark:text-green-400"
              : "bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-400"
          }`}>
            {confirmDialog.type === "approve" ? <ShieldCheck size={18} /> : <X size={18} />}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text-primary">
              {confirmDialog.type === "approve" ? "Approve this request?" : "Reject this request?"}
            </h3>
            <p className="text-xs text-text-muted">
              {confirmDialog.circle} • {confirmDialog.cmp}
            </p>
          </div>
        </div>

        <label className="mb-1 block text-xs font-medium text-text-secondary">
          {confirmDialog.type === "approve" ? "Note (optional)" : "Reason for rejection (optional)"}
        </label>
        <textarea
          value={remarksInput}
          onChange={(e) => setRemarksInput(e.target.value)}
          rows={3}
          placeholder={confirmDialog.type === "approve" ? "Add any context for this approval..." : "Let the requester know why this was rejected..."}
          className="mb-4 w-full resize-none rounded-xl border border-border-color px-3 py-2 text-sm outline-none transition-colors focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
        />

        <div className="flex justify-end gap-2">
          <button
            onClick={() => setConfirmDialog(null)}
            disabled={actioningId === confirmDialog.id}
            className="rounded-lg border border-border-color px-4 py-1.5 text-xs font-semibold text-text-secondary transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirmAction}
            disabled={actioningId === confirmDialog.id}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
              confirmDialog.type === "approve" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"
            }`}
          >
            {actioningId === confirmDialog.id && (
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/60 border-t-transparent" />
            )}
            {confirmDialog.type === "approve" ? "Yes, Approve" : "Yes, Reject"}
          </button>
        </div>

      </div>

    </div>
  )}

      </div>
    );
  }



  export default Signoff;
