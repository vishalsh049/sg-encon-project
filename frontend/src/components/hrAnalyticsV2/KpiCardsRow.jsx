import React from "react";
import {
  Users,
  UserCheck,
  UserX,
  UserPlus,
  UserMinus,
  Clock,
  Target,
  CheckCircle2,
  AlertTriangle,
  PlusCircle,
  Wallet,
  ShieldAlert,
  Percent,
} from "lucide-react";
// Reusing the Billing Dashboard's KPI card primitive as-is (see
// frontend/src/components/billingDashboard/KpiCard.jsx) — it's generic
// (accent key + icon + value) so this page gets the same "one design
// system" premium look for free instead of a second copy of the component.
// Trend/sparkline/period-badge props are intentionally left unset here per
// request — this row shows plain current-value cards only.
import KpiCard from "../billingDashboard/KpiCard";
import { SECTION_HEADING } from "../billingDashboard/theme";

export default function KpiCardsRow({ overview, loading, showOfferedSalary = true }) {
  const kpis = overview?.kpis || {};

  const cards = [
    {
      key: "totalEmployees",
      label: "Total Employees",
      icon: Users,
      accentKey: "neutral",
      value: kpis.totalEmployees ?? 0,
      description: "Total employees in the selected filters.",
      tooltip: "Every employee currently recorded in the Physical roster, active or inactive.",
    },
    {
      key: "activeEmployees",
      label: "Active Employees",
      icon: UserCheck,
      accentKey: "completed",
      value: kpis.activeEmployees ?? 0,
      description: "Employees currently working.",
      tooltip: "Employees with employment_status = Active in the Physical roster.",
    },
    {
      key: "inactiveEmployees",
      label: "Inactive Employees",
      icon: UserX,
      accentKey: "pending",
      value: kpis.inactiveEmployees ?? 0,
      description: "Employees not currently working.",
      tooltip: "Employees with employment_status = Inactive in the Physical roster.",
    },
    {
      key: "newJoining",
      label: "New Joining",
      icon: UserPlus,
      accentKey: "revenue",
      value: kpis.newJoiningThisMonth ?? 0,
      description: "Employees joined this month.",
      tooltip: "Physical employees whose Date of Joining falls in the current month, plus New Joining records already marked Joined this month.",
    },

     {
      key: "pendingJoining",
      label: "Pending Joining",
      icon: Clock,
      accentKey: "pending",
      value: kpis.pendingJoining ?? 0,
      description: "Employees waiting to join.",
      tooltip: "New Joining records whose Joining Status is not yet 'Joined'.",
    },

    {
      key: "resigned",
      label: "Resigned Employees",
      icon: UserMinus,
      accentKey: "penalty",
      value: kpis.resignedEmployees ?? 0,
      description: `${kpis.resignedThisMonth ?? 0} resigned this month`,
      tooltip: "Physical employees with a Resigned Date set.",
    },
   

    {
      key: "requirement",
      label: "Requirement",
      icon: Target,
      accentKey: "pmLoss",
      value: kpis.requirement ?? 0,
      description: "Total approved manpower required.",
      tooltip: "Sum of every designation's sanctioned headcount from the Signoff master data, across the current filter scope.",
    },

     {
      key: "available",
      label: "Available",
      icon: CheckCircle2,
      accentKey: "completed",
      value: kpis.available ?? 0,
      description: "Employees available for deployment.",
      tooltip: "Active Physical employees plus New Joining records marked Joined, with duplicates removed by Aadhaar number.",
    },

    {
      key: "pendingApproval",
      label: "Pending Approval",
      icon: ShieldAlert,
      accentKey: "pending",
      value: kpis.pendingApproval ?? 0,
      description: "Records waiting for L2 approval.",
      tooltip: "New Joining records whose L2 Status is Pending.",
    },
    
    {
      key: "extra",
      label: "Extra Employees",
      icon: PlusCircle,
      accentKey: "indigoAccent",
      value: kpis.extra ?? 0,
      description: "max(Available − Requirement, 0), summed",
      tooltip:
        "For every Circle × CMP × Designation combination, Extra = max(Available − Requirement, 0) — only counted where Available exceeds Requirement, never negative. This total is the sum of that across every combination in the current filter scope. A surplus in one designation never offsets a shortage in another, so Gap and Extra can both be positive for the same circle/CMP at once.",
    },
    ...(showOfferedSalary
      ? [
          {
            key: "onPayroll",
            label: "Employees on Payroll",
            icon: Wallet,
            accentKey: "neutral",
            value: kpis.onPayroll ?? 0,
            description: "Same as Available headcount",
            tooltip: "Every employee counted in Available is on the active roster — this repeats that figure as a payroll-facing KPI. It is not derived from any salary figure.",
          },
        ]
      : []),

       {
      key: "gap",
      label: "Gap",
      icon: AlertTriangle,
      accentKey: "penalty",
      value: kpis.gap ?? 0,
      description: "Additional employees required.",
      tooltip: "Sum of (Requirement − Available) wherever Requirement exceeds Available.",
    },

    {
      key: "vacancyPct",
      label: "Vacancy %",
      icon: Percent,
      accentKey: "penalty",
      value: `${kpis.vacancyPct ?? 0}%`,
      description: "Gap ÷ Requirement",
      tooltip: "Gap as a percentage of total Requirement.",
    },

  ];

  return (
    <div>
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 className={`${SECTION_HEADING} text-indigo-600 dark:text-indigo-400`}>
          Executive Summary
        </h2>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-flow-cols-4 lg:grid-cols-4 xl:grid-cols-6">
        {cards.map((card) => (
          <KpiCard
            key={card.key}
            accentKey={card.accentKey}
            icon={card.icon}
            label={card.label}
            value={card.value}
            description={card.description}
            tooltip={card.tooltip}
            loading={loading}
            wrapText
          />
        ))}
      </div>
    </div>
  );
}
