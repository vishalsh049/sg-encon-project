import React, { useEffect, useRef, useState } from "react";
import { buildApiUrl } from "../lib/api";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CalendarRange,
  CheckCircle2,
  Clock3,
  Globe,
  Plus,
  RadioTower,
  ReceiptText,
  RotateCcw,
  Sparkles
} from "lucide-react";

const months = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

const fullMonthMap = {
  Jan: "January",
  Feb: "February",
  Mar: "March",
  Apr: "April",
  May: "May",
  Jun: "June",
  Jul: "July",
  Aug: "August",
  Sep: "September",
  Oct: "October",
  Nov: "November",
  Dec: "December"
};

const circleOptions = ["Haryana", "Punjab", "Delhi", "UP East"];
const billingOptions = ["Tower", "Fiber", "FTTx", "MFL", "ODSC & ESC"];

const normalizeMonth = (m) => {
  const map = {
    January: "Jan",
    February: "Feb",
    March: "Mar",
    April: "Apr",
    May: "May",
    June: "Jun",
    July: "Jul",
    August: "Aug",
    September: "Sep",
    October: "Oct",
    November: "Nov",
    December: "Dec"
  };

  return map[m] || m;
};

const getStatusTone = (status) => {
  if (status === "Done") {
    return "bg-emerald-100/90 text-emerald-700 ring-1 ring-emerald-200 shadow-[0_12px_30px_rgba(16,185,129,0.18)]";
  }

  if (status === "Pending") {
    return "bg-amber-100/90 text-amber-800 ring-1 ring-amber-200 shadow-[0_12px_30px_rgba(245,158,11,0.18)]";
  }

  return "bg-rose-100/90 text-rose-700 ring-1 ring-rose-200 shadow-[0_12px_30px_rgba(244,63,94,0.18)]";
};

function MetricCard({ label, value, context, icon: Icon, iconTone }) {
  return (
    <div className="group relative h-full overflow-hidden rounded-[24px] border border-white/70 bg-white/70 p-4 shadow-[0_24px_80px_rgba(15,23,42,0.10)] backdrop-blur-2xl transition duration-300 hover:-translate-y-1.5 hover:shadow-[0_32px_90px_rgba(15,23,42,0.14)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.92),transparent_40%)]" />
      <div className="relative flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
            {label}
          </p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-800">
            {value}
          </h2>
          <p className="mt-1 text-xs leading-5 text-slate-600 tracking-[0.05em] ">
            {context}
          </p>


        </div>

        <div className={`flex h-10 w-10 items-center justify-center rounded-full ring-1 ${iconTone}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

function FilterSelect({ value, onChange, icon: Icon, placeholder, options }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={ref} className="relative min-w-[170px]">

      {/* INPUT */}
      <div
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-full border border-white/80 bg-white/80 px-4 py-3 shadow-[0_10px_30px_rgba(15,23,42,0.08)] backdrop-blur-xl cursor-pointer transition hover:border-blue-200"
      >
        <Icon className="h-4 w-4 text-slate-400" />

        <span className={`flex-1 text-sm font-medium ${value ? "text-slate-700" : "text-slate-400"}`}>
          {options.find(o => o.value === value)?.label || placeholder}
        </span>

        <ArrowRight className={`h-4 w-4 text-slate-400 transition ${open ? "rotate-270" : "rotate-90"}`} />
      </div>

      {/* DROPDOWN */}
      {open && (
        <div className="absolute left-0 top-full z-[9999] mt-2 w-full rounded-2xl border
         border-white/80 bg-white/95 shadow-[0_20px_60px_rgba(15,23,42,0.12)] backdrop-blur-xl
          overflow-hidden">

          {options.map((option) => (
            <div
              key={option.value}
              onClick={() => {
                onChange({ target: { value: option.value } });
                setOpen(false);
              }}
              className={`px-4 py-2 text-sm cursor-pointer transition
                ${value === option.value ? "bg-blue-100 text-blue-700 font-semibold" : "text-slate-700 hover:bg-blue-50"}
              `}
            >
              {option.label}
            </div>
          ))}

        </div>
      )}
    </div>
  );
}

function StatusBlock({ label, status, note }) {
  return (
    <div className="flex min-h-[76px] flex-col items-start rounded-[20px] bg-white p-4">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400 lg:hidden">
        {label}
      </p>
      <span className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold ${getStatusTone(status)}`}>
        {status === "Done" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Clock3 className="h-3.5 w-3.5" />}
        {status || "N/A"}
      </span>
      <p className="mt-3 text-sm leading-6 text-slate-500">
        {note || "No pending notes added."}
      </p>
    </div>
  );
}

export default function BillingStatus() {
  const [data, setData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [openMonth, setOpenMonth] = useState(false);
  const [openCircle, setOpenCircle] = useState(false);
  const [openBilling, setOpenBilling] = useState(false);
  const [timeFilter, setTimeFilter] = useState("3");
  const [circleFilter, setCircleFilter] = useState("");
  const [billingFilter, setBillingFilter] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [displayCounts, setDisplayCounts] = useState({
    total: 0,
    completed: 0,
    pending: 0
  });
  const monthRef = useRef(null);
  const circleRef = useRef(null);
  const billingRef = useRef(null);

  const [form, setForm] = useState({
    circle: "",
    billingType: "",
    month: "",
    sixty: "",
    sixty_note: "",
    forty: "",
    forty_note: "",
    kpi: "",
    kpi_note: ""
  });

  const getFilteredMonths = () => {
    const currentIndex = new Date().getMonth();

    if (timeFilter === "3") {
      return Array.from({ length: 3 }, (_, i) => months[(currentIndex - i + 12) % 12]);
    }

    if (timeFilter === "6") {
      return Array.from({ length: 6 }, (_, i) => months[(currentIndex - i + 12) % 12]);
    }

    if (timeFilter === "12") {
      return months;
    }

    return [];
  };

  useEffect(() => {
    if (showForm) {
      document.body.style.overflow = "hidden";
      document.body.style.paddingRight = "8px";
    } else {
      document.body.style.overflow = "auto";
      document.body.style.paddingRight = "0px";
    }

    return () => {
      document.body.style.overflow = "auto";
      document.body.style.paddingRight = "0px";
    };
  }, [showForm]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        monthRef.current && !monthRef.current.contains(event.target) &&
        circleRef.current && !circleRef.current.contains(event.target) &&
        billingRef.current && !billingRef.current.contains(event.target)
      ) {
        setOpenMonth(false);
        setOpenCircle(false);
        setOpenBilling(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    fetchBillingStatus();
  }, []);

  const fetchBillingStatus = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(buildApiUrl("/api/billing/status"));
      let result;
      try {
        result = await res.json();
      } catch {
        result = [];
      }
      setData(Array.isArray(result) ? result : []);
    } catch (err) {
      console.error("Error fetching billing status:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const [card1Filter, setCard1Filter] = useState({
    month: "",
    circle: "",
    billingType: ""
  });

  const [card2Filter, setCard2Filter] = useState({
    month: "",
    circle: "",
    billingType: ""
  });

  const [card3Filter, setCard3Filter] = useState({
    month: "",
    circle: "",
    billingType: ""
  });

  const card1Data = data.filter((row) => {
    const monthFilter = getFilteredMonths();

    return (
      (!timeFilter || monthFilter.includes(row.month)) &&
      (!card1Filter.month || row.month === card1Filter.month) &&
      (!card1Filter.circle || row.circle === card1Filter.circle) &&
      (!card1Filter.billingType || row.billing_type === card1Filter.billingType)
    );
  });

   const filteredStatsData = data.filter((row) => {
  const monthFilter = getFilteredMonths();

  return (
    (!timeFilter || monthFilter.includes(row.month)) &&
    (!circleFilter || row.circle === circleFilter) &&
    (!billingFilter || row.billing_type === billingFilter)
  );
});

  const totalTasks = filteredStatsData.length * 3;

const completedTasks = filteredStatsData.reduce((acc, row) => {
  let count = 0;
  if (row.sixty === "Done") count++;
  if (row.forty === "Done") count++;
  if (row.kpi === "Done") count++;
  return acc + count;
}, 0);

const pendingTasks = totalTasks - completedTasks;

  useEffect(() => {
    const duration = 700;
    let frameId;
    const start = performance.now();

    const animate = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);

      setDisplayCounts({
        total: Math.round(totalTasks * eased),
        completed: Math.round(completedTasks * eased),
        pending: Math.round(pendingTasks * eased)
      });

      if (progress < 1) {
        frameId = requestAnimationFrame(animate);
      }
    };

    frameId = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(frameId);
  }, [totalTasks, completedTasks, pendingTasks]);

  const card2Data = data.filter((row) => {
    const monthFilter = getFilteredMonths();

    return (
      (!timeFilter || monthFilter.includes(row.month)) &&
      (!card2Filter.month || row.month === card2Filter.month) &&
      (!card2Filter.circle || row.circle === card2Filter.circle) &&
      (!card2Filter.billingType || row.billing_type === card2Filter.billingType)
    );
  });

  const card3Data = data.filter((row) => {
    const monthFilter = getFilteredMonths();

    return (
      (!timeFilter || monthFilter.includes(row.month)) &&
      (!card3Filter.month || row.month === card3Filter.month) &&
      (!card3Filter.circle || row.circle === card3Filter.circle) &&
      (!card3Filter.billingType || row.billing_type === card3Filter.billingType)
    );
  });

  void card1Data;
  void card2Data;
  void card3Data;
  void setCard1Filter;
  void setCard2Filter;
  void setCard3Filter;

  const handleChange = (e) => {
    setForm((prev) => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  const handleSubmit = async () => {
  if (isSaving) return; // prevent double click

  setIsSaving(true);

  try {
    if (!form.month) {
      alert("Please select Month");
      setIsSaving(false);
      return;
    }

    if (!form.circle) {
      alert("Please select Circle");
      setIsSaving(false);
      return;
    }

    if (!form.billingType) {
      alert("Please select Billing Type");
      setIsSaving(false);
      return;
    }

    if (!form.sixty) {
      alert("Please select 60% status");
      setIsSaving(false);
      return;
    }

    if (!form.forty) {
      alert("Please select 40% status");
      setIsSaving(false);
      return;
    }

    if (!form.kpi) {
      alert("Please select KPI status");
      setIsSaving(false);
      return;
    }

    const res = await fetch(buildApiUrl("/api/billing/status"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(form)
    });

    if (!res.ok) {
      alert("Save failed");
      setIsSaving(false);
      return;
    }

    alert("Saved successfully");
    setShowForm(false);
    fetchBillingStatus();

  } catch (err) {
    console.error(err);
    alert("Server error");
  } finally {
    setIsSaving(false); // always reset
  }
};

  const normalizeRow = (row) => {
    const get = (keys) => {
      for (const k of keys) {
        if (row[k] !== undefined) return row[k];
      }
      return "";
    };

    return {
      circle: get(["circle", "Circle", "CIRCLE"]),
      billing_type: get(["billing_type", "Billing", "Billing Type", "Type"]),
      month: get(["month", "Month"]),
      sixty: get(["sixty", "60", "60%", "kpi_60"]),
      forty: get(["forty", "40", "40%", "kpi_40"]),
      kpi: get(["kpi", "KPI", "Total", "penalty", "KPIs status+GN Penalty"])
    };
  };

  function StatusSelect({ value, onChange, placeholder }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const options = ["Done", "Pending"];

  return (
    <div ref={ref} className="relative w-full">
     <div
  onClick={() => setOpen(!open)}
  className="flex items-center justify-between rounded-xl border border-white/80 bg-white/90 px-4 py-3 text-sm font-medium text-slate-700 shadow-sm cursor-pointer hover:border-blue-200 transition"
>
  <span className="mx-auto">
    {value || placeholder}
  </span>

  <span className={`text-xs transition ${open ? "rotate-180" : ""}`}>
    ▼
  </span>
</div>

      {open && (
        <div className="absolute left-0 top-full z-[99999] mt-2 w-full rounded-xl border border-white/80 bg-white shadow-lg overflow-hidden">
          {options.map((option) => (
            <div
              key={option}
              onClick={() => {
                onChange({ target: { value: option } });
                setOpen(false);
              }}
              className={`px-4 py-2 text-center text-sm cursor-pointer transition
                ${value === option
                  ? "bg-blue-100 text-blue-700 font-semibold"
                  : "hover:bg-blue-50 text-slate-700"}
              `}
            >
              {option}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

  {/* The main return statement rendering the dashboard UI */ }

  return (
    <div className="min-h-screen -mt-4">
      <div className="pointer-events-none fixed inset-0 opacity-[0.18] [background-image:radial-gradient(rgba(148,163,184,0.15)_0.7px,transparent_0.7px)] [background-size:16px_16px]" />
      <div className="relative space-y-4">
      
        <div className="relative overflow-hidden rounded-[28px] border border-white/70
         bg-[linear-gradient(135deg,rgba(219,234,254,0.82),rgba(255,255,255,0.9),rgba(237,233,254,0.9))]
          p-5 shadow-[0_30px_90px_rgba(59,130,246,0.12)] backdrop-blur-2xl">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(96,165,250,0.25),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(168,85,247,0.20),transparent_35%)]" />
          <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.34em] text-indigo-600">
                BILLING DASHBOARD
              </p>
              <h1 className="max-w-xl text-2xl font-bold tracking-tight text-slate-800 sm:text-2xl">
                Billing status with real-time insights
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-7 text-slate-600 sm:text-base">
                Monitor billing progress, track KPI completion, and manage pending tasks.
              </p>
            </div>

            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center justify-center gap-2 self-start rounded-full
               bg-gradient-to-r from-blue-600 via-indigo-500 to-violet-500 px-5 py-3 text-sm font-semibold
                text-white shadow-[0_20px_40px_rgba(79,70,229,0.30)] transition duration-300 hover:scale-[1.02]
                 hover:from-blue-500 hover:to-violet-500 hover:shadow-[0_24px_60px_rgba(99,102,241,0.38)] 
                 lg:self-center">
              <Plus className="h-4 w-4" />
              Add Data
            </button>
          </div>
        </div>

       <div className="mt-4 grid gap-3 md:grid-cols-[0.9fr_0.9fr_0.9fr_1.3fr] items-stretch">
          <MetricCard
            label="Total Tasks"
            value={displayCounts.total}
            context="All active items"
            icon={Globe}
            iconTone="bg-blue-100 text-blue-700 ring-blue-200"
          />
          <MetricCard
            label="Completed Tasks"
            value={displayCounts.completed}
            context="Work completed"
            icon={BarChart3}
            iconTone="bg-emerald-100 text-emerald-700 ring-emerald-200"
          />
          <MetricCard
            label="Pending Tasks"
            value={displayCounts.pending}
            context="Action required"
            icon={AlertTriangle}
            iconTone="bg-amber-100 text-amber-700 ring-amber-200"
          />

  <div className="flex h-full flex-col justify-center gap-2 rounded-[24px] border
   border-white/70 bg-white/65 p-2 shadow-[0_24px_70px_rgba(15,23,42,0.10)]">

  {/* Row 1 */}
<div className="flex items-center justify-between gap-2">

  {/* Left - Filter */}
  <div className="flex-1">
    <FilterSelect
      value={timeFilter}
      onChange={(e) => setTimeFilter(e.target.value)}
      icon={CalendarRange}
      placeholder="Last 3 Months"
      options={[
        { value: "3", label: "Last 3 Months" },
        { value: "6", label: "Last 6 Months" },
        { value: "12", label: "Last 1 Year" }
      ]}
    />
  </div>

  {/* Right - Reset Button */}
  <button
  onClick={() => {
    setTimeFilter("3");
    setCircleFilter("");
    setBillingFilter("");
  }}
  className="flex items-center gap-2 whitespace-nowrap rounded-full border
   border-white/70 bg-white/65 shadow-[0_24px_70px_rgba(15,23,42,0.10)] px-4 py-3 text-xs font-semibold transition"
>
  <RotateCcw className="h-3.5 w-3.5" />
  Reset
</button>

</div>

  {/* Row 2 */}
  <div className="grid grid-cols-2 gap-2">
    <FilterSelect
      value={circleFilter}
      onChange={(e) => setCircleFilter(e.target.value)}
      icon={RadioTower}
      placeholder="Circle"
      options={circleOptions.map((item) => ({ value: item, label: item }))}
    />

    <FilterSelect
      value={billingFilter}
      onChange={(e) => setBillingFilter(e.target.value)}
      icon={ReceiptText}
      placeholder="Billing Type"
      options={billingOptions.map((item) => ({ value: item, label: item }))}
    />
  </div>

</div>

        </div>   

        {(timeFilter ? getFilteredMonths() : months).map((monthName) => {
          const filteredData = data.filter((row) => {
            return (
              normalizeMonth(row.month) === monthName &&
              (!circleFilter || row.circle === circleFilter) &&
              (!billingFilter || row.billing_type === billingFilter)
            );
          });

          if (filteredData.length === 0) return null;

          return (
            <div
              key={monthName}
              className="rounded-[24px] border border-white/70 bg-white/60 p-4 shadow-[0_24px_80px_rgba(15,23,42,0.10)] backdrop-blur-2xl lg:p-5"
            >
              <div className="mb-2 flex items-center justify-between gap-4 border-b border-slate-200/70 pb-2">
                <h2 className="text-xl font-bold tracking-tight text-slate-800">
                  {fullMonthMap[monthName] || monthName}
                </h2>
                <div className="rounded-full bg-blue-100 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">
                  {filteredData.length} Records
                </div>
              </div>

              <div className="mb-4 hidden grid-cols-[0.8fr_1.1fr_1.1fr_1.1fr] gap-4 rounded-[20px] bg-slate-100 
              px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.20em] text-slate-700 lg:grid">
                <div className="pl-2">Circle + Billing Type</div>
                <div className="pl-2">60% Billing Status</div>
                <div className="pl-2">40% Billing Status</div>
                <div className="pl-2">KPIs + GN Penalty Status</div>
              </div>

              <div className="mt-2">
                {filteredData.map((row, i) => {
                  const r = normalizeRow(row);

                  return (
                    <div
                      key={i}
                      className="mb-3 grid gap-4 rounded-[24px] border border-white/80 
                      bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(248,250,252,0.86))] p-5
                      shadow-[0_18px_50px_rgba(15,23,42,0.08)] transition duration-300 hover:-translate-y-1
                       hover:scale-[1.01] hover:shadow-[0_28px_70px_rgba(15,23,42,0.12)] lg:grid-cols-[0.8fr_1.1fr_1.1fr_1.1fr]
                        lg:items-start lg:p-6">
                      <div className="flex items-start gap-4">
                        <div className="mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-full 
                        bg-gradient-to-br from-blue-100 via-white to-violet-100 text-blue-700 ring-1 ring-blue-200">
                          <span className="text-sm font-bold">
                            {(r.circle || "?").slice(0, 2).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="text-base font-semibold text-slate-900">
                            {r.circle}
                          </p>
                          <p className="mt-1 text-sm text-slate-500">
                            {r.billing_type}
                          </p>
                        </div>
                      </div>

                      <StatusBlock label="60%" status={r.sixty} note={row.sixty_note} />
                      <StatusBlock label="40%" status={r.forty} note={row.forty_note} />
                      <StatusBlock label="KPI" status={r.kpi} note={row.kpi_note} />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {showForm && (
   <div className="fixed top-0 left-0 w-screen h-screen z-[99999] bg-black/40 backdrop-blur-md flex items-center justify-center">
            <div className="mx-auto w-full max-w-2xl rounded-[32px] border border-white/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(248,250,252,0.92),rgba(243,232,255,0.92))] p-10 shadow-[0_30px_90px_rgba(15,23,42,0.24)] backdrop-blur-2xl">
              <h2 className="mb-2 text-2xl font-semibold tracking-tight text-slate-900">
                Add Billing Data
              </h2>
              <p className="mb-6 text-sm leading-6 text-slate-500">
                Enter the latest billing checkpoint details. Existing validation and save behavior remain unchanged.
              </p>

              <div className="space-y-3">
                <div className="mb-6 grid gap-3 md:grid-cols-3">
                  <div ref={monthRef} className="relative w-full">
                    <div className="app-input app-input-lg flex w-full items-center gap-2 rounded-xl border-primary/30 px-3 py-2">
                      <svg className="h-4 w-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>

                      <div
                        onClick={() => setOpenMonth(!openMonth)}
                        className="flex flex-1 cursor-pointer items-center justify-between"
                      >
                        <span className={form.month ? "text-black" : "text-gray-400"}>
                          {form.month ? fullMonthMap[form.month] : "Select Month"}
                        </span>
                        <span className="text-xs">▼</span>
                      </div>
                    </div>

                    {openMonth && (
                      <div className="absolute left-0 top-full z-[9999] mt-2 max-h-60 w-full overflow-y-auto rounded-2xl border border-white/80 bg-white shadow-xl">
                        {months.map((m) => (
                          <div
                            key={m}
                            onClick={() => {
                              setForm({ ...form, month: m });
                              setOpenMonth(false);
                            }}
                            className="cursor-pointer px-4 py-2 hover:bg-purple-100"
                          >
                            {fullMonthMap[m] || m}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div ref={circleRef} className="relative w-full">
                    <div className="app-input app-input-lg flex w-full items-center gap-2 rounded-xl border-primary/30 px-3 py-2">
                      <svg className="h-4 w-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
                        />
                      </svg>

                      <div
                        onClick={() => setOpenCircle(!openCircle)}
                        className="flex flex-1 cursor-pointer items-center justify-between"
                      >
                        <span className={form.circle ? "text-black" : "text-gray-400"}>
                          {form.circle || "Select Circle"}
                        </span>
                        <span className="text-xs">▼</span>
                      </div>
                    </div>

                    {openCircle && (
                      <div className="absolute left-0 top-full z-[9999] mt-2 w-full rounded-2xl border border-white/80 bg-white shadow-xl">
                        {circleOptions.map((c) => (
                          <div
                            key={c}
                            onClick={() => {
                              setForm({ ...form, circle: c });
                              setOpenCircle(false);
                            }}
                            className="cursor-pointer px-4 py-2 hover:bg-purple-100"
                          >
                            {c}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div ref={billingRef} className="relative w-full">
                    <div className="app-input app-input-lg flex w-full items-center gap-2 rounded-xl border-primary/30 px-3 py-2">
                      <svg className="h-4 w-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M3 10h18M7 15h1m4 0h1m-7 4h12"
                        />
                      </svg>

                      <div
                        onClick={() => setOpenBilling(!openBilling)}
                        className="flex flex-1 cursor-pointer items-center justify-between"
                      >
                        <span className={form.billingType ? "text-black" : "text-gray-400"}>
                          {form.billingType || "Select Billing Type"}
                        </span>
                        <span className="text-xs">▼</span>
                      </div>
                    </div>

                    {openBilling && (
                      <div className="absolute left-0 top-full z-[9999] mt-2 w-full rounded-2xl border border-white/80 bg-white shadow-xl">
                        {billingOptions.map((b) => (
                          <div
                            key={b}
                            onClick={() => {
                              setForm({ ...form, billingType: b });
                              setOpenBilling(false);
                            }}
                            className="cursor-pointer px-4 py-2 hover:bg-purple-100"
                          >
                            {b}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-6 grid w-full gap-6 md:grid-cols-3">
                  <div className="flex flex-col gap-2">
                    <StatusSelect
                    value={form.sixty}
                   onChange={(e) => setForm({ ...form, sixty: e.target.value })}
                   placeholder="60%"
                     />

                    {form.sixty === "Pending" && (
                      <input
                        type="text"
                        name="sixty_note"
                        placeholder="Reason..."
                        value={form.sixty_note}
                        onChange={handleChange}
                        className="h-10 w-full rounded-xl border px-3 text-sm"
                      />
                    )}
                  </div>

                  <div className="flex flex-col gap-2">
                   <StatusSelect
                   value={form.forty}
                     onChange={(e) => setForm({ ...form, forty: e.target.value })}
                     placeholder="40%"
                     />

                    {form.forty === "Pending" && (
                      <input
                        type="text"
                        name="forty_note"
                        placeholder="Reason..."
                        value={form.forty_note}
                        onChange={handleChange}
                        className="h-10 w-full rounded-xl border px-3 text-sm"
                      />
                    )}
                  </div>

                  <div className="flex flex-col gap-2">
                   <StatusSelect
                  value={form.kpi}
                 onChange={(e) => setForm({ ...form, kpi: e.target.value })}
                 placeholder="KPI"
                 />

                    {form.kpi === "Pending" && (
                      <input
                        type="text"
                        name="kpi_note"
                        placeholder="Reason..."
                        value={form.kpi_note}
                        onChange={handleChange}
                        className="h-10 w-full rounded-xl border px-3 text-sm"
                      />
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-8 flex justify-end gap-4">
                <button
                  onClick={() => setShowForm(false)}
                  className="rounded-full border border-slate-300 bg-white px-6 py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
                >
                  Cancel
                </button>

                <button
              onClick={handleSubmit}
              disabled={isSaving}
               className="rounded-full bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-3 text-sm 
               font-semibold text-white shadow-[0_18px_40px_rgba(99,102,241,0.30)] transition duration-300
                hover:scale-[1.02] disabled:opacity-70 disabled:cursor-not-allowed">
                  {isSaving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
