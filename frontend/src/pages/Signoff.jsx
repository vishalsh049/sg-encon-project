  import { useEffect, useMemo, useState } from "react";
  import axios from "axios";
  import toast from "react-hot-toast";

  import {
    Plus,
    Pencil,
    Trash2,
    Search,
    Download,
    Users,
    Briefcase,
    Wifi,
    ShieldCheck,
    Activity,
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

    try {

      const res = await axios.get(
        buildApiUrl("/api/signoff/pending-requests"),
        { headers }
      );

      console.log("PENDING API", res.data);

      console.log(res.data);

  setPendingRequests(
    res.data?.rows || []
  );

    } catch (error) {

      console.error(error);

      toast.error(
        "Failed to load requests"
      );

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
    

  useEffect(() => {

    loadData();

    console.log("USER CIRCLE:", userCircle);

    if (
      userCircle
        ?.trim()
        ?.toUpperCase() === "ALL"
    ) {

      loadPendingCount();

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
      invalidRows[0]
    );

    console.log(
      "Invalid Rows:",
      invalidRows
    );

    setUploading(false);

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
  }
  };

    const openAdd = () => {
      setEditingId(null);

      setForm(initialForm);

      setModalOpen(true);
    };

    const openEdit = (row) => {

      setEditingId(row.id);

      setForm({
        ...initialForm,
        ...row,
      });

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
    return;
  }

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

      } catch {

        toast.error(
    "Request submission failed"
  );
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

  const userCircle = getUserCircle();

  console.log(
    "USER CIRCLE =",
    userCircle
  );

  const approveRequest = async (id) => {

    try {

      await axios.put(
        buildApiUrl(`/api/signoff/approve/${id}`),
        {},
        { headers }
      );

      toast.success("Approved");

    setPendingRequests((prev) =>
  prev.filter((row) => row.id !== id)
);

setPendingCount((prev) =>
  Math.max(0, prev - 1)
);

    } catch (error) {

      console.error(error);

      toast.error("Approval failed");

    }

  };

const rejectRequest = async (id) => {

  try {

    await axios.put(
      buildApiUrl(`/api/signoff/reject/${id}`),
      {},
      { headers }
    );

    toast.success("Rejected");

    setPendingRequests((prev) =>
      prev.map((row) =>
        row.id === id
          ? { ...row, status: "REJECTED" }
          : row
      )
    );

    loadPendingCount(); // ADD THIS LINE

  } catch (error) {

    console.error(error);

    toast.error("Rejection failed");

  }

};

    return (
      <div className="min-h-screen space-y-3">

        {/* HEADER */}
        <div className="rounded-[14px] border border-white/70 bg-white/80 px-4 py-3">

          <div className="flex items-center justify-between">

            <div>

              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                MANPOWER
              </p>

              <h1 className=" text-lg font-semibold text-slate-950">
                Signoff Management
              </h1>

            </div>
      <div className="flex items-center gap-3">

    {userCircle?.trim()?.toUpperCase() === "ALL" && (

  <button
  onClick={() => {

    loadPendingRequests();

    setApprovalModalOpen(true);

  }}
    className="
      flex items-center gap-3
      rounded-xl
      border border-orange-200
      bg-gradient-to-r
      from-orange-50
      to-amber-50
      px-4 py-2
      shadow-sm
    "
  >
    <div className="
      flex h-8 w-8 items-center justify-center
      rounded-full
      bg-orange-100
    ">
      🔔
    </div>

    <div>
      <p className="text-[11px] text-slate-500">
        Pending Requests
      </p>

      <p className="font-bold text-orange-600">
        {pendingCount}
      </p>
    </div>

  </button>

  )}

        <button
    onClick={exportCSV}
    className="
      flex
      items-center
      gap-2
      rounded-xl
      border
      border-slate-200
      bg-white
      px-4
      py-2
      text-sm
      text-slate-700
      shadow-sm
      transition-all
      hover:bg-slate-50
    "
  >

    <Download size={14} />

    Export Excel

  </button>

    <label
    className={`flex cursor-pointer items-center gap-2 rounded-xl border
    border-slate-200 bg-white px-4 py-2 text-slate-700 text-sm shadow-sm
    ${
      uploading
        ? "opacity-50 pointer-events-none"
        : ""
    }`}
  >

  <div className="flex items-center gap-2">

    <span>
      Upload Excel
    </span>

  </div>

      <input
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={handleExcelUpload}
        className="hidden"
      />

    </label>

    <button
      onClick={openAdd}
      className="flex items-center gap-1 rounded-xl bg-indigo-600 px-4 py-2 text-sm text-white"
    >
      <Plus size={14} />
      Add Row
    </button>

  </div>

    </div>
    </div>

    {/* KPI CARDS */}

  <div className="grid gap-2 md:grid-cols-5 xl:grid-cols-5">

    {/* TOTAL CIRCLES */}

    <div className="group relative overflow-visible rounded-[14px] border border-white/60
    bg-white/90 px-4 py-2  hover:-translate-y-1
      transition-all duration-300  hover:shadow-[0_20px_60px_rgba(79,70,229,0.18)]">

      <div className="flex items-center justify-between">

        <div>

          <p className="text-sm font-medium text-slate-500">
            Total Circles
          </p>

          <h2 className="mt-1 text-xl font-semibold text-slate-900">
            {totalCircles}
          </h2>

          <p className="mt-1 text-xs text-slate-400">
            Across all regions
          </p>

        </div>

        <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-blue-100 text-blue-600">

          <Users size={14} />

        </div>

      </div>

    </div>

    {/* TOTAL CMP */}

    <div className="group relative overflow-hidden rounded-[14px] border border-white/60
    bg-white/90 px-4 py-2 hover:-translate-y-1
      transition-all duration-300  hover:shadow-[0_20px_60px_rgba(79,70,229,0.18)]">

      <div className="flex items-center justify-between">

        <div>

          <p className="text-sm font-medium text-slate-500">
            Total CMPs
          </p>

          <h2 className="mt-1 text-xl font-semibold text-slate-900">
            {totalCMPs}
          </h2>

          <p className="mt-1 text-xs text-slate-400">
            Active CMP Partners
          </p>

        </div>

        <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-green-100 text-green-600">

          <Briefcase size={14} />

        </div>

      </div>

    </div>

    {/* TOTAL WORKFORCE */}

    <div className="group relative overflow-hidden rounded-[14px] border border-white/60
    bg-white/90 px-4 py-2 hover:-translate-y-1
      transition-all duration-300  hover:shadow-[0_20px_60px_rgba(79,70,229,0.18)]">

      <div className="flex items-center justify-between">

        <div>

          <p className="text-sm font-medium text-slate-500">
            Total Workforce
          </p>

          <h2 className="mt-1 text-xl font-semibold text-slate-900">
            {totalWorkforce}
          </h2>

          <p className="mt-1 text-xs text-slate-400">
            All teams combined
          </p>

        </div>

        <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-violet-100 text-violet-600">

          <Activity size={14} />

        </div>

      </div>

    </div>

    {/* UTILITY */}

    <div className="group relative overflow-hidden rounded-[14px] border border-white/60
    bg-white/90 px-4 py-2  hover:-translate-y-1
      transition-all duration-300  hover:shadow-[0_20px_60px_rgba(79,70,229,0.18)]">

      <div className="flex items-center justify-between">

        <div>

          <p className="text-sm font-medium text-slate-500">
            Utility Team
          </p>

          <h2 className="mt-1 text-xl font-semibold text-slate-900">
            {totalUtility}
          </h2>

          <p className="mt-1 text-xs text-slate-400">
            Utility + Operations
          </p>

        </div>

        <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-orange-100 text-orange-600">

          <ShieldCheck size={14} />

        </div>

      </div>

    </div>

    {/* ISP */}

    <div className="group relative overflow-hidden rounded-[14px] border border-white/60
    bg-white/90 px-4 py-2 hover:-translate-y-1
      transition-all duration-300  hover:shadow-[0_20px_60px_rgba(79,70,229,0.18)]">

      <div className="flex items-center justify-between">

        <div>

          <p className="text-sm font-medium text-slate-500">
            ISP Engineers
          </p>

          <h2 className="mt-1 text-xl font-semibold text-slate-900">
            {totalISP}
          </h2>

          <p className="mt-1 text-xs text-slate-400">
            ISP Network Team
          </p>

        </div>

        <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-pink-100 text-pink-600">

          <Wifi size={14} />

        </div>

      </div>

    </div>

  </div>

      
      {/* SEARCH, FILTERS */}

  <div className="rounded-[14px] border border-slate-200 bg-white p-2 shadow-sm">

    <div className="grid gap-2 lg:grid-cols-12">

        {/* Search */}
      <div className="lg:col-span-6">

        <div className="relative">

          <Search
            size={14}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
          />

          <input
            type="text"
            placeholder="Search by Circle or CMP..."
            value={search}
            onChange={(e) =>
              setSearch(e.target.value)
            }
            className="h-9 w-full text-sm rounded-xl border border-slate-200 pl-10 pr-4 outline-none"
          />

        </div>

      </div>

        

      {/* Circle Filter */}
  <div className="lg:col-span-2">

        <select
    value={selectedCircle}
    onChange={(e) =>
      setSelectedCircle(e.target.value)
    }
    className="h-9 w-full text-sm rounded-xl border border-slate-200 px-4 outline-none"
  >

    <option value="">
      Select Circle
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
    className="h-9 w-full text-sm rounded-xl border border-slate-200 px-4 outline-none"
  >

    <option value="">
      Select CMP
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
  <div className="flex items-end lg:col-span-2">

      <button
    onClick={() => {
      setSelectedCircle("");
      setSelectedCMP("");
      setSearch("");
    }}
    className="h-10 w-full text-sm rounded-2xl border border-slate-200 bg-slate-50 font-semibold text-slate-700"
  >
    Reset
  </button>

      </div>

    </div>

  </div>


  {/* TABLE */}

  <div
    className="
      overflow-hidden
      rounded-[20px]
      border
      border-slate-200
      bg-white
    "
    style={{
      scrollbarColor: "#f1f5f9 #e2e8f0",
    }}
  >

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
    <>

      {/* TOTAL ROW */}

      <tr className="bg-slate-200 font-bold">

        <td className="sticky left-0 z-20 w-[100px] min-w-[100px] border border-slate-300 bg-slate-200 px-4 py-2">
            {circle}
          </td>

          <td className="sticky left-[100px] z-20 w-[160px] min-w-[160px] border border-slate-300 bg-slate-200 px-4 py-2">
            Total
          </td>

        <td className="border border-slate-300 px-4 py-2 text-center">
          {total.state_leadership_team}
        </td>

        <td className="border border-slate-300 px-4 py-2 text-center">
          {total.noc_executive}
        </td>

        <td className="border border-slate-300 px-4 py-2 text-center">
          {total.analyst}
        </td>

        <td className="border border-slate-300 px-4 py-2 text-center">
          {total.cmp_lead}
        </td>

        <td className="border border-slate-300 px-4 py-2 text-center">
          {total.technician}
        </td>

        <td className="border border-slate-300 px-4 py-2 text-center">
          {total.rigger}
        </td>

        <td className="border border-slate-300 px-4 py-2 text-center">
          {total.utility_supervisor}
        </td>

        <td className="border border-slate-300 px-4 py-2 text-center">
          {total.utility_engineer}
        </td>

        <td className="border border-slate-300 px-4 py-2 text-center">
          {total.isp_engineer}
        </td>

        <td className="border border-slate-300 px-4 py-2 text-center">
          {total.wh_incharge_cum_security}
        </td>

        <td className="border border-slate-300 px-4 py-2 text-center">
          {total.splicer}
        </td>

        <td className="border border-slate-300 px-4 py-2 text-center">
          {total.assistant_splicer}
        </td>

        <td className="border border-slate-300 px-4 py-2 text-center">
          {total.fiber_helper}
        </td>

        <td className="border border-slate-300 px-4 py-2 text-center">
          {total.patroller}
        </td>

        <td className="border border-slate-300 px-4 py-2 text-center">
          {total.fiber_supervisor}
        </td>

        <td className="border border-slate-300 px-4 py-2 text-center">
          {total.fibre_engineer}
        </td>

        <td className="border border-slate-300 px-4 py-2 text-center">
          {total.fttx_splicer}
        </td>

        <td className="border border-slate-300 px-4 py-2 text-center">
          {total.fttx_assistant_splicer}
        </td>

        <td className="border border-slate-300 px-4 py-2 text-center">
          {total.fttx_supervisor}
        </td>

        <td className="border border-slate-300 px-4 py-2 text-center">
          {total.fttx_helper}
        </td>

        <td className="border border-slate-300 px-4 py-2 text-center">
          {total.fttx_engineer}
        </td>

        <td className="border border-slate-300 px-4 py-2 text-center">
          {total.fttx_technician}
        </td>

      </tr>

      {/* CMP ROWS */}

      {circleRows.map((row) => (

        <tr
          key={row.id}
          className="border-b border-slate-100 hover:bg-indigo-50/40"
        >

        <td className="sticky left-0 z-10 w-[100px] min-w-[100px] max-w-[100px] border border-slate-200 bg-white px-2 py-2">
            {row.circle}
          </td>

          <td className="sticky left-[100px] z-10 w-[160px] min-w-[160px] max-w-[160px] border border-slate-200 bg-white px-4 py-2 font-medium">
            {row.cmp}
          </td>

          <td className="border border-slate-200 px-4 py-2 text-center">
            {row.state_leadership_team}
          </td>

          <td className="border border-slate-200 px-4 py-2 text-center">
    {row.noc_executive}
  </td>

  <td className="border border-slate-200 px-4 py-2 text-center">
    {row.analyst}
  </td>

  <td className="border border-slate-200 px-4 py-2 text-center">
    {row.cmp_lead}
  </td>

  <td className="border border-slate-200 px-4 py-2 text-center">
    {row.technician}
  </td>

  <td className="border border-slate-200 px-4 py-2 text-center">
    {row.rigger}
  </td>

  <td className="border border-slate-200 px-4 py-2 text-center">
    {row.utility_supervisor}
  </td>

  <td className="border border-slate-200 px-4 py-2 text-center">
    {row.utility_engineer}
  </td>

  <td className="border border-slate-200 px-4 py-2 text-center">
    {row.isp_engineer}
  </td>

  <td className="border border-slate-200 px-4 py-2 text-center">
    {row.wh_incharge_cum_security}
  </td>

  <td className="border border-slate-200 px-4 py-2 text-center">
    {row.splicer}
  </td>

  <td className="border border-slate-200 px-4 py-2 text-center">
    {row.assistant_splicer}
  </td>

  <td className="border border-slate-200 px-4 py-2 text-center">
    {row.fiber_helper}
  </td>

  <td className="border border-slate-200 px-4 py-2 text-center">
    {row.patroller}
  </td>

  <td className="border border-slate-200 px-4 py-2 text-center">
    {row.fiber_supervisor}
  </td>

  <td className="border border-slate-200 px-4 py-2 text-center">
    {row.fibre_engineer}
  </td>

  <td className="border border-slate-200 px-4 py-2 text-center">
    {row.fttx_splicer}
  </td>

  <td className="border border-slate-200 px-4 py-2 text-center">
    {row.fttx_assistant_splicer}
  </td>

  <td className="border border-slate-200 px-4 py-2 text-center">
    {row.fttx_supervisor}
  </td>

  <td className="border border-slate-200 px-4 py-2 text-center">
    {row.fttx_helper}
  </td>

  <td className="border border-slate-200 px-4 py-2 text-center">
    {row.fttx_engineer}
  </td>

  <td className="border border-slate-200 px-4 py-2 text-center">
    {row.fttx_technician}
  </td>

        </tr>

      ))}

    </>
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
  bg-slate-900/60
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
  bg-white
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
  <Plus className="text-slate-900" size={24}/>
  </div>

  <div>
  <h2 className="text-xl font-semibold text-slate-900">
  Add Record
  </h2>

  <p className="text-slate-600">
  Fill in the details below to add a new record
  </p>
  </div>

  </div>

  <button
  onClick={() => setModalOpen(false)}
  className="text-3xl text-slate-500"
  >
  ×
  </button>

  </div>

  <div className="p-4">

  {/* ORGANIZATION */}

  <div
  className="
  mb-4
  rounded-[18px]
  bg-white
  border border-slate-100
  px-4 py-2
  "
  >

  <h3 className="font-semibold text-sm mb-2">
  Organization Details
  </h3>

  <div className="grid md:grid-cols-2 gap-4">

  <div>


  <select
  value={form.circle}
  onChange={(e)=>
  setForm({
  ...form,
  circle:e.target.value,
  cmp:""
  })
  }
  className="h-9 w-full text-sm rounded-xl border px-4"
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

  </div>

  <div>

  <select
  value={form.cmp}
  onChange={(e)=>
  setForm({
  ...form,
  cmp:e.target.value
  })
  }
  className="h-9 w-full text-sm rounded-xl border px-4"
  >
  <option value="">
  Select CMP
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

  </div>

  </div>

  </div>

  {/* OPERATIONS */}

  <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

    {/* ADMIN */}

  <div className="
  rounded-[18px]
  bg-white
  p-4
  border border-slate-100
  hover:-translate-y-1
  hover:shadow-[0_20px_40px_rgba(99,102,241,0.15)]
  transition-all
  ">

  <h3 className="font-semibold px-1 text-[13px] mb-2">
  ADMIN SECTION
  </h3>

  <input
  placeholder="State Leadership Team"
  value={form.state_leadership_team}
  onChange={(e)=>
  setForm({
  ...form,
  state_leadership_team:e.target.value
  })
  }
  className="h-9 w-full rounded-xl border border-slate-200 text-sm px-4 mb-2"
  />

  <input
  placeholder="NOC Executive"
  value={form.noc_executive}
  onChange={(e)=>
  setForm({
  ...form,
  noc_executive:e.target.value
  })
  }
  className="h-9 w-full rounded-xl border border-slate-200 text-sm px-4 mb-2"
  />

  <input
  placeholder="Analyst"
  value={form.analyst}
  onChange={(e)=>
  setForm({
  ...form,
  analyst:e.target.value
  })
  }
  className="h-9 w-full rounded-xl border border-slate-200 text-sm px-4 mb-2"
  />

  <input
  placeholder="CMP Lead"
  value={form.cmp_lead}
  onChange={(e)=>
  setForm({
  ...form,
  cmp_lead:e.target.value
  })
  }
  className="h-9 w-full rounded-xl border border-slate-200 text-sm px-4 mb-2"
  />

  </div>

  {/* Utility and ISP  */}

  <div className="
  rounded-[18px]
  bg-white
  p-4
  border border-slate-100
  hover:-translate-y-1
  hover:shadow-[0_20px_40px_rgba(99,102,241,0.15)]
  transition-all
  ">

  <h3 className="font-semibold px-1 text-[13px] mb-2">
  Utility and ISP
  </h3>

  <input
  placeholder="Technician"
  value={form.technician}
  onChange={(e)=>setForm({...form,technician:e.target.value})}
  className="h-9 w-full rounded-xl border text-sm px-4 mb-2"
  />

  <input
  placeholder="Rigger"
  value={form.rigger}
  onChange={(e)=>setForm({...form,rigger:e.target.value})}
  className="h-9 w-full rounded-xl border text-sm px-4 mb-2"
  />

  <input
  placeholder="Utility Engineer"
  value={form.utility_engineer}
  onChange={(e)=>setForm({...form,utility_engineer:e.target.value})}
  className="h-9 w-full rounded-xl border text-sm px-4 mb-2"
  />

  <input
  placeholder="Utility Supervisor"
  value={form.utility_supervisor}
  onChange={(e)=>setForm({...form,utility_supervisor:e.target.value})}
  className="h-9 w-full rounded-xl border text-sm px-4 mb-2"
  />

  <input
  placeholder="ISP Engineer"
  value={form.isp_engineer}
  onChange={(e)=>setForm({...form,isp_engineer:e.target.value})}
  className="h-9 w-full rounded-xl border text-sm px-4 mb-2"
  />

  <input
  placeholder="WH Incharge Cum Security"
  value={form.wh_incharge_cum_security}
  onChange={(e)=>setForm({...form,wh_incharge_cum_security:e.target.value})}
  className="h-9 w-full rounded-xl border text-sm px-4 mb-2"
  />

  </div>

  {/* FIBER */}

  <div className="
  rounded-[18px]
  bg-white
  p-4
  border border-slate-100
  hover:-translate-y-1
  hover:shadow-[0_20px_40px_rgba(99,102,241,0.15)]
  transition-all
  ">

  <h3 className="font-semibold px-1 text-[13px] mb-2">
  FIBER OPERATIONS
  </h3>

  <input
  placeholder="Splicer"
  value={form.splicer}
  onChange={(e)=>setForm({...form,splicer:e.target.value})}
  className="h-9 w-full rounded-xl border text-sm px-4 mb-2"
  />

  <input
  placeholder="Assistant Splicer"
  value={form.assistant_splicer}
  onChange={(e)=>setForm({...form,assistant_splicer:e.target.value})}
  className="h-9 w-full rounded-xl border text-sm px-4 mb-2"
  />

  <input
  placeholder="Fiber Helper"
  value={form.fiber_helper}
  onChange={(e)=>setForm({...form,fiber_helper:e.target.value})}
  className="h-9 w-full rounded-xl border text-sm px-4 mb-2"
  />

  <input
  placeholder="Patroller"
  value={form.patroller}
  onChange={(e)=>setForm({...form,patroller:e.target.value})}
  className="h-9 w-full rounded-xl border text-sm px-4 mb-2"
  />

  <input
  placeholder="Fiber Supervisor"
  value={form.fiber_supervisor}
  onChange={(e)=>setForm({...form,fiber_supervisor:e.target.value})}
  className="h-9 w-full rounded-xl border text-sm px-4 mb-2"
  />

  <input
  placeholder="Fibre Engineer"
  value={form.fibre_engineer}
  onChange={(e)=>setForm({...form,fibre_engineer:e.target.value})}
  className="h-9 w-full rounded-xl border text-sm px-4 mb-2"
  />

  </div>

  {/* FTTX */}

  <div className="
  rounded-[18px]
  bg-white
  p-4
  border border-slate-100
  hover:-translate-y-1
  hover:shadow-[0_20px_40px_rgba(99,102,241,0.15)]
  transition-all
  ">

  <h3 className="font-semibold px-1 text-[13px] mb-2">
  FTTX OPERATIONS
  </h3>

  <input placeholder="FTTX Splicer" value={form.fttx_splicer}
  onChange={(e)=>setForm({...form,fttx_splicer:e.target.value})}
  className="h-9 w-full rounded-xl border text-sm px-4 mb-2"/>

  <input placeholder="FTTX Assistant Splicer" value={form.fttx_assistant_splicer}
  onChange={(e)=>setForm({...form,fttx_assistant_splicer:e.target.value})}
  className="h-9 w-full rounded-xl border text-sm px-4 mb-2"/>

  <input placeholder="FTTX Supervisor" value={form.fttx_supervisor}
  onChange={(e)=>setForm({...form,fttx_supervisor:e.target.value})}
  className="h-9 w-full rounded-xl border text-sm px-4 mb-2"/>

  <input placeholder="FTTX Helper" value={form.fttx_helper}
  onChange={(e)=>setForm({...form,fttx_helper:e.target.value})}
  className="h-9 w-full rounded-xl border text-sm px-4 mb-2"/>

  </div>

  {/* FTTX PO BASED */}
  <div className="
  rounded-[18px]
  bg-white
  p-4
  border border-slate-100
  hover:-translate-y-1
  hover:shadow-[0_20px_40px_rgba(99,102,241,0.15)]
  transition-all
  ">
    <h3 className="font-semibold px-1 text-[13px] mb-2">
      FTTX PO BASED
    </h3>
    <input placeholder="FTTX Engineer" value={form.fttx_engineer}
    onChange={(e)=>setForm({...form,fttx_engineer:e.target.value})}
    className="h-9 w-full rounded-xl border text-sm px-4 mb-2"/>

  <input placeholder="FTTX Technician" value={form.fttx_technician}
  onChange={(e)=>setForm({...form,fttx_technician:e.target.value})}
  className="h-9 w-full rounded-xl border text-sm px-4 mb-2"/>
    
    </div>

  </div>

  </div>

  <div className="sticky bottom-0 border-t bg-white p-4 flex justify-end gap-4">

  <button
  onClick={() => setModalOpen(false)}
  className="px-4 py-2 rounded-xl border"
  >
  Cancel
  </button>

  <button
  onClick={saveData}
  className="
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
  "
  >
  Save Record
  </button>

  </div>

  </div>
  </div>
  )}

  {approvalModalOpen && (
   <div className="
fixed inset-0 z-[99999]
bg-slate-900/40
backdrop-blur-md
flex items-center justify-center
p-4
">
  <div
  className="
  bg-white
  w-[95vw]
  h-[88vh]
  rounded-[18px]
  border border-slate-200
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
bg-gradient-to-r
from-slate-50
to-white
sticky
top-0
z-30
"
>
       <div>
  <h2 className="text-xl font-semibold text-slate-900">
    Pending Requests
  </h2>

  <p className="text-sm text-slate-500">
    Real-time overview of pending requests across circles
  </p>
</div>
          <button
            onClick={() => setApprovalModalOpen(false)}
            className="text-2xl"
          >
            ×
          </button>
        </div>

      <div className="flex-1 overflow-hidden">
    
    <div
      className="
        h-full
        overflow-x-auto
        overflow-y-auto
        scroll-smooth
      "
    >

  <table className="min-w-[1240px] border-collapse text-sm">

  <thead className="sticky top-0 z-20">

  <tr className="
bg-gradient-to-r
from-[#082f49]
via-[#0c4a6e]
to-[#082f49]
text-white
shadow-lg
">

  <th className="border px-4 py-3 whitespace-nowrap text-center font-semibold">
    Circle
  </th>
  <th className="border px-4 py-3 whitespace-nowrap text-center font-semibold">
    CMP
  </th>
  <th className="border px-4 py-3 whitespace-nowrap text-center font-semibold">
    State Leadership Team
  </th>
  <th className="border px-4 py-3 whitespace-nowrap text-center font-semibold">
    NOC Executive
  </th>
  <th className="border px-4 py-3 whitespace-nowrap text-center font-semibold">
    Analyst
  </th>
  <th className="border px-4 py-3 whitespace-nowrap text-center font-semibold">
    CMP Lead
  </th>

  <th className="border px-4 py-3 whitespace-nowrap text-center font-semibold">
    Technician
  </th>
  <th className="border px-4 py-3 whitespace-nowrap text-center font-semibold">
    Rigger
  </th>
  <th className="border px-4 py-3 whitespace-nowrap text-center font-semibold">
    Utility Supervisor
  </th>
  <th className="border px-4 py-3 whitespace-nowrap text-center font-semibold">
    Utility Engineer
  </th>
  <th className="border px-4 py-3 whitespace-nowrap text-center font-semibold">
    ISP Engineer
  </th>
  <th className="border px-4 py-3 whitespace-nowrap text-center font-semibold">
    WH Incharge
  </th>

  <th className="border px-4 py-3 whitespace-nowrap text-center font-semibold">
    Splicer
  </th>
  <th className="border px-4 py-3 whitespace-nowrap text-center font-semibold">
    Assistant Splicer
  </th>
  <th className="border px-4 py-3 whitespace-nowrap text-center font-semibold">
    Fiber Helper
  </th>
  <th className="border px-4 py-3 whitespace-nowrap text-center font-semibold">
    Patroller
  </th>
  <th className="border px-4 py-3 whitespace-nowrap text-center font-semibold">
    Fiber Supervisor
  </th>
  <th className="border px-4 py-3 whitespace-nowrap text-center font-semibold">
    Fibre Engineer
  </th>

  <th className="border px-4 py-3 whitespace-nowrap text-center font-semibold">
    FTTX Splicer
  </th>
  <th className="border px-4 py-3 whitespace-nowrap text-center font-semibold">
    FTTX Assistant
  </th>
  <th className="border px-4 py-3 whitespace-nowrap text-center font-semibold">
    FTTX Supervisor
  </th>
  <th className="border px-4 py-3 whitespace-nowrap text-center font-semibold">
    FTTX Helper
  </th>

  <th className="border px-4 py-3 whitespace-nowrap text-center font-semibold">
    FTTX Engineer
  </th>
  <th className="border px-4 py-3 whitespace-nowrap text-center font-semibold">
    FTTX Technician
  </th>

  <th>Status</th>
  <th>Action</th>

  </tr>

  </thead>

  <tbody>

  {!pendingRequests?.length ? (

  <tr>
    <td
      colSpan="7"
      className="text-center p-6"
    >
      No Pending Requests Found
    </td>
  </tr>

  ) : (

  pendingRequests.map((row, index) => (

 <tr
  key={row.id || index}
  className="
  bg-white
  hover:bg-blue-50
  transition-all
  duration-200
  "
>

  <td className="border px-4 py-2 text-center whitespace-nowrap">
    {row.circle}
  </td>
  <td className="border px-4 py-2 text-center whitespace-nowrap">
    {row.cmp}
  </td>

  <td className="border px-4 py-2 text-center whitespace-nowrap">
    {row.state_leadership_team}
  </td>
  <td className="border px-4 py-2 text-center whitespace-nowrap">
    {row.noc_executive}
  </td>
  <td className="border px-4 py-2 text-center whitespace-nowrap">
    {row.analyst}
  </td>
  <td className="border px-4 py-2 text-center whitespace-nowrap">
    {row.cmp_lead}
  </td>

  <td className="border px-4 py-2 text-center whitespace-nowrap">
    {row.technician}
  </td>
  <td className="border px-4 py-2 text-center whitespace-nowrap">
    {row.rigger}
  </td>
  <td className="border px-4 py-2 text-center whitespace-nowrap">
    {row.utility_supervisor}
  </td>
  <td className="border px-4 py-2 text-center whitespace-nowrap">
    {row.utility_engineer}
  </td>
  <td className="border px-4 py-2 text-center whitespace-nowrap">
    {row.isp_engineer}
  </td>
  <td className="border px-4 py-2 text-center whitespace-nowrap">
    {row.wh_incharge_cum_security}
  </td>

  <td className="border px-4 py-2 text-center whitespace-nowrap">
    {row.splicer}
  </td>
  <td className="border px-4 py-2 text-center whitespace-nowrap">
    {row.assistant_splicer}
  </td>
  <td className="border px-4 py-2 text-center whitespace-nowrap">
    {row.fiber_helper}
  </td>
  <td className="border px-4 py-2 text-center whitespace-nowrap">
    {row.patroller}
  </td>
  <td className="border px-4 py-2 text-center whitespace-nowrap">
    {row.fiber_supervisor}
  </td>
  <td className="border px-4 py-2 text-center whitespace-nowrap">
    {row.fibre_engineer}
  </td>

  <td className="border px-4 py-2 text-center whitespace-nowrap">
    {row.fttx_splicer}
  </td>
  <td className="border px-4 py-2 text-center whitespace-nowrap">
    {row.fttx_assistant_splicer}
  </td>
  <td className="border px-4 py-2 text-center whitespace-nowrap">
    {row.fttx_supervisor}
  </td>
  <td className="border px-4 py-2 text-center whitespace-nowrap">
    {row.fttx_helper}
  </td>

  <td className="border px-4 py-2 text-center whitespace-nowrap">
    {row.fttx_engineer}
  </td>
  <td className="border px-4 py-2 text-center whitespace-nowrap">
    {row.fttx_technician}
  </td>

  <td className="border px-4 py-2 text-center">

  <span
  className={`px-4 py-2 rounded-full text-xs font-bold shadow-sm ${
    row.status === "APPROVED"
      ? "bg-green-100 text-green-700"
      : row.status === "REJECTED"
      ? "bg-red-100 text-red-700"
      : "bg-yellow-100 text-yellow-700"
  }`}
  >
    {row.status}
  </span>

  </td>

 <td className="border px-4 py-2">

  <div className="flex items-center justify-center gap-3">

    <button
      onClick={() => approveRequest(row.id)}
      className="bg-green-600 text-white px-3 py-1 rounded-lg"
    >
      Approve
    </button>

    <button
      onClick={() => rejectRequest(row.id)}
      className="bg-red-600 text-white px-3 py-1 rounded-lg"
    >
      Reject
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
  )}

      </div>
    );
  }



  export default Signoff;
