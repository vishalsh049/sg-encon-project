import Sidebar from "../components/Sidebar";
import { Outlet } from "react-router-dom";

function DashboardLayout() {
  return (
    <div className="flex">

      {/* Sidebar */}
      <Sidebar />

      {/* RIGHT SIDE */}
      <div className="ml-64 w-full min-h-screen bg-[#f5f6fa]">

        {/* 🔥 TOP BAR */}
        <div className="h-16 bg-white border-b shadow-sm flex items-center justify-between px-6 sticky top-0 z-50">

          {/* LEFT */}
         <h1 className="text-sm font-semibold text-gray-800 tracking-wide">
  Telecom Performance Overview
</h1>

          {/* RIGHT */}
          <div className="flex items-center gap-4">

            {/* SEARCH */}
           <div className="relative">
  <input
    type="text"
    placeholder="Search everything..."
    className="pl-3 pr-8 py-1.5 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
  />
  <span className="absolute right-2 top-1.5 text-gray-400 text-xs">
    ⌘K
  </span>
</div>

            {/* USER */}
            <div className="w-8 h-8 bg-blue-500 text-white flex items-center justify-center rounded-full font-semibold">
              U
            </div>

          </div>
        </div>

        {/* PAGE CONTENT */}
        <div className="p-6">
          <Outlet />
        </div>

      </div>
    </div>
  );
}

export default DashboardLayout;