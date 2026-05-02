import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { Menu, Moon, PanelLeftClose, PanelLeftOpen, Sun } from "lucide-react";
import Sidebar from "../components/Sidebar";
import { useUser } from "../context/UserContext";
import axios from "axios";

function DashboardLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [theme, setTheme] = useState(() => {
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme) return savedTheme;
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  });
  const sidebarWidth = collapsed ? "4rem" : "16rem";

  const { setUser } = useUser(); // ✅ HERE

  // ✅ USER LOAD
  useEffect(() => {
    const loadUser = async () => {
      try {
        const res = await axios.get("/api/me");
        setUser(res.data);
      } catch (error) {
        console.error("Failed to load user", error);
      }
    };

    loadUser();
  }, []);

  // ✅ THEME (SEPARATE)
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.style.colorScheme = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);  


  
  return (
    <div className="app-shell" style={{ "--sidebar-width": sidebarWidth }}>
      {mobileOpen ? (
        <div
          className="fixed inset-0 z-40 bg-overlay/55 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      <div
        className={`fixed inset-y-0 left-0 z-50 w-[18rem] transform transition-transform duration-300 md:w-[var(--sidebar-width)] ${
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <Sidebar
          closeSidebar={() => setMobileOpen(false)}
          collapsed={collapsed}
          onCollapseToggle={() => setCollapsed((prev) => !prev)}
          onExpandRequest={() => setCollapsed(false)}
        />
      </div>

      <div className="min-h-screen transition-[margin] duration-300 md:ml-[var(--sidebar-width)]">
        <header className="app-header sticky top-0 z-30">
          <div className="flex h-16 items-center justify-between px-4 md:px-6">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="app-button-ghost h-10 w-10 px-0 md:hidden"
              >
                <Menu size={18} />
              </button>

              <button
                type="button"
                onClick={() => setCollapsed((prev) => !prev)}
                className="app-button-ghost hidden h-10 w-10 px-0 md:inline-flex"
              >
                {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
              </button>

              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-text-muted">
                  Control Center
                </div>
                <h1 className="text-sm font-semibold text-text-primary md:text-base">
                  Telecom Performance Overview
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() =>
                  setTheme((prev) => (prev === "dark" ? "light" : "dark"))
                }
                className="app-button-ghost h-10 w-10 px-0"
                aria-label="Toggle theme"
              >
                {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
              </button>

              <div className="app-surface-soft flex items-center gap-3 px-3 py-2 shadow-none">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-sm font-semibold text-white">
                  U
                </div>
                <div className="hidden md:block">
                  <div className="text-sm font-semibold text-text-primary">User</div>
                  <div className="text-xs text-text-secondary">Dashboard Access</div>
                </div>
              </div>
            </div>
          </div>
        </header>

        <main className="p-3 md:p-4 lg:p-5 max-w-[1400px] mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default DashboardLayout;
