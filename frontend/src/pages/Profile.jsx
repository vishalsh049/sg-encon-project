import {
  Award,
  Briefcase,
  Building2,
  CalendarDays,
  Clock,
  Globe,
  IdCard,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  User as UserIcon,
} from "lucide-react";
import { useUser } from "../context/UserContext";

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getInitials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "U";
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function InfoField({ icon: Icon, label, value }) {
  return (
    <div className="app-surface-soft flex items-start gap-3 rounded-2xl px-4 py-3">
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon size={16} />
      </div>
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
          {label}
        </div>
        <div className="mt-0.5 truncate text-sm font-semibold text-text-primary" title={value}>
          {value || "—"}
        </div>
      </div>
    </div>
  );
}

function Profile() {
  const { user } = useUser();

  if (!user) return null;

  const status = String(user.status || "active").toLowerCase();
  const isActive = status === "active";
 
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 pb-10">
      {/* Header */}
      <div className="app-surface relative overflow-hidden rounded-3xl border border-white/40 bg-gradient-to-br from-primary/10 via-surface to-surface p-6 shadow-panel md:p-8">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative flex flex-col items-center gap-5 text-center sm:flex-row sm:items-center sm:text-left">
          {user.profilePhoto ? (
            <img
              src={user.profilePhoto}
              alt={user.name}
              className="h-24 w-24 shrink-0 rounded-2xl object-cover shadow-panel ring-4 ring-surface"
            />
          ) : (
            <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-indigo-400 text-3xl font-bold text-white shadow-panel ring-4 ring-surface">
              {getInitials(user.name)}
            </div>
          )}

          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold tracking-tight text-text-primary md:text-2xl">
              {user.name || "User"}
            </h1>
            <p className="mt-1 text-sm font-medium text-text-secondary">
              {user.designation || "—"}
              {user.department ? ` · ${user.department}` : ""}
            </p>

            <div className="mt-3 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                  isActive ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
                }`}
              >
                <ShieldCheck size={13} /> {isActive ? "Active" : "Inactive"}
              </span>
              {user.roleName ? (
                <span className="app-badge">{user.roleName}</span>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Details grid */}
      <div className="app-surface rounded-3xl p-5 md:p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-text-muted">
          Personal &amp; Employment Details
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <InfoField icon={UserIcon} label="Full Name" value={user.name} />
          <InfoField icon={IdCard} label="Username" value={user.username} />
          <InfoField icon={IdCard} label="Employee ID" value={user.employeeId} />
          <InfoField icon={Briefcase} label="Designation" value={user.designation} />
          <InfoField icon={Building2} label="Department" value={user.department} />
          <InfoField icon={MapPin} label="Circle" value={user.circle} />
          <InfoField icon={Globe} label="Domain" value={user.domain} />
          <InfoField icon={Mail} label="Email" value={user.email} />
          <InfoField icon={Phone} label="Mobile Number" value={user.mobile} />
          <InfoField
            icon={ShieldCheck}
            label="Employment Status"
            value={isActive ? "Active" : "Inactive"}
          />
          <InfoField icon={CalendarDays} label="Date of Joining" value={formatDate(user.dateOfJoining)} />
          <InfoField icon={Clock} label="Last Login" value={formatDateTime(user.lastLogin)} />
          <InfoField
            icon={ShieldCheck}
            label="Account Status"
            value={isActive ? "Active" : "Inactive"}
          />
        </div>
      </div>
    </div>
  );
}

export default Profile;
