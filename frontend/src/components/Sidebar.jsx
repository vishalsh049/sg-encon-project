import { NavLink, useNavigate } from "react-router-dom";
import { useState } from "react";
import logo from "../assets/logo.png";
import { FiHome, FiLayers, FiBarChart2, FiLogOut } from "react-icons/fi";

function Sidebar() {
  const [openMenu, setOpenMenu] = useState(null);
  const navigate = useNavigate();

  const toggleMenu = (menu) => {
    setOpenMenu(openMenu === menu ? null : menu);
  };

  // ✅ Logout Function
  const handleLogout = () => {
    localStorage.removeItem("token"); // remove auth
    navigate("/login"); // redirect
  };

  return (
    <div className="w-64 h-screen bg-white text-gray-700 fixed left-0 top-0 p-4 border-r flex flex-col justify-between shadow-md">

      {/* TOP SECTION */}
      <div>

        {/* Logo */}
        <div className="flex items-center gap-2 mb-6">
          <img src={logo} alt="logo" className="h-10 w-auto object-contain" />
        </div>

        {/* Dashboard */}
     <NavLink
  to="/dashboard"
  className={({ isActive }) =>
    `flex items-center gap-3 p-3 rounded-lg transition ${
      isActive
        ? "bg-blue-100 text-blue-600 font-semibold"
        : "text-gray-600 hover:bg-gray-100"
    }`
  }
>
  <FiHome />
Dashboard
</NavLink>
<p className="text-xs text-gray-400 mt-4 mb-1">OPERATIONS</p>

        {/* UPTIME & SCOPE */}
        <button
          onClick={() => toggleMenu("scope")}
          className="w-full flex items-center gap-2 p-3 rounded-lg text-gray-600 hover:bg-gray-100 transition"
        >
          <FiLayers />
         UPTIME & SCOPE
        </button>

        {openMenu === "scope" && (
          <div className="ml-4 mt-2 space-y-1 border-l border-gray-200 pl-3">
            <div className="p-2 rounded hover:bg-gray-100 cursor-pointer">Towers</div>
            <div className="p-2 rounded hover:bg-gray-100 cursor-pointer">Fiber</div>
            <div className="p-2 rounded hover:bg-gray-100 cursor-pointer">FTTx Fiber</div>
          </div>
        )}

        {/* KPIs */}
        <button
          onClick={() => toggleMenu("kpi")}
          className="w-full flex items-center gap-2 p-3 rounded-lg text-gray-600 hover:bg-gray-100 transition"
        >
          <FiBarChart2 />
         KPIs - Tower & Fiber
        </button>

        {openMenu === "kpi" && (
          <div className="ml-4 mt-2 space-y-1">
            <NavLink
              to="/dashboard/overall-nwa"
              className={({ isActive }) =>
  `flex items-center gap-3 p-3 rounded-lg transition relative ${
    isActive
      ? "bg-blue-50 text-blue-600 font-semibold before:absolute before:left-0 before:top-0 before:h-full before:w-1 before:bg-blue-600 before:rounded-r"
      : "text-gray-600 hover:bg-gray-100"
  }`
}
            >
              Overall NWA
            </NavLink>

           <div className="p-2 text-sm text-gray-600 hover:text-blue-600 cursor-pointer">
              Fiber KPIs
            </div>

            <div className="p-2 text-sm text-gray-600 hover:text-blue-600 cursor-pointer">
              FTTx KPIs
            </div>
          </div>
        )}

      </div>

      {/* ✅ BOTTOM LOGOUT */}
     <div className="pt-4 border-t mt-4">
  
<button
  onClick={handleLogout}
  className="flex items-center gap-3 text-gray-600 hover:text-red-500 hover:bg-red-50 p-2 rounded-lg transition w-full"
>
  <FiLogOut />
  Logout
</button>
</div>

    </div>
  );
}

export default Sidebar;