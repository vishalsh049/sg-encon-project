import { motion } from "framer-motion";
import {
  BadgeCheck,
  CircleDashed,
  Eye,
  UserCheck,
  UserX,
  Users,
} from "lucide-react";

const CARDS = [
  { key: "total", label: "Total Candidates", icon: Users, accent: "from-blue-500 to-indigo-500" },
  { key: "Pending", label: "Pending", icon: CircleDashed, accent: "from-amber-400 to-orange-500" },
  { key: "Under Review", label: "Under Review", icon: Eye, accent: "from-sky-400 to-cyan-500" },
  { key: "Approved", label: "Approved", icon: BadgeCheck, accent: "from-emerald-400 to-teal-500" },
  { key: "Rejected", label: "Rejected", icon: UserX, accent: "from-rose-400 to-red-500" },
  { key: "Converted", label: "Converted", icon: UserCheck, accent: "from-indigo-400 to-violet-500" },
];

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-[18px] border border-border-color bg-surface/85 px-4 py-4">
      <div className="h-9 w-9 rounded-2xl bg-surface-muted" />
      <div className="mt-3 h-3 w-20 rounded bg-surface-muted" />
      <div className="mt-2 h-5 w-10 rounded bg-surface-muted" />
    </div>
  );
}

/**
 * Stat card grid for the training dashboard.
 * stats: { total, byStatus: { Pending, "Under Review", Approved, Rejected, Converted } }
 */
export default function TrainingStats({ stats, loading }) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {CARDS.map((card) => (
          <SkeletonCard key={card.key} />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      {CARDS.map((card) => {
        const value =
          card.key === "total" ? stats?.total ?? 0 : stats?.byStatus?.[card.key] ?? 0;
        const Icon = card.icon;
        return (
          <motion.div
            key={card.key}
            whileHover={{ y: -3 }}
            className="group relative overflow-hidden rounded-[18px] border border-white/70 bg-surface/85 px-4 py-3 shadow-sm backdrop-blur-2xl"
          >
            <div
              className={`absolute inset-x-5 top-0 h-14 rounded-b-[32px] bg-gradient-to-br ${card.accent} opacity-20 blur-2xl transition duration-500 group-hover:opacity-30`}
            />
            <div className="relative">
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-[16px] bg-gradient-to-br ${card.accent} text-white`}
              >
                <Icon className="h-4 w-4" />
              </div>
              <p className="mt-2.5 text-xs font-medium text-text-muted">{card.label}</p>
              <p className="mt-0.5 text-xl font-semibold tracking-tight text-text-primary">
                {value}
              </p>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
