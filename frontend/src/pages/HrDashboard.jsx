import React, { useEffect, useState } from "react";
import {
  Users,
  UserCheck,
  UserX,
  ClipboardList,
  BriefcaseBusiness,
  Layers3,
} from "lucide-react";
import { buildApiUrl } from "../lib/api";

const MetricCard = ({
  icon: Icon,
  label,
  value,
  tone,
}) => {
  const tones = {
    blue: "bg-blue-50 text-blue-700 border-blue-100",
    cyan: "bg-cyan-50 text-cyan-700 border-cyan-100",
    green: "bg-green-50 text-green-700 border-green-100",
    red: "bg-red-50 text-red-700 border-red-100",
    orange: "bg-orange-50 text-orange-700 border-orange-100",
    violet: "bg-violet-50 text-violet-700 border-violet-100",
    slate: "bg-slate-50 text-slate-700 border-slate-100",
  };

  const iconBg = {
    blue: "bg-blue-100 text-blue-700",
    cyan: "bg-cyan-100 text-cyan-700",
    green: "bg-green-100 text-green-700",
    red: "bg-red-100 text-red-700",
    orange: "bg-orange-100 text-orange-700",
    violet: "bg-violet-100 text-violet-700",
    slate: "bg-slate-100 text-slate-700",
  };

  return (
    <div
  className="flex min-h-[110px] flex-col justify-between rounded-[22px] bg-slate-50/90 border border-slate-100 px-5 py-4"
>
        <div className="flex justify-end">       
      </div>

      <div className="mt-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
            {label}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className={`text-sm font-bold ${tones[tone] ? tones[tone].split(" ")[1] : "text-slate-800"}`}>
            {value}
          </p>
        </div>
      </div>
    </div>
  );
};

function HrDashboard() {

  const [jobRoles, setJobRoles] = useState([]);
  const [circles, setCircles] = useState([]);
  const [employmentStatus, setEmploymentStatus] = useState([]);
  const [jobRoleAverage, setJobRoleAverage] = useState([]);

  const totalEmployees = jobRoles.reduce(
    (sum, item) => sum + Number(item.total || 0),
    0
  );

  useEffect(() => {

    loadJobRoles();
    loadCircles();
    loadEmploymentStatus();
    loadJobRoleAverage();

  }, []);

  const loadJobRoles = async () => {

    try {

      const response = await fetch(
        buildApiUrl("/api/physical/job-role-count")
      );

      const result = await response.json();

      if (result.success) {
        setJobRoles(result.data || []);
      }

    } catch (error) {

      console.log(error);

    }

  };

  const loadCircles = async () => {

    try {

      const response = await fetch(
        buildApiUrl("/api/physical/circle-count")
      );

      const result = await response.json();

      if (result.success) {
        setCircles(result.data || []);
      }

    } catch (error) {

      console.log(error);

    }

  };

  const loadEmploymentStatus = async () => {

    try {

      const response = await fetch(
        buildApiUrl("/api/physical/employment-status-count")
      );

      const result = await response.json();

      if (result.success) {
        setEmploymentStatus(result.data || []);
      }

    } catch (error) {

      console.log(error);

    }

  };

  const loadJobRoleAverage = async () => {

    try {

      const response = await fetch(
        buildApiUrl("/api/physical/job-role-document-average")
      );

      const result = await response.json();

      if (result.success) {
        setJobRoleAverage(result.data || []);
      }

    } catch (error) {

      console.log(error);

    }

  };

  return (
    <div className="min-h-screen">
      {/* HEADER */}
      <div className="mb-4 rounded-[18px] bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 p-4 shadow-2xl">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.25em] text-indigo-100">
              HR MANAGEMENT
            </p>
            <p className="mt-1 text-xs text-indigo-100">
              Physical &amp; Scrum team monitoring overview
            </p>
          </div>

          <div className="rounded-[18px] bg-white/10 p-4 backdrop-blur-xl">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-indigo-100">
              Total Workforce
            </p>
            <h1 className="mt-1 text-sm font-semibold text-white">257</h1>
          </div>
        </div>
      </div>

      {/* TWO SECTION */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {/* PHYSICAL */}
        <div className="flex min-h-full flex-col overflow-hidden rounded-[18px] bg-white shadow-xl">
          <div className="rounded-t-[18px] bg-gradient-to-r from-blue-600 via-cyan-500 to-cyan-400 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-[18px] bg-white/15 backdrop-blur-xl border border-white/25">
                  <BriefcaseBusiness className="h-4 w-4 text-white" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-blue-100">
                    PHYSICAL MANPOWER
                  </p>
                  <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-white">
                    overview physical manpower
                  </p>
                </div>
              </div>
            </div>
          </div>

        <div className="p-4">
            <div className="grid grid-cols-2 gap-2">
              <MetricCard
  label="Total Employees"
  value={totalEmployees}
  tone="blue"
/>

<MetricCard
  label="Employment Status"
  value={employmentStatus.length}
  tone="green"
/>

<MetricCard
  label="Job Roles"
  value={jobRoles.length}
  tone="red"
/>

<MetricCard
  label="Document Average"
  value={
    jobRoleAverage.length
      ? `${Math.round(
          jobRoleAverage.reduce(
            (sum, item) =>
              sum + Number(item.document_average || 0),
            0
          ) / jobRoleAverage.length
        )}%`
      : "0%"
  }
  tone="cyan"
/>
            </div>
          </div>

          <div className="border-t border-slate-100 px-4 py-5">

  <h2 className="mb-3 text-sm font-semibold text-slate-800">
    Circle Wise Count
  </h2>

  <div className="grid grid-cols-2 gap-2">

    {circles.map((item, index) => (

      <div
        key={index}
        className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-2"
      >

        <span className="text-xs font-semibold text-slate-700">
          {item.circle}
        </span>

        <span className="text-sm font-bold text-emerald-600">
          {item.total}
        </span>

      </div>

    ))}

  </div>

</div>

        </div>

      

        {/* SCRUM */}
        <div className="flex min-h-full flex-col overflow-hidden rounded-[18px] bg-white shadow-xl">
          <div className="rounded-t-[18px] bg-gradient-to-r from-violet-600 via-pink-600 to-fuchsia-500 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-[18px] bg-white/15 backdrop-blur-xl border border-white/25">
                  <Layers3 className="h-4 w-4 text-white" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-100">
                    SCRUM MANPOWER
                  </p>
                  <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-white">
                     overview scrum manpower
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="p-4">
           <div className="grid grid-cols-2 gap-3">
              <MetricCard
                icon={Layers3}
                label="Active Teams"
                value="12"
                tone="slate"
              />
              <MetricCard
                icon={ClipboardList}
                label="Sprint Progress"
                value="82%"
                tone="green"
              />
              <MetricCard
                icon={UserX}
                label="Pending Tasks"
                value="34"
                tone="orange"
              />
              <MetricCard
                icon={UserCheck}
                label="Completed"
                value="145"
                tone="violet"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default HrDashboard;

