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
  technicianb: "",
  riggerb: "",
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

const [selectedCircle, setSelectedCircle] =
  useState("");

const [selectedCMP, setSelectedCMP] =
  useState("");
const [uploading, setUploading] =
  useState(false);

  useEffect(() => {
    loadData();
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

technicianb:
  Number(row.technicianb) || 0,

riggerb:
  Number(row.riggerb) || 0,
    }));

  try {

  for (const row of formattedData) {

    await axios.post(
      buildApiUrl("/api/signoff"),
      row,
      { headers }
    );
  }

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

      if (editingId) {

        await axios.put(
          buildApiUrl(
            `/api/signoff/${editingId}`
          ),
          form,
          { headers }
        );

        toast.success("Updated");

      } else {

        await axios.post(
          buildApiUrl("/api/signoff"),
          form,
          { headers }
        );

        toast.success("Created");
      }

      setModalOpen(false);

      loadData();

    } catch {

      toast.error("Save failed");
    }
  };

  /* EXPORT CSV */

const exportCSV = () => {

  const exportData = filteredRows.map(
    (row) => ({
      Circle: row.circle,
      CMP: row.cmp,

      "State Leadership Team":
        row.state_leadership_team,

      "NOC Executive":
        row.noc_executive,

      Analyst: row.analyst,

      "CMP Lead":
        row.cmp_lead,

      Technician:
        row.technician,

      Rigger: row.rigger,

      "Utility Supervisor":
        row.utility_supervisor,

      "Utility Engineer":
        row.utility_engineer,

      "ISP Engineer":
        row.isp_engineer,

      "WH Incharge":
        row.wh_incharge_cum_security,
    })
  );

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

sum.bench +=
  Number(row.technicianb || 0) +
  Number(row.riggerb || 0);

      return sum;

    },

   {
  admin: 0,
  utility: 0,
  fiber: 0,
  fttx: 0,
  fttxPo: 0,
  bench: 0,
}

  );

}, [filteredRows]);

  return (
    <div className="min-h-screen space-y-3">

      {/* HEADER */}
      <div className="rounded-[14px] border border-white/70 bg-white/80 px-4 py-3 shadow-[0_20px_80px_rgba(15,23,42,0.08)]">

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

    {uploading
  ? "Uploading..."
  : "Upload Excel"}

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

<div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">

  {/* TOTAL CIRCLES */}

   <div className="group relative overflow-visible rounded-[14px] border border-white/60
   bg-white/90 px-4 py-2 shadow-[0_10px_40px_rgba(15,23,42,0.08)] hover:-translate-y-1
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
   bg-white/90 px-4 py-2 shadow-[0_10px_40px_rgba(15,23,42,0.08)] hover:-translate-y-1
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
   bg-white/90 px-4 py-2 shadow-[0_10px_40px_rgba(15,23,42,0.08)] hover:-translate-y-1
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
   bg-white/90 px-4 py-2 shadow-[0_10px_40px_rgba(15,23,42,0.08)] hover:-translate-y-1
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
   bg-white/90 px-4 py-2 shadow-[0_10px_40px_rgba(15,23,42,0.08)] hover:-translate-y-1
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
    shadow-[0_10px_40px_rgba(15,23,42,0.08)]
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
    className="sticky left-0 z-50 min-w-[400px] border border-slate-500 bg-[#0b2945] px-4 py-2"
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

  {/* BENCH */}
  <th
    colSpan={2}
    className="border border-slate-500 px-4 py-2 text-center text-xs font-semibold"
  >
    {`Bench Strength (${categoryTotals.bench})`}
  </th>

</tr>

        {/* COLUMN HEADERS */}

      <tr className="sticky bg-[#0d3557] text-white text-xs backdrop-blur-md">

          <th className="sticky left-0 z-50 border border-slate-500 bg-[#0d3557] px-4 py-2 whitespace-nowrap">
            Circle
          </th>

          <th className="sticky left-[180px] z-50 border border-slate-500 bg-[#0d3557] px-4 py-2 whitespace-nowrap">
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

          <th className="border border-slate-500 px-4 py-2">
            TechnicianB
          </th>

          <th className="border border-slate-500 px-4 py-2">
            RiggerB
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

      technicianb:
        sum.technicianb +
        Number(row.technicianb || 0),

      riggerb:
        sum.riggerb +
        Number(row.riggerb || 0),

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
      technicianb: 0,
      riggerb: 0,
    }
  );

  return (
  <>

    {/* TOTAL ROW */}

    <tr className="bg-slate-200 font-bold">

        <td className="sticky left-0 z-20 min-w-[180px] border border-slate-300 bg-slate-200 px-4 py-2">
          {circle}
        </td>

        <td className="sticky left-[180px] z-20 min-w-[220px] border border-slate-300 bg-slate-200 px-4 py-2">
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

      <td className="border border-slate-300 px-4 py-2 text-center">
        {total.technicianb}
      </td>

      <td className="border border-slate-300 px-4 py-2 text-center">
        {total.riggerb}
      </td>

    </tr>

    {/* CMP ROWS */}

    {circleRows.map((row) => (

      <tr
        key={row.id}
        className="border-b border-slate-100 hover:bg-indigo-50/40"
      >

        <td className="sticky left-0 z-10 min-w-[180px] border border-slate-200 bg-white px-4 py-2">
          {row.circle}
        </td>

        <td className="sticky left-[180px] z-10 min-w-[220px] border border-slate-200 bg-white px-4 py-2 font-medium">
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

<td className="border border-slate-200 px-4 py-2 text-center">
  {row.technicianb}
</td>

<td className="border border-slate-200 px-4 py-2 text-center">
  {row.riggerb}
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

  <div
  className="fixed top-0 left-0 w-screen h-screen z-[99999] flex items-center justify-center bg-black/40 backdrop-blur-md overflow-y-auto p-4"
  style={{
    WebkitBackdropFilter: "blur(8px)",
    backdropFilter: "blur(8px)",
  }}
>

      <div className="max-h-[100vh] w-full max-w-7xl overflow-y-auto rounded-[18px] bg-white px-6 py-4">

      <div className="mb-4 flex items-center justify-between">

        <h2 className="text-lg font-semibold">
          {editingId
            ? "Edit Record"
            : "Add Record"}
        </h2>

        <button
          onClick={() =>
            setModalOpen(false)
          }
          className="text-2xl"
        >
          ×
        </button>

      </div>

      <div className="grid gap-4 md:grid-cols-5">

        {Object.keys(initialForm).map((key) => (

          <div
            key={key}
            className="flex flex-col gap-2"
          >

            {/* LABEL */}

            <label className="text-xs px-2 font-semibold text-slate-700">

              {key
                .replaceAll("_", " ")
                .toUpperCase()}

            </label>

         {/* CIRCLE DROPDOWN */}

{key === "circle" ? (
  <>
    <select
      value={form[key]}
      onChange={(e) =>
        setForm({
          ...form,
          [key]: e.target.value,
        })
      }
      className="h-9 text-sm rounded-xl border border-slate-200 bg-white px-2 outline-none"
    >

      <option value="">
        Select Circle
      </option>

      <option value="Punjab">
        Punjab
      </option>

      <option value="Delhi">
        Delhi
      </option>

      <option value="Haryana">
        Haryana
      </option>

      <option value="UP East">
        UP East
      </option>

    </select>

    {errors.circle && (
      <p className="text-xs text-red-500 px-1">
        {errors.circle}
      </p>
    )}

  </>

) : key === "cmp" ? (

  /* CMP DROPDOWN */

  <>

    <select
      value={form[key]}
      onChange={(e) =>
        setForm({
          ...form,
          [key]: e.target.value,
        })
      }
      className="h-9 text-sm rounded-xl border border-slate-200 bg-white px-2 outline-none"
    >

      <option value="">
        Select CMP
      </option>

      <option value="Delhi SHQ">
  Delhi SHQ
</option>

<option value="Haryana SHQ">
  Haryana SHQ
</option>

<option value="Punjab SHQ">
  Punjab SHQ
</option>

<option value="UP East SHQ">
  UP East SHQ
</option>

      {/* DELHI */}
      <option value="Delhi-1 (West)">
        Delhi-1 (West)
      </option>

      <option value="Delhi-2 (South)">
        Delhi-2 (South)
      </option>

      <option value="Delhi-3 (Central-East)">
        Delhi-3 (Central-East)
      </option>

      <option value="Delhi-4 (North)">
        Delhi-4 (North)
      </option>

      <option value="Faridabad (NCR)">
        Faridabad (NCR)
      </option>

      <option value="Ghaziabad (NCR)">
        Ghaziabad (NCR)
      </option>

      <option value="Gurgaon (NCR)">
        Gurgaon (NCR)
      </option>

      <option value="Noida (NCR)">
        Noida (NCR)
      </option>

      {/* HARYANA */}
      <option value="Ambala">
        Ambala
      </option>

      <option value="Hissar">
        Hissar
      </option>

      <option value="Karnal">
        Karnal
      </option>

      <option value="Panipat">
        Panipat
      </option>

      <option value="Rewari">
        Rewari
      </option>

      <option value="Rohtak">
        Rohtak
      </option>

      {/* PUNJAB */}
      <option value="Amritsar">
        Amritsar
      </option>

      <option value="Bathinda">
        Bathinda
      </option>

      <option value="Chandigarh">
        Chandigarh
      </option>

      <option value="Jalandhar">
        Jalandhar
      </option>

      <option value="Ludhiana-1">
        Ludhiana-1
      </option>

      <option value="Ludhiana-2">
        Ludhiana-2
      </option>

      <option value="Pathankot">
        Pathankot
      </option>

      <option value="Patiala">
        Patiala
      </option>

      <option value="Sangrur">
        Sangrur
      </option>

      {/* UP EAST */}
      <option value="Allahabad">
        Allahabad
      </option>

      <option value="Azamgarh">
        Azamgarh
      </option>

      <option value="Faizabad">
        Faizabad
      </option>

      <option value="Gorakhpur">
        Gorakhpur
      </option>

      <option value="Nanded">
        Nanded
      </option>

      <option value="Raibareilly">
        Raibareilly
      </option>

      <option value="Varanasi">
        Varanasi
      </option>

    </select>

    {errors.cmp && (
      <p className="text-xs text-red-500 px-1">
        {errors.cmp}
      </p>
    )}

  </>

) : (

              /* NORMAL INPUT */

              <input
                type="text"
                placeholder={`Enter ${key
                  .replaceAll("_", " ")}`}
                value={form[key]}
                onChange={(e) =>
                  setForm({
                    ...form,
                    [key]: e.target.value,
                  })
                }
                className="h-9 text-sm rounded-xl border border-slate-200 bg-white px-2 outline-none"
              />

            )}

          </div>

        ))}

      </div>

      <div className="m-2 flex justify-end gap-3">

        <button
          onClick={() =>
            setModalOpen(false)
          }
          className="rounded-lg text-sm border border-slate-200 px-4 py-1"
        >
          Cancel
        </button>

        <button
          onClick={saveData}
          className="rounded-lg text-sm bg-indigo-600 px-4 py-1 text-white"
        >
          Save
        </button>

      </div>

    </div>

  </div>

)}

    </div>
  );
}

export default Signoff;
