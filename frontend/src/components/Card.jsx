import { motion } from "framer-motion";

function formatFiberValue(value) {
  if (value === "..." || value === null || value === undefined || value === "") {
    return value;
  }
  return Number(value || 0).toFixed(2);
}

function Card({ title, aerialCount, ugCount, tone = "blue" }) {
  const aerial = Number(aerialCount || 0);
  const ug = Number(ugCount || 0);
  const total = aerial + ug;

  const toneStyles = {
    blue: {
      dot: "bg-blue-500",
      chip: "bg-blue-50 text-blue-600",
      aerial: "bg-blue-50/70 text-blue-700 shadow-sm",
      ug: "bg-blue-100 text-blue-700 border border-blue-200", // 🔥 strong highlight
      total: "text-blue-600",
    },
    green: {
      dot: "bg-emerald-500",
      chip: "bg-emerald-50 text-emerald-600",
      aerial: "bg-emerald-50/60 text-emerald-700",
      ug: "bg-emerald-100 text-emerald-700 border border-emerald-200",
      total: "text-emerald-600",
    },
    gray: {
      dot: "bg-slate-400",
      chip: "bg-slate-100 text-slate-600",
      aerial: "bg-slate-100 text-slate-700",
      ug: "bg-slate-100 text-slate-700 border border-slate-200",
      total: "text-slate-700",
    },
  };

  const currentTone = toneStyles[tone] || toneStyles.blue;

  return (
    <motion.div
      whileHover={{ y: -4, scale: 1.01 }}
      transition={{ duration: 0.2 }}
      className="group rounded-3xl border border-slate-200/70 bg-white/70 backdrop-blur-xl p-3 shadow-[0_8px_25px_rgba(0,0,0,0.05)] transition hover:shadow-[0_16px_40px_rgba(0,0,0,0.08)]"
    >
      {/* HEADER */}
      <div className="mb-2 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${currentTone.dot}`} />
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              Fiber Segment
            </span>
          </div>

          <h3 className="text-base font-semibold text-slate-900 mt-1">
            {title}
          </h3>
        </div>

        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] shadow-sm ${currentTone.chip}`}
        >
          Live
        </span>
      </div>

      {/* TOTAL (NEW 🔥) */}
      <div className="mb-2">
        <p className="text-[10px] text-slate-400 uppercase tracking-wider">Total</p>
        <p className={`text-xl font-bold tracking-tight ${currentTone.total}`}>
          {formatFiberValue(total)}
        </p>
      </div>

      {/* VALUES */}
      <div className="grid grid-cols-2 gap-2">
        {/* AERIAL */}
        <div
          className={`rounded-xl px-3 py-2 transition ${currentTone.aerial}`}
        >
          <p className="text-[10px] uppercase opacity-70">Aerial</p>
          <p className="mt-1 text-sm font-medium">
            {formatFiberValue(aerial)}
          </p>
        </div>

        {/* UG (HIGHLIGHTED 🔥) */}
        <div
          className={`rounded-xl px-3 py-2 transition shadow-md ${currentTone.ug}`}
        >
          <p className="text-[10px] uppercase opacity-80">UG</p>
          <p className="mt-1 text-base font-semibold">
            {formatFiberValue(ug)}
          </p>
        </div>
      </div>
    </motion.div>
  );
}

export default Card;