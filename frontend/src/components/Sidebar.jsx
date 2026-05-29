import { useMemo } from "react";
import { hasAccess } from "../utils/access";
import { useLocation, useNavigate } from "react-router-dom";
import {
  BriefcaseBusiness,
  FileText,
  LayoutDashboard,
  LogOut,
  ReceiptText,
  ShieldCheck,
  Database,
} from "lucide-react";
import logo from "../assets/logo.png";
import { clearStoredSession, getStoredSession, hasPermission } from "../lib/session";
import MenuItem from "./MenuItem";


function isPathActive(pathname, path, exact = false) {
  if (!path) return false;
  if (exact) {
    return pathname === path;
  }
  return pathname === path || pathname.startsWith(`${path}/`);
}

function filterMenuByRole(items, role, sessionUser) {
  const normalizedRole = String(role || "").trim().toLowerCase();
  return items.reduce((acc, item) => {
    if (
      item.roles &&
      !item.roles.map((value) => String(value).toLowerCase()).includes(normalizedRole)
    ) {
      return acc;
    }

    if (item.permission && !hasPermission(item.permission)) return acc;

    if (item.accessPage && !hasAccess(item.accessPage, sessionUser)) return acc;

    if (
      item.accessPages &&
      !item.accessPages.some((page) => hasAccess(page, sessionUser))
    ) {
      return acc;
    }

    acc.push(item);
    return acc;
  }, []);
}

function Sidebar({ closeSidebar, collapsed, onExpandRequest }) {
  const location = useLocation();
  const navigate = useNavigate();
  const role = localStorage.getItem("role") || "admin";
  const sessionUser = useMemo(() => getStoredSession(), []);

  const menu = useMemo(
    () =>
      filterMenuByRole(
        [
  // MAIN
  {
    key: "dashboard",
    label: "Dashboard",
    path: "/dashboard",
    exact: true,
    icon: LayoutDashboard,
    description: "Overview",
    accessPage: "Dashboard",
    
  },

  // BILLING
  {
    key: "billing-dashboard",
    label: "Billing Dashboard",
    path: "/dashboard/billing",
    icon: ReceiptText,
    accessPage: "Billing Dashboard",
    section: "BILLING",
  },
  {
    key: "billing-status",
    label: "Billing Status",
    path: "/dashboard/billing/status",
    icon: ReceiptText,
    accessPage: "Billing Status",
  },
  {
    key: "revenue",
    label: "Revenue",
    path: "/dashboard/billing/revenue",
    icon: ReceiptText,
    accessPage: "Revenue",
  },
  {
    key: "kpis-penalty",
    label: "KPIs Penalty",
    path: "/dashboard/billing/penalties/kpis",
    icon: ReceiptText,
    accessPage: "KPIs Penalty",
  },
  {
    key: "general-penalties",
    label: "General Penalties",
    path: "/dashboard/billing/penalties/general",
    icon: ReceiptText,
    accessPage: "General Penalties",
  },

  // MANPOWER
{
  key: "hr-dashboard",
  label: "HR Dashboard",
  path: "/dashboard/hr-dashboard",
  icon: BriefcaseBusiness,
  accessPage: "HR Dashboard",
  section: "MANPOWER",
},

{
  key: "physical",
  label: "Physical",
  path: "/dashboard/manpower/physical",
  icon: BriefcaseBusiness,
  accessPage: "Physical",
},

{
  key: "new-joining",
  label: "New Joining",
  path: "/dashboard/manpower/new-joining",
  icon: BriefcaseBusiness,
  accessPage: "New Joining",
},

{
  key: "scrum",
  label: "SCRUM",
  path: "/dashboard/manpower/scrum",
  icon: BriefcaseBusiness,
  accessPage: "Scrum",
},

{
  key: "signoff",
  label: "Sign Off",
  path: "/dashboard/manpower/signoff",
  icon: BriefcaseBusiness,
  accessPage: "Signoff",
},

  // REPORTS

  {
  key: "kpi-dashboard",
  label: "KPI Dashboard",
  path: "/dashboard/reports",
  icon: FileText,
  accessPage: "KPI Dashboard",
  section: "REPORTS",
},

  {
    key: "tower-reports",
    label: "Tower Reports",
    path: "/dashboard/reports/tower",
    icon: FileText,
    accessPage: "Tower Reports",
    section: "REPORTS",
  },
  {
    key: "nso-reports",
    label: "NSO Reports",
    path: "/dashboard/reports/fiber/nso",
    icon: Database,
    accessPage: "NSO Reports",
  },
  {
    key: "fiber-inventory",
    label: "Fiber Inventory",
    path: "/dashboard/reports/fiber/inventory",
    icon: Database,
    accessPage: "Fiber Reports",
  },

  // SETTINGS
  {
    key: "users-access",
    label: "Users & Access",
    path: "/dashboard/users-access",
    icon: ShieldCheck,
    description: "Roles & permissions",
    accessPages: ["Users", "Roles & Permissions"],
    section: "SETTINGS",
  },
],
        role,
        sessionUser
      ),
    [role, sessionUser]
  );

  const renderItems = (items) => {
  let lastSection = "";

  return items.map((item) => {
    const isActive = isPathActive(location.pathname, item.path, item.exact);

    const showSection = item.section && item.section !== lastSection;

    if (item.section) {
      lastSection = item.section;
    }

    return (
      <div key={item.key}>
        {showSection && !collapsed ? (
          <div className="px-3  pb-1 text-[10px] font-semibold tracking-[0.18em] text-text-secondary/60">
            {item.section}
          </div>
        ) : null}

        <MenuItem
          item={item}
          depth={0}
          collapsed={collapsed}
          isActive={isActive}
          onNavigate={(path) => {
            if (path) navigate(path);
            closeSidebar?.();
          }}
          onExpandRequest={onExpandRequest}
        />
      </div>
    );
  });
};

  const handleLogout = () => {
    localStorage.removeItem("token");
    clearStoredSession();
    navigate("/login");
  };

  return (
    <aside className="flex w-56 h-full flex-col overflow-hidden border-r border-border-color bg-surface/95 backdrop-blur-xl">
      <div className="flex items-center justify-between gap-3 border-b border-border-color px-4 py-3">
        
        <div className="flex items-center justify-center w-full">
           <img src={logo} alt="logo" className="h-10 w-auto object-contain" />
        </div>

        
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
