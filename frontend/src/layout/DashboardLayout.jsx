import { useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { Menu, Moon, PanelLeftClose, PanelLeftOpen, Sun } from "lucide-react";
import Sidebar from "../components/Sidebar";
import { useUser } from "../context/UserContext";
import { setStoredSession } from "../lib/session";
import axios from "axios";

function getInitials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "U";
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

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
  const sidebarWidth = collapsed ? "4rem" : "14rem";

  const { user, setUser } = useUser();
  const navigate = useNavigate();

  // ✅ USER LOAD
  useEffect(() => {
    const loadUser = async () => {
      try {
        const token = localStorage.getItem("token");
        const res = await axios.get("/api/me", {
          headers: {
            Authorization: token ? `Bearer ${token}` : "",
          },
        });
        // /api/me doesn't return the JWT itself — keep the token already
        // held in the stored session so token-presence checks elsewhere
        // (e.g. Dashboard.jsx) keep working after this refresh.
        const refreshedUser = { ...res.data, token };
        setUser(refreshedUser);
        setStoredSession(refreshedUser);
      } catch (error) {
        console.error("Failed to load user", error);
      }
    };

    loadUser();
  }, [setUser]);

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
         <div className="flex h-14 md:h-16 items-center justify-between px-3 md:px-6">
            <div className="flex items-center gap-2 md:gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="app-button-ghost h-9 w-9 px-0 md:hidden shrink-0"
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
                <div className="text-[10px] md:text-[11px] font-semibold uppercase tracking-[0.22em] md:tracking-[0.28em] text-text-muted truncate">
                  Control Center
                </div>
                <h1 className="text-[11px] leading-tight md:text-base font-semibold text-text-primary truncate max-w-[160px] sm:max-w-none">
                  Telecom Performance Overview
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-2 md:gap-3 min-w-0">
              <button
                type="button"
                onClick={() =>
                  setTheme((prev) => (prev === "dark" ? "light" : "dark"))
                }
                className="app-button-ghost h-8 w-8 md:h-10 md:w-10 px-0"
                aria-label="Toggle theme"
              >
                {theme === "dark" ? <Sun size={18} /> : <Moon size={16} />}
              </button>

              <button
                type="button"
                onClick={() => navigate("/dashboard/profile")}
                className="app-surface-soft flex items-center gap-2 px-1 md:px-3 py-1 md:py-2 shadow-none transition hover:opacity-80"
              >
                <div className="flex h-6 w-6 md:h-10 md:w-10 items-center justify-center rounded-xl
                 md:rounded-2xl bg-primary text-xs md:text-sm font-semibold text-white">
                  {getInitials(user?.name)}
                </div>
                <div className="hidden md:block text-left">
                  <div className="text-sm font-semibold text-text-primary">{user?.name || "User"}</div>
                  <div className="text-xs text-text-secondary">Dashboard Access</div>
                </div>
              </button>
            </div>
          </div>
        </header>

        <main className="p-3 md:p-4 lg:p-5 w-full">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default DashboardLayout;
