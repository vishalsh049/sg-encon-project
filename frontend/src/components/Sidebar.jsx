import { useEffect, useMemo, useState } from "react";
import { hasAccess } from "../utils/access"
import { useLocation, useNavigate } from "react-router-dom";
import {
  BriefcaseBusiness,
  ChevronLeft,
  FileText,
  LayoutDashboard,
  LogOut,
  ReceiptText,
  ShieldCheck,
  Database,
} from "lucide-react";
import logo from "../assets/logo.png";
import { clearStoredSession, hasPermission } from "../lib/session";
import MenuItem from "./MenuItem";
import SubMenu from "./SubMenu";

function isPathActive(pathname, path, exact = false) {
  if (!path) return false;
  if (exact) {
    return pathname === path;
  }
  return pathname === path || pathname.startsWith(`${path}/`);
}

function getActiveTrail(items, pathname, trail = []) {
  for (const item of items) {
    if (isPathActive(pathname, item.path, item.exact)) return trail;
    if (item.children?.length) {
      const childTrail = getActiveTrail(item.children, pathname, [...trail, item.key]);
      if (childTrail) return childTrail;
    }
  }
  return null;
}

function filterMenuByRole(items, role) {
  const normalizedRole = String(role || "").trim().toLowerCase();
  return items.reduce((acc, item) => {
    if (
      item.roles &&
      !item.roles.map((value) => String(value).toLowerCase()).includes(normalizedRole)
    ) {
      return acc;
    }
    if (item.permission && !hasPermission(item.permission)) return acc;
    const nextItem = item.children?.length
      ? { ...item, children: filterMenuByRole(item.children, role) }
      : item;
    if (nextItem.children && nextItem.children.length === 0 && !nextItem.path) return acc;
    acc.push(nextItem);
    return acc;
  }, []);
}

function Sidebar({ closeSidebar, collapsed, onCollapseToggle, onExpandRequest }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [openLevels, setOpenLevels] = useState({});
  const role = localStorage.getItem("role") || "admin";

  const menu = useMemo(
    () =>
      filterMenuByRole(
        [
          {
            key: "dashboard",
            label: "Dashboard",
            path: "/dashboard",
            exact: true,
            icon: LayoutDashboard,
            description: "Overview",
          },
         {
  key: "billing",
  label: "Billing",
  icon: ReceiptText,
  description: "Finance flow",
  children: [
    {
      key: "billing-dashboard",
      label: "Billing Dashboard",
      path: "/dashboard/billing",
    },
    {
      key: "billing-status",
      label: "Billing Status",
      path: "/dashboard/billing/status",
    },
    {
      key: "revenue",
      label: "Revenue",
      path: "/dashboard/billing/revenue",
    },
    {
      key: "penalties",
      label: "Penalties",
      path: "/dashboard/billing/penalties",
      children: [
        {
          key: "kpis-penalty",
          label: "KPIs Penalty",
          path: "/dashboard/billing/penalties/kpis",
        },
        {
          key: "general-penalties",
          label: "General Penalties",
          path: "/dashboard/billing/penalties/general",
        },
      ],
    },
  ],
},
          {
            key: "manpower",
            label: "Manpower",
            icon: BriefcaseBusiness,
            description: "Teams & staffing",
            children: [
              { key: "physical", label: "Physical", path: "/dashboard/manpower/physical" },
              { key: "scrum", label: "SCRUM", path: "/dashboard/manpower/scrum" },
            ],
          },
          {
  key: "reports",
  label: "Reports",
  icon: FileText,
  description: "Uploads & files",
  children: [
    {
      key: "tower-reports",
      label: "Tower Reports",
      path: "/dashboard/reports/tower",
    },
    {
      key: "fiber-reports",
      label: "Fiber Reports",
      children: [
        {
          key: "nso-reports",
          label: "NSO Reports",
          path: "/dashboard/reports/fiber/nso",
          icon: Database,
        },
        {
          key: "fiber-inventory",
          label: "Fiber Inventory",
          path: "/dashboard/reports/fiber/inventory",
          icon: Database,
        },
      ],
    },
  ],
},
         {
  key: "users-access",
  label: "Users & Access",
  path: "/dashboard/users-access",
  icon: ShieldCheck,
  description: "Roles & permissions",
  roles: ["admin"], 
},
        ],
        role
      ),
    [role]
  );

  useEffect(() => {
    const trail = getActiveTrail(menu, location.pathname) || [];
    setOpenLevels((prev) => {
      const next = {};
      trail.forEach((key, depth) => {
        next[depth] = key;
      });
      const same =
        Object.keys(prev).length === Object.keys(next).length &&
        Object.entries(next).every(([depth, key]) => prev[depth] === key);
      return same ? prev : next;
    });
  }, [location.pathname, menu]);

  const toggleAtLevel = (depth, key) => {
    setOpenLevels((prev) => {
      const next = {};
      Object.entries(prev).forEach(([level, value]) => {
        if (Number(level) < depth) next[level] = value;
      });
      if (prev[depth] !== key) next[depth] = key;
      return next;
    });
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    clearStoredSession();
    navigate("/login");
  };

  const renderItems = (items, depth = 0) =>
    items.map((item) => {
      const isOpen = openLevels[depth] === item.key;
      const isActive =
        isPathActive(location.pathname, item.path, item.exact) ||
        (item.children?.length ? Boolean(getActiveTrail(item.children, location.pathname, [])) : false);

      return (
        <div key={item.key}>
          <MenuItem
            item={item}
            depth={depth}
            collapsed={collapsed}
            isOpen={isOpen}
            isActive={isActive}
            onToggle={() => toggleAtLevel(depth, item.key)}
            onNavigate={closeSidebar}
            onExpandRequest={onExpandRequest}
          />
          {item.children?.length ? (
            <SubMenu open={isOpen} collapsed={collapsed && depth === 0}>
              {renderItems(item.children, depth + 1)}
            </SubMenu>
          ) : null}
        </div>
      );
    });

  return (
    <aside className="flex w-64 h-full flex-col overflow-hidden border-r border-border-color bg-surface/95 backdrop-blur-xl">
      <div className="flex items-center justify-between gap-3 border-b border-border-color px-4 py-3">
        
        <div className="flex items-center justify-center w-full">
           <img src={logo} alt="logo" className="h-12 w-auto object-contain" />
        </div>

        <button
          type="button"
          onClick={onCollapseToggle}
          className="app-button-ghost hidden h-10 w-10 px-0 md:inline-flex"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <ChevronLeft className={`transition-transform ${collapsed ? "rotate-180" : ""}`} size={18} />
        </button>
      </div>

      <div className="hide-scrollbar flex-1 overflow-y-auto px-3 py-4">
        <div className="space-y-2">{renderItems(menu)}</div>
      </div>

      <div className="border-t border-border-color p-3">
        <button
          type="button"
          onClick={handleLogout}
          className={`group flex w-full items-center gap-3 rounded-2xl px-2 text-sm font-medium text-text-secondary transition hover:bg-danger/10 hover:text-danger ${
            collapsed ? "justify-center px-0" : ""
          }`}
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-2xl bg-surface-muted text-inherit transition group-hover:bg-danger/15">
            <LogOut size={16} />
          </span>
          {!collapsed ? <span>Logout</span> : null}
        </button>

        {!collapsed ? (
          <div className="mt-3 rounded-2xl bg-surface-muted p-3 text-xs text-text-secondary">
            Signed in as <span className="font-semibold text-text-primary">{role}</span>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

export default Sidebar;
