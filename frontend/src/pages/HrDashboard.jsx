import React, { useEffect, useState } from "react";
import {
  BriefcaseBusiness,
  Layers3,
} from "lucide-react";

import { buildApiUrl } from "../lib/api";

function HrDashboard() {

  const [jobRoles, setJobRoles] = useState([]);
  const [circles, setCircles] = useState([]);
  const [employmentStatus, setEmploymentStatus] = useState([]);
  const [scrumCount, setScrumCount] = useState({
   total: 0,
   active: 0,
   inactive: 0,
  });
  const totalEmployees = jobRoles.reduce(
    (sum, item) => sum + Number(item.total || 0),
    0
  );

  useEffect(() => {
    loadJobRoles();
    loadCircles();
    loadEmploymentStatus();
    loadScrumCount();
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

  const loadScrumCount = async () => {

  try {

    const response = await fetch(
      buildApiUrl("/api/manpower/scrum/count")
    );

    const result = await response.json();

    setScrumCount(result);

  } catch (error) {

    console.log(error);

  }

};

  return (

    <div className="min-h-screen">

      {/* HEADER */}
      <div className="mb-2 rounded-[18px] bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 p-4">

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">

          <div>

            <p className="text-xs font-medium uppercase tracking-[0.25em] text-indigo-100">
              HR MANAGEMENT
            </p>

            <p className="mt-1 text-xs text-indigo-100 tracking-[0.12em]">
              Physical & Scrum team monitoring overview
            </p>

          </div>

        </div>

      </div>

      {/* FILTER SECTION */}
<div className="mb-2 rounded-[18px] bg-white border border-slate-100 p-2">

  <div className="grid grid-cols-1 md:grid-cols-4 gap-2">

      {/* SEARCH */}
    <div>

      <input
        type="text"
        placeholder="Search anything  ..."
        className="w-full rounded-[12px] border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-indigo-400"
      />

    </div>

    {/* CIRCLE FILTER */}
    <div>

      <select
        className="w-full rounded-[12px] border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-cyan-400"
      >
        <option value="">Select Circle</option>
        <option value="Punjab">Punjab</option>
        <option value="Haryana">Haryana</option>
        <option value="Delhi">Delhi</option>
         <option value="UPEast">UP East</option>
      </select>

    </div>

    {/* CMP FILTER */}
    <div>

      <select
        className="w-full rounded-[12px] border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-violet-400"
      >
        <option value="">Select CMP</option>
        <option value="CMP 1">CMP 1</option>
        <option value="CMP 2">CMP 2</option>
        <option value="CMP 3">CMP 3</option>
      </select>

    </div>

    {/* BUTTON */}
    <div className="flex items-end">

      <button
        className="w-full rounded-[12px] bg-gradient-to-r from-cyan-500 to-violet-500 px-4 py-2 text-sm font-semibold text-white"
      >
        Reset
      </button>

    </div>

  </div>

</div>

      {/* SIGNOFF CARD */}
<div className="mb-2 rounded-[18px] bg-white border border-slate-100 px-4 py-2">

  <div className="flex items-center justify-between">

    <div>

      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
        Signoff
      </p>

      <p className="mt-1 text-xs text-slate-400">
        Physical & Scrum Final Approval Status
      </p>

    </div>

    <div className="flex items-center gap-3">

      {/* PHYSICAL */}
      <div className="rounded-[14px] bg-cyan-50 border border-cyan-100 px-4 py-2">

        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-600">
          Physical
        </p>

        <p className=" text-xs font-semibold text-cyan-700">
          Approved
        </p>

      </div>

      {/* SCRUM */}
      <div className="rounded-[14px] bg-violet-50 border border-violet-100 px-4 py-2">

        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-violet-600">
          Scrum
        </p>

        <p className=" text-xs font-semibold text-violet-700">
          Approved
        </p>

      </div>

    </div>

  </div>

</div>


      {/* MAIN GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">

      {/* PHYSICAL SECTION */}
<div className="overflow-hidden rounded-[18px] bg-white shadow-xl h-fit">

  {/* HEADER */}
  <div className="rounded-t-[18px] bg-gradient-to-r from-blue-600 via-cyan-500 to-cyan-400 px-4 py-3">

    <div className="flex items-center gap-3">

      <div className="flex h-9 w-9 items-center justify-center rounded-[18px] bg-white/15 border border-white/25">
        <BriefcaseBusiness className="h-4 w-4 text-white" />
      </div>

      <div>

        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-blue-100">
          PHYSICAL REQUIREMENT
        </p>

        <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-white">
          requirement vs available manpower
        </p>

      </div>

    </div>

  </div>

  {/* TABLE */}
  <div
      className="overflow-x-auto overflow-y-auto"
   style={{
  maxHeight: "85vh",
  minHeight: "340px",
}}
  >

    <table className="text-sm whitespace-nowrap">

      {/* HEADER */}
   <thead className="sticky top-0 z-20">


 {/* COLUMN HEADER */}
<tr className="bg-[#0d3557] text-white text-[11px] uppercase whitespace-nowrap">

  {/* BASIC */}

 <th
  rowSpan={2}
  className="sticky left-0 z-30 bg-[#0d3557] border border-slate-600 px-4 py-3 text-center font-semibold"
>
    CMP
  </th>

  {/* STATE LEADERSHIP TEAM */}
  <th colSpan={3} className="border border-slate-600 text-center font-semibold">
    State Leadership Team
  </th>

  {/* NOC EXECUTIVE */}
  <th colSpan={3} className="border border-slate-600 text-center font-semibold">
    NOC Executive
  </th>

  {/* ANALYST */}
  <th colSpan={3} className="border border-slate-600 text-center font-semibold">
    Analyst
  </th>

  {/* CMP LEAD */}
  <th colSpan={3} className="border border-slate-600 text-center font-semibold">
    CMP Lead
  </th>

  {/* TECHNICIAN */}
  <th colSpan={3} className="border border-slate-600 text-center font-semibold">
    Technician
  </th>

  {/* RIGGER */}
  <th colSpan={3} className="border border-slate-600 text-center font-semibold">
    Rigger
  </th>

  {/* UTILITY SUPERVISOR */}
  <th colSpan={3} className="border border-slate-600 text-center font-semibold">
    Utility Supervisor
  </th>

  {/* UTILITY ENGINEER */}
  <th colSpan={3} className="border border-slate-600 text-center font-semibold">
    Utility Engineer
  </th>

  {/* ISP ENGINEER */}
  <th colSpan={3} className="border border-slate-600 text-center font-semibold">
    ISP Engineer
  </th>

  {/* WH */}
  <th colSpan={3} className="border border-slate-600  text-center font-semibold">
    WH Incharge cum Security
  </th>

  {/* SPLICER */}
<th colSpan={3} className="border border-slate-600 text-center font-semibold">
  Splicer
</th>

{/* ASSISTANT SPLICER */}
<th colSpan={3} className="border border-slate-600 text-center font-semibold">
  Assistant Splicer
</th>

{/* FIBER HELPER */}
<th colSpan={3} className="border border-slate-600 text-center font-semibold">
  Fiber Helper
</th>

{/* PATROLLER */}
<th colSpan={3} className="border border-slate-600 text-center font-semibold">
  Patroller
</th>

{/* FIBER SUPERVISOR */}
<th colSpan={3} className="border border-slate-600 text-center font-semibold">
  Fiber Supervisor
</th>

{/* FTTX ENGINEER */}
<th colSpan={3} className="border border-slate-600 text-center font-semibold">
  FTTx Engineer
</th>

{/* FTTX SPLICER */}
<th colSpan={3} className="border border-slate-600 text-center font-semibold">
  FTTx Splicer
</th>

{/* FTTX ASSISTANT SPLICER */}
<th colSpan={3} className="border border-slate-600 text-center font-semibold">
  FTTx Assistant Splicer
</th>

{/* FTTX SUPERVISOR */}
<th colSpan={3} className="border border-slate-600 text-center font-semibold">
  FTTx Supervisor
</th>

{/* FTTX ENGINEER PO */}
<th colSpan={3} className="border border-slate-600 text-center font-semibold">
  FTTx Engineer
</th>

{/* FTTX TECHNICIAN */}
<th colSpan={3} className="border border-slate-600 text-center font-semibold">
  FTTx Technician
</th>

{/* TECHNICIAN B */}
<th colSpan={3} className="border border-slate-600 text-center font-semibold">
  TechnicianB
</th>

{/* RIGGER B */}
<th colSpan={3} className="border border-slate-600 text-center font-semibold">
  RiggerB
</th>

</tr>

{/* R A G ROW */}
<tr className="bg-[#133d67] text-white">

  {Array.from({ length: 23 }).map((_, index) => ( 
    <React.Fragment key={index}>

      <th className="border border-slate-600 px-4 text-center text-xs font-semibold">
        R
      </th>

      <th className="border border-slate-600 px-4 text-center text-xs font-semibold">
        A
      </th>

      <th className="border border-slate-600 px-4 text-center text-xs font-semibold">
        G
      </th>

    </React.Fragment>
  ))}

</tr>

</thead>

      <tbody>

  {[
    {
     
      cmp: "SHQ",
    },
    {
      
      cmp: "Airtel",
    },
    {
     
      cmp: "Jio",
    },
    {
      
      cmp: "VI",
    },
  ].map((item, index) => (

    <tr
      key={index}
      className="border-b border-slate-200 hover:bg-slate-50"
    >

      {/* BASIC */}
      <td className="sticky left-0 z-20 bg-white border border-slate-200 px-4 py-2">
        {item.cmp}
      </td>

      {/* ALL DESIGNATIONS */}
      {Array.from({ length: 23 }).map((_, i) => {

        const requirement = Math.floor(
          Math.random() * 100
        ) + 20;

        const available = Math.floor(
          Math.random() * requirement
        );

        const gap = requirement - available;

        return (

          <React.Fragment key={i}>

            {/* R */}
            <td className="border border-slate-200 px-3 py-2 text-center font-semibold text-blue-600">
              {requirement}
            </td>

            {/* A */}
            <td className="border border-slate-200 px-3 py-2 text-center font-semibold text-green-600">
              {available}
            </td>

            {/* G */}
            <td className="border border-slate-200 px-3 py-2 text-center font-semibold text-red-600">
              {gap}
            </td>

          </React.Fragment>

        );

      })}

    </tr>

  ))}

</tbody>

     

    </table>

  </div>

</div>

      {/* SCRUM SECTION */}
<div className="overflow-hidden rounded-[18px] bg-white shadow-xl h-fit">

  {/* HEADER */}
  <div className="rounded-t-[18px] bg-gradient-to-r from-violet-600 via-pink-600 to-fuchsia-500 px-4 py-3">

    <div className="flex items-center gap-3">

      <div className="flex h-9 w-9 items-center justify-center rounded-[18px] bg-white/15 border border-white/25">
        <Layers3 className="h-4 w-4 text-white" />
      </div>

      <div>

        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-violet-100">
          SCRUM MANPOWER
        </p>

        <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-white">
          overview scrum manpower
        </p>

      </div>

    </div>

  </div>

  {/* TABLE */}
  <div
    className="overflow-x-auto overflow-y-auto"
    style={{
  maxHeight: "85vh",
  minHeight: "340px",
}}
  >

    <table className="text-sm whitespace-nowrap w-full">

      {/* HEADER */}
      <thead className="sticky top-0 z-20">

       {/* DESIGNATIONS */}
{(() => {

  const scrumColumns = [
    "State Leadership Team",
    "NOC Executive",
    "Analyst",
    "CMP Lead",
    "Technician",
    "Rigger",
    "Utility Supervisor",
    "Utility Engineer",
    "ISP Engineer",
    "WH Incharge cum Security",
    "Splicer",
    "Assistant Splicer",
    "Fiber Helper",
    "Patroller",
    "Fiber Supervisor",
    "FTTx Engineer",
    "FTTx Splicer",
    "FTTx Assistant Splicer",
    "FTTx Supervisor",
    "FTTx Engineer",
    "FTTx Technician",
    "TechnicianB",
    "RiggerB",
  ];

  return (
    <>

      {/* TOP HEADER */}
      <tr className="bg-[#0d3557] text-white text-[11px] uppercase whitespace-nowrap">

    <th
  rowSpan={2}
  className="sticky left-0 z-30 bg-[#0d3557] border border-slate-600 px-4 py-2 text-center font-semibold"
>
  CMP
</th>

        {scrumColumns.map((item, index) => (

          <th
            key={index}
            colSpan={2}
            className="border border-slate-600 px-4 text-center font-semibold"
          >
            {item}
          </th>

        ))}

      </tr>

      {/* A G ROW */}
      <tr className="bg-[#133d67] text-white">

        {scrumColumns.map((_, index) => (

          <React.Fragment key={index}>

            <th className="border border-slate-600 px-3 text-center text-xs font-semibold">
              A
            </th>

            <th className="border border-slate-600 px-3 text-center text-xs font-semibold">
              G
            </th>

          </React.Fragment>

        ))}

      </tr>

    </>
  );

})()}

      </thead>

      {/* BODY */}
      <tbody>

        {[
          {
           
            cmp: "SHQ",
          },
          {
           
            cmp: "Airtel",
          },
          {
            
            cmp: "Jio",
          },
          {
          
            cmp: "VI",
          },
        ].map((item, index) => (

          <tr
            key={index}
            className="border-b border-slate-200 hover:bg-slate-50"
          >

            {/* BASIC */}
            <td className="sticky left-0 z-20 bg-white border border-slate-200 px-4 py-2">
              {item.cmp}
            </td>

            {/* TECHNICIAN */}
            <td className="border border-slate-200 px-4 py-2 text-center font-semibold text-green-600">
              85
            </td>

            <td className="border border-slate-200 px-4 py-2 text-center font-semibold text-red-600">
              12
            </td>

            {/* RIGGER */}
            <td className="border border-slate-200 px-4 py-2 text-center font-semibold text-green-600">
              42
            </td>

            <td className="border border-slate-200 px-4 py-2 text-center font-semibold text-red-600">
              8
            </td>

            {/* ANALYST */}
            <td className="border border-slate-200 px-4 py-2 text-center font-semibold text-green-600">
              26
            </td>

            <td className="border border-slate-200 px-4 py-2 text-center font-semibold text-red-600">
              4
            </td>

            {/* SPLICER */}
            <td className="border border-slate-200 px-4 py-2 text-center font-semibold text-green-600">
              67
            </td>

            <td className="border border-slate-200 px-4 py-2 text-center font-semibold text-red-600">
              14
            </td>

          </tr>

        ))}

      </tbody>

    </table>

  </div>

</div>

      </div>

    </div>

  );
}

export default HrDashboard;