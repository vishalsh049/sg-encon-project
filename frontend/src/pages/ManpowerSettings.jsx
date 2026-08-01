import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Plus, Pencil, Trash2, RotateCcw, Save, X, ChevronDown, ChevronRight, Search, Upload } from "lucide-react";

import useManpowerConfig from "../hooks/useManpowerConfig";
import ConfirmDialog from "../components/ConfirmDialog";
import {
  createMainProfile,
  updateMainProfile,
  deleteMainProfile,
  createSubProfile,
  bulkCreateSubProfiles,
  updateSubProfile,
  deleteSubProfile,
  createCircle,
  updateCircle,
  deleteCircle,
  createCmp,
  updateCmp,
  deleteCmp,
  createValidationRule,
  updateValidationRule,
  deleteValidationRule,
  fetchUsageSummary,
} from "../lib/manpowerSettings";

const TABS = [
  { key: "profiles", label: "Main & Sub Profiles" },
  { key: "circles", label: "Circles & CMPs" },
];

const card = "rounded-[14px] border border-white/70 bg-surface/80 px-4 py-3";
const th = "border-b border-r border-border-color px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-text-muted";
const td = "border-b border-r border-border-color px-3 py-2 text-sm text-text-secondary";
const input = "w-full rounded-lg border border-border-color bg-surface px-2 py-1 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-blue-500";
const iconBtn = "inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border-color text-text-secondary hover:bg-surface-muted";
const primaryBtn = "flex items-center gap-2 rounded-xl border border-border-color bg-surface px-3 py-1.5 text-sm text-text-secondary shadow-sm hover:bg-surface-muted";

async function runOrToast(fn, successMessage) {
  try {
    await fn();
    if (successMessage) toast.success(successMessage);
    return true;
  } catch (error) {
    toast.error(error.message || "Something went wrong");
    return false;
  }
}

export default function ManpowerSettings() {
  const [activeTab, setActiveTab] = useState("profiles");
  const manpower = useManpowerConfig();

  const [usageSummary, setUsageSummary] = useState({});
  const [usageLoading, setUsageLoading] = useState(true);
  const applyUsage = (promise) =>
    promise
      .then(setUsageSummary)
      .catch((error) => console.error("Failed to load usage summary:", error))
      .finally(() => setUsageLoading(false));
  const loadUsage = () => {
    setUsageLoading(true);
    applyUsage(fetchUsageSummary());
  };
  // No setUsageLoading(true) here — see loadUsage() above for the
  // refresh-triggered case; on mount, usageLoading already starts true.
  useEffect(() => {
    applyUsage(fetchUsageSummary());
  }, []);

  // Shared "are you sure?" dialog for every deactivate action across every
  // tab — replaces window.confirm and the old fire-immediately buttons, so a
  // misclick can't quietly turn off a live mapping.
  const [confirmState, setConfirmState] = useState(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const requestConfirm = ({ title, description, confirmLabel = "Deactivate", onConfirm }) => {
    setConfirmState({ title, description, confirmLabel, onConfirm });
  };
  const handleConfirm = async () => {
    if (!confirmState?.onConfirm) return;
    setConfirmBusy(true);
    try {
      await confirmState.onConfirm();
    } finally {
      setConfirmBusy(false);
      setConfirmState(null);
    }
  };

  const refreshAll = () => {
    manpower.refresh();
    loadUsage();
  };

  return (
    <div className="min-h-screen space-y-3">
      <div className={card}>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">MANPOWER</p>
        <h1 className="text-lg font-semibold text-text-primary">Manpower Settings</h1>
        <p className="mt-1 text-xs text-text-muted">
          Single source of truth for Main Profiles, Sub Profiles, Circles/CMPs used across
          Physical, New Joining, Scrum and HR Dashboard. Changes here take effect without a redeploy.
        </p>
      </div>

      <div className="flex gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-xl border px-3 py-1.5 text-sm ${
              activeTab === tab.key
                ? "border-blue-500 bg-blue-500/10 text-blue-600"
                : "border-border-color bg-surface text-text-secondary hover:bg-surface-muted"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {manpower.loading && <div className={`${card} text-sm text-text-muted`}>Loading…</div>}
      {manpower.error && (
        <div className={`${card} text-sm text-red-500`}>Failed to load manpower settings.</div>
      )}

      {!manpower.loading && !manpower.error && (
        <>
          {activeTab === "profiles" && (
            <ProfilesTab
              manpower={manpower}
              refresh={refreshAll}
              requestConfirm={requestConfirm}
              usageSummary={usageSummary}
              usageLoading={usageLoading}
            />
          )}
          {activeTab === "circles" && <CirclesTab manpower={manpower} refresh={refreshAll} requestConfirm={requestConfirm} />}
          {activeTab === "validation-rules" && (
            <ValidationRulesTab manpower={manpower} refresh={refreshAll} requestConfirm={requestConfirm} />
          )}
        </>
      )}

      <ConfirmDialog
        open={Boolean(confirmState)}
        title={confirmState?.title}
        description={confirmState?.description}
        confirmLabel={confirmState?.confirmLabel}
        busy={confirmBusy}
        onConfirm={handleConfirm}
        onCancel={() => {
          if (!confirmBusy) setConfirmState(null);
        }}
      />
    </div>
  );
}

/* --------------------------- Main & Sub Profiles --------------------------- */

function UsageBadge({ usage, loading }) {
  if (loading) return <span className="text-xs text-text-muted">…</span>;
  if (!usage || usage.total === 0) {
    return (
      <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[11px] text-text-muted" title="Not used by any current record">
        unused
      </span>
    );
  }
  return (
    <span
      className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[11px] text-blue-600"
      title={`Physical: ${usage.physical} · New Joining: ${usage.newJoining} · Scrum: ${usage.scrum}`}
    >
      {usage.total} record{usage.total === 1 ? "" : "s"}
    </span>
  );
}

function ProfilesTab({ manpower, refresh, requestConfirm, usageSummary, usageLoading }) {
  const { config } = manpower;
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState({});
  const [addingMainProfile, setAddingMainProfile] = useState(false);
  const [mpDraft, setMpDraft] = useState({ roleKey: "", label: "", hasSignoffColumn: true, displayOrder: 0 });

  const normalizedSearch = search.trim().toLowerCase();
  const mainProfiles = [...config.mainProfiles].sort((a, b) => a.displayOrder - b.displayOrder);

  const subProfilesFor = (roleKey) => config.subProfiles.filter((sp) => sp.mainProfileRoleKey === roleKey);
  const unmapped = config.subProfiles.filter((sp) => !sp.mainProfileId);

  // A Main Profile is visible if its own label/key match, or any of its
  // Sub Profiles do — and in the latter case it auto-expands so the match
  // isn't hidden inside a collapsed card.
  const visibleMainProfiles = useMemo(() => {
    if (!normalizedSearch) return mainProfiles;
    return mainProfiles.filter((mp) => {
      const ownMatch = mp.label.toLowerCase().includes(normalizedSearch) || mp.roleKey.toLowerCase().includes(normalizedSearch);
      const childMatch = subProfilesFor(mp.roleKey).some((sp) => sp.designationLabel.toLowerCase().includes(normalizedSearch));
      return ownMatch || childMatch;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalizedSearch, config.mainProfiles, config.subProfiles]);

  // Derived at render time rather than synced into state via an effect —
  // while searching, every visible card auto-expands; manual toggles (via
  // `expanded`) still apply once the search box is cleared again.
  const isExpanded = (roleKey) => Boolean(normalizedSearch) || Boolean(expanded[roleKey]);

  const visibleUnmapped = normalizedSearch
    ? unmapped.filter((sp) => sp.designationLabel.toLowerCase().includes(normalizedSearch))
    : unmapped;

  const handleCreateMainProfile = async () => {
    if (!mpDraft.roleKey.trim() || !mpDraft.label.trim()) {
      toast.error("Role key and label are required");
      return;
    }
    const ok = await runOrToast(
      () => createMainProfile({ ...mpDraft, displayOrder: Number(mpDraft.displayOrder) || mainProfiles.length }),
      "Main Profile created"
    );
    if (ok) {
      setMpDraft({ roleKey: "", label: "", hasSignoffColumn: true, displayOrder: 0 });
      setAddingMainProfile(false);
      refresh();
    }
  };

  const handleDeactivateMainProfile = (row) => {
    const childCount = subProfilesFor(row.roleKey).length;
    requestConfirm({
      title: `Deactivate "${row.label}"?`,
      description: `This Main Profile has ${childCount} Sub Profile${childCount === 1 ? "" : "s"} under it. Deactivating it hides it from Physical/HR Dashboard, but its Sub Profiles stay assigned to it — reactivating restores everything.`,
      confirmLabel: "Deactivate",
      onConfirm: async () => {
        const ok = await runOrToast(() => deleteMainProfile(row.id), "Main Profile deactivated");
        if (ok) refresh();
      },
    });
  };

  const handleReactivateMainProfile = async (row) => {
    const ok = await runOrToast(() => updateMainProfile(row.id, { isActive: true }), "Main Profile reactivated");
    if (ok) refresh();
  };

  return (
    <div className="space-y-3">
      <div className={card}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="relative w-full max-w-xs">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              className={`${input} pl-8`}
              placeholder="Search main or sub profiles…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button className={primaryBtn} onClick={() => setAddingMainProfile((v) => !v)}>
            <Plus size={14} /> Add Main Profile
          </button>
        </div>

        {addingMainProfile && (
          <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-border-color p-2">
            <Field label="Role Key (unique, e.g. quality_lead)">
              <input className={input} value={mpDraft.roleKey} onChange={(e) => setMpDraft({ ...mpDraft, roleKey: e.target.value })} />
            </Field>
            <Field label="Label">
              <input className={input} value={mpDraft.label} onChange={(e) => setMpDraft({ ...mpDraft, label: e.target.value })} />
            </Field>
            <Field label="Display Order">
              <input
                type="number"
                className={input}
                value={mpDraft.displayOrder}
                onChange={(e) => setMpDraft({ ...mpDraft, displayOrder: e.target.value })}
              />
            </Field>
            <label className="flex items-center gap-1 pb-1 text-xs text-text-secondary">
              <input
                type="checkbox"
                checked={mpDraft.hasSignoffColumn}
                onChange={(e) => setMpDraft({ ...mpDraft, hasSignoffColumn: e.target.checked })}
              />
              Backed by a Signoff column
            </label>
            <button className={primaryBtn} onClick={handleCreateMainProfile}>
              <Save size={14} /> Save
            </button>
          </div>
        )}
      </div>

      {normalizedSearch && visibleMainProfiles.length === 0 && visibleUnmapped.length === 0 && (
        <div className={`${card} text-sm text-text-muted`}>No profiles match "{search}".</div>
      )}

      {visibleMainProfiles.map((mp) => (
        <MainProfileCard
          key={mp.id}
          mainProfile={mp}
          subProfiles={subProfilesFor(mp.roleKey).filter(
            (sp) => !normalizedSearch || sp.designationLabel.toLowerCase().includes(normalizedSearch) || mp.label.toLowerCase().includes(normalizedSearch) || mp.roleKey.toLowerCase().includes(normalizedSearch)
          )}
          expanded={isExpanded(mp.roleKey)}
          onToggle={() => setExpanded((prev) => ({ ...prev, [mp.roleKey]: !prev[mp.roleKey] }))}
          onDeactivate={() => handleDeactivateMainProfile(mp)}
          onReactivate={() => handleReactivateMainProfile(mp)}
          refresh={refresh}
          requestConfirm={requestConfirm}
          usageSummary={usageSummary}
          usageLoading={usageLoading}
        />
      ))}

      {visibleUnmapped.length > 0 && (
        <UnmappedCard
          subProfiles={visibleUnmapped}
          mainProfiles={mainProfiles}
          refresh={refresh}
          requestConfirm={requestConfirm}
          usageSummary={usageSummary}
          usageLoading={usageLoading}
        />
      )}
    </div>
  );
}

function MainProfileCard({
  mainProfile,
  subProfiles,
  expanded,
  onToggle,
  onDeactivate,
  onReactivate,
  refresh,
  requestConfirm,
  usageSummary,
  usageLoading,
}) {
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState({ label: mainProfile.label, hasSignoffColumn: mainProfile.hasSignoffColumn });

  const handleSaveEdit = async () => {
    const ok = await runOrToast(() => updateMainProfile(mainProfile.id, editDraft), "Main Profile updated");
    if (ok) {
      setEditing(false);
      refresh();
    }
  };

  return (
    <div className={`${card} ${mainProfile.isActive ? "" : "opacity-50"}`}>
      <div className="flex items-center justify-between gap-2">
        <button className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={onToggle}>
          {expanded ? <ChevronDown size={16} className="flex-shrink-0 text-text-muted" /> : <ChevronRight size={16} className="flex-shrink-0 text-text-muted" />}
          <code className="flex-shrink-0 text-xs text-text-muted">{mainProfile.roleKey}</code>
          {editing ? (
            <input
              className={`${input} max-w-xs`}
              value={editDraft.label}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setEditDraft({ ...editDraft, label: e.target.value })}
            />
          ) : (
            <span className="truncate text-sm font-semibold text-text-primary">{mainProfile.label}</span>
          )}
          <span className="flex-shrink-0 text-xs text-text-muted">
            {subProfiles.length} sub profile{subProfiles.length === 1 ? "" : "s"}
          </span>
          {!mainProfile.hasSignoffColumn && (
            <span className="flex-shrink-0 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-600">no Signoff column</span>
          )}
          {!mainProfile.isActive && <span className="flex-shrink-0 rounded-full bg-surface-muted px-2 py-0.5 text-[11px] text-text-muted">inactive</span>}
        </button>

        <div className="flex flex-shrink-0 gap-1">
          {editing ? (
            <>
              <button className={iconBtn} onClick={handleSaveEdit} title="Save">
                <Save size={14} />
              </button>
              <button className={iconBtn} onClick={() => setEditing(false)} title="Cancel">
                <X size={14} />
              </button>
            </>
          ) : (
            <button className={iconBtn} onClick={() => setEditing(true)} title="Rename">
              <Pencil size={14} />
            </button>
          )}
          <button
            className={iconBtn}
            onClick={mainProfile.isActive ? onDeactivate : onReactivate}
            title={mainProfile.isActive ? "Deactivate" : "Reactivate"}
          >
            {mainProfile.isActive ? <Trash2 size={14} /> : <RotateCcw size={14} />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 border-t border-border-color pt-3">
          <SubProfileTable
            subProfiles={subProfiles}
            mainProfileId={mainProfile.id}
            refresh={refresh}
            requestConfirm={requestConfirm}
            usageSummary={usageSummary}
            usageLoading={usageLoading}
          />
        </div>
      )}
    </div>
  );
}

function SubProfileTable({ subProfiles, mainProfileId, refresh, requestConfirm, usageSummary, usageLoading, allowReassign, mainProfiles }) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ designationLabel: "", matchType: "exact", sourceScope: "both" });
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkMatchType, setBulkMatchType] = useState("exact");
  const [bulkScope, setBulkScope] = useState("both");
  const [reassignTarget, setReassignTarget] = useState({});

  const handleCreate = async () => {
    if (!draft.designationLabel.trim()) {
      toast.error("Designation label is required");
      return;
    }
    const ok = await runOrToast(() => createSubProfile({ ...draft, mainProfileId }), "Sub Profile created");
    if (ok) {
      setDraft({ designationLabel: "", matchType: "exact", sourceScope: "both" });
      setAdding(false);
      refresh();
    }
  };

  const handleBulkImport = async () => {
    const labels = bulkText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (!labels.length) {
      toast.error("Paste at least one designation, one per line");
      return;
    }
    try {
      const result = await bulkCreateSubProfiles({
        mainProfileId,
        designationLabels: labels,
        matchType: bulkMatchType,
        sourceScope: bulkScope,
      });
      toast.success(`Added ${result.created}, skipped ${result.skipped} already-existing`);
      setBulkText("");
      setBulkOpen(false);
      refresh();
    } catch (error) {
      toast.error(error.message || "Bulk import failed");
    }
  };

  const handleDeactivate = (row) => {
    const usage = usageSummary[row.id];
    requestConfirm({
      title: `Deactivate "${row.designationLabel}"?`,
      description:
        usage && usage.total > 0
          ? `${usage.total} current record${usage.total === 1 ? "" : "s"} (Physical: ${usage.physical}, New Joining: ${usage.newJoining}, Scrum: ${usage.scrum}) use this designation. Deactivating it means those records will stop counting toward "${row.mainProfileRoleKey || "any"}" in the dashboards.`
          : "This designation isn't used by any current record, so this is safe.",
      confirmLabel: "Deactivate",
      onConfirm: async () => {
        const ok = await runOrToast(() => deleteSubProfile(row.id), "Sub Profile deactivated");
        if (ok) refresh();
      },
    });
  };

  const handleReactivate = async (row) => {
    const ok = await runOrToast(() => updateSubProfile(row.id, { isActive: true }), "Sub Profile reactivated");
    if (ok) refresh();
  };

  const handleReassign = async (row) => {
    const targetId = reassignTarget[row.id];
    if (!targetId) {
      toast.error("Pick a Main Profile first");
      return;
    }
    const ok = await runOrToast(() => updateSubProfile(row.id, { mainProfileId: targetId }), "Sub Profile assigned");
    if (ok) refresh();
  };

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-2">
        <button className={primaryBtn} onClick={() => setAdding((v) => !v)}>
          <Plus size={14} /> Add Sub Profile
        </button>
        <button className={primaryBtn} onClick={() => setBulkOpen((v) => !v)}>
          <Upload size={14} /> Bulk Add
        </button>
      </div>

      {adding && (
        <div className="mb-3 flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-border-color p-2">
          <Field label="Designation Label">
            <input
              className={input}
              value={draft.designationLabel}
              onChange={(e) => setDraft({ ...draft, designationLabel: e.target.value })}
            />
          </Field>
          <Field label="Match Type">
            <select className={input} value={draft.matchType} onChange={(e) => setDraft({ ...draft, matchType: e.target.value })}>
              <option value="exact">Exact</option>
              <option value="prefix">Prefix (e.g. "Analyst" matches "Analyst - X")</option>
            </select>
          </Field>
          <Field label="Applies To">
            <select className={input} value={draft.sourceScope} onChange={(e) => setDraft({ ...draft, sourceScope: e.target.value })}>
              <option value="both">Physical & Scrum</option>
              <option value="physical">Physical / New Joining only</option>
              <option value="scrum">Scrum only</option>
            </select>
          </Field>
          <button className={primaryBtn} onClick={handleCreate}>
            <Save size={14} /> Save
          </button>
        </div>
      )}

      {bulkOpen && (
        <div className="mb-3 space-y-2 rounded-lg border border-dashed border-border-color p-2">
          <p className="text-xs text-text-muted">Paste one designation per line — existing ones are skipped automatically.</p>
          <textarea
            className={`${input} h-28 font-mono text-xs`}
            placeholder={"State Fiber SME\nState ISP SME\nState Utility SME"}
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
          />
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Match Type">
              <select className={input} value={bulkMatchType} onChange={(e) => setBulkMatchType(e.target.value)}>
                <option value="exact">Exact</option>
                <option value="prefix">Prefix</option>
              </select>
            </Field>
            <Field label="Applies To">
              <select className={input} value={bulkScope} onChange={(e) => setBulkScope(e.target.value)}>
                <option value="both">Physical & Scrum</option>
                <option value="physical">Physical / New Joining only</option>
                <option value="scrum">Scrum only</option>
              </select>
            </Field>
            <button className={primaryBtn} onClick={handleBulkImport}>
              <Upload size={14} /> Import {bulkText.split("\n").map((l) => l.trim()).filter(Boolean).length || ""}
            </button>
          </div>
        </div>
      )}

      {subProfiles.length === 0 ? (
        <p className="text-xs text-text-muted">No Sub Profiles yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={th}>Designation</th>
                <th className={th}>Match</th>
                <th className={th}>Applies To</th>
                <th className={th}>Usage</th>
                <th className={th}>Status</th>
                {allowReassign && <th className={th}>Reassign</th>}
                <th className={th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {subProfiles.map((row) => (
                <tr key={row.id} className={row.isActive ? "" : "opacity-50"}>
                  <td className={td}>{row.designationLabel}</td>
                  <td className={td}>{row.matchType}</td>
                  <td className={td}>{row.sourceScope}</td>
                  <td className={td}>
                    <UsageBadge usage={usageSummary[row.id]} loading={usageLoading} />
                  </td>
                  <td className={td}>{row.isActive ? "Active" : "Inactive"}</td>
                  {allowReassign && (
                    <td className={td}>
                      <div className="flex gap-1">
                        <select
                          className={input}
                          value={reassignTarget[row.id] || ""}
                          onChange={(e) => setReassignTarget({ ...reassignTarget, [row.id]: e.target.value })}
                        >
                          <option value="">Pick Main Profile…</option>
                          {mainProfiles.map((mp) => (
                            <option key={mp.id} value={mp.id}>
                              {mp.label}
                            </option>
                          ))}
                        </select>
                        <button className={iconBtn} onClick={() => handleReassign(row)} title="Assign">
                          <Save size={14} />
                        </button>
                      </div>
                    </td>
                  )}
                  <td className={td}>
                    <button
                      className={iconBtn}
                      onClick={() => (row.isActive ? handleDeactivate(row) : handleReactivate(row))}
                      title={row.isActive ? "Deactivate" : "Reactivate"}
                    >
                      {row.isActive ? <Trash2 size={14} /> : <RotateCcw size={14} />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function UnmappedCard({ subProfiles, mainProfiles, refresh, requestConfirm, usageSummary, usageLoading }) {
  return (
    <div className={card}>
      <h3 className="mb-1 text-sm font-semibold text-text-primary">Unmapped Designations</h3>
      <p className="mb-2 text-xs text-text-muted">
        Valid designations that don't roll up into any Main Profile — they still show up in dropdowns but never count
        toward a headcount bucket. Assign one to a Main Profile below if it should.
      </p>
      <SubProfileTable
        subProfiles={subProfiles}
        mainProfileId={null}
        refresh={refresh}
        requestConfirm={requestConfirm}
        usageSummary={usageSummary}
        usageLoading={usageLoading}
        allowReassign
        mainProfiles={mainProfiles}
      />
    </div>
  );
}

/* -------------------------------- Circles -------------------------------- */

function CirclesTab({ manpower, refresh, requestConfirm }) {
  const { config } = manpower;
  const [addingCircle, setAddingCircle] = useState(false);
  const [circleDraft, setCircleDraft] = useState({ name: "", displayOrder: 0 });
  const [cmpDraftByCircle, setCmpDraftByCircle] = useState({});

  const circles = [...config.circles].sort((a, b) => a.displayOrder - b.displayOrder);

  const handleCreateCircle = async () => {
    if (!circleDraft.name.trim()) {
      toast.error("Circle name is required");
      return;
    }
    const ok = await runOrToast(() => createCircle(circleDraft), "Circle created");
    if (ok) {
      setCircleDraft({ name: "", displayOrder: 0 });
      setAddingCircle(false);
      refresh();
    }
  };

  const handleDeactivateCircle = (row) => {
    const cmpCount = config.cmps.filter((c) => c.circleId === row.id && c.isActive).length;
    requestConfirm({
      title: `Deactivate "${row.name}"?`,
      description: `This circle has ${cmpCount} active CMP${cmpCount === 1 ? "" : "s"} under it. They'll stop appearing in dropdowns until this circle is reactivated.`,
      confirmLabel: "Deactivate",
      onConfirm: async () => {
        const ok = await runOrToast(() => deleteCircle(row.id), "Circle deactivated");
        if (ok) refresh();
      },
    });
  };

  const handleReactivateCircle = async (row) => {
    const ok = await runOrToast(() => updateCircle(row.id, { isActive: true }), "Circle reactivated");
    if (ok) refresh();
  };

  const handleAddCmp = async (circleId) => {
    const name = (cmpDraftByCircle[circleId] || "").trim();
    if (!name) {
      toast.error("CMP name is required");
      return;
    }
    const ok = await runOrToast(() => createCmp({ circleId, name }), "CMP added");
    if (ok) {
      setCmpDraftByCircle({ ...cmpDraftByCircle, [circleId]: "" });
      refresh();
    }
  };

  const handleDeactivateCmp = (row) => {
    requestConfirm({
      title: `Deactivate CMP "${row.name}"?`,
      description: "It will stop appearing in Circle/CMP dropdowns until reactivated.",
      confirmLabel: "Deactivate",
      onConfirm: async () => {
        const ok = await runOrToast(() => deleteCmp(row.id), "CMP deactivated");
        if (ok) refresh();
      },
    });
  };

  const handleReactivateCmp = async (row) => {
    const ok = await runOrToast(() => updateCmp(row.id, { isActive: true }), "CMP reactivated");
    if (ok) refresh();
  };

  return (
    <div className="space-y-3">
      <div className={card}>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-primary">Circles</h2>
          <button className={primaryBtn} onClick={() => setAddingCircle((v) => !v)}>
            <Plus size={14} /> Add Circle
          </button>
        </div>
        {addingCircle && (
          <div className="mb-2 flex items-end gap-2">
            <Field label="Circle Name">
              <input className={input} value={circleDraft.name} onChange={(e) => setCircleDraft({ ...circleDraft, name: e.target.value })} />
            </Field>
            <button className={primaryBtn} onClick={handleCreateCircle}>
              <Save size={14} /> Save
            </button>
          </div>
        )}
      </div>

      {circles.map((circle) => (
        <div key={circle.id} className={`${card} ${circle.isActive ? "" : "opacity-50"}`}>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-text-primary">{circle.name}</h3>
            <button
              className={iconBtn}
              onClick={() => (circle.isActive ? handleDeactivateCircle(circle) : handleReactivateCircle(circle))}
              title={circle.isActive ? "Deactivate circle" : "Reactivate circle"}
            >
              {circle.isActive ? <Trash2 size={14} /> : <RotateCcw size={14} />}
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={th}>CMP</th>
                  <th className={th}>Status</th>
                  <th className={th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {config.cmps
                  .filter((c) => c.circleId === circle.id)
                  .sort((a, b) => a.displayOrder - b.displayOrder)
                  .map((c) => (
                    <tr key={c.id} className={c.isActive ? "" : "opacity-50"}>
                      <td className={td}>{c.name}</td>
                      <td className={td}>{c.isActive ? "Active" : "Inactive"}</td>
                      <td className={td}>
                        <button
                          className={iconBtn}
                          onClick={() => (c.isActive ? handleDeactivateCmp(c) : handleReactivateCmp(c))}
                          title={c.isActive ? "Deactivate" : "Reactivate"}
                        >
                          {c.isActive ? <Trash2 size={14} /> : <RotateCcw size={14} />}
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          <div className="mt-2 flex items-end gap-2">
            <Field label="New CMP name">
              <input
                className={input}
                value={cmpDraftByCircle[circle.id] || ""}
                onChange={(e) => setCmpDraftByCircle({ ...cmpDraftByCircle, [circle.id]: e.target.value })}
              />
            </Field>
            <button className={primaryBtn} onClick={() => handleAddCmp(circle.id)}>
              <Plus size={14} /> Add CMP
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

/* --------------------------- Validation Rules --------------------------- */

function ValidationRulesTab({ manpower, refresh, requestConfirm }) {
  const { config } = manpower;
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ fieldKey: "", ruleType: "regex", ruleValue: "", errorMessage: "", appliesTo: "physical" });
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState("");

  const rows = [...config.validationRules].sort((a, b) => a.fieldKey.localeCompare(b.fieldKey));

  const handleCreate = async () => {
    if (!draft.fieldKey.trim() || !draft.ruleValue.trim()) {
      toast.error("Field key and rule value are required");
      return;
    }
    let ruleValue = draft.ruleValue;
    if (draft.ruleType === "enum") {
      ruleValue = draft.ruleValue.split(",").map((v) => v.trim()).filter(Boolean);
    }
    const ok = await runOrToast(
      () =>
        createValidationRule({
          fieldKey: draft.fieldKey,
          ruleType: draft.ruleType,
          ruleValue,
          errorMessage: draft.errorMessage,
          appliesTo: draft.appliesTo.split(",").map((v) => v.trim()).filter(Boolean),
        }),
      "Validation rule created"
    );
    if (ok) {
      setDraft({ fieldKey: "", ruleType: "regex", ruleValue: "", errorMessage: "", appliesTo: "physical" });
      setAdding(false);
      refresh();
    }
  };

  const startEdit = (row) => {
    setEditingId(row.id);
    setEditValue(Array.isArray(row.ruleValue) ? row.ruleValue.join(", ") : String(row.ruleValue));
  };

  const handleSaveEdit = async (row) => {
    const ruleValue = row.ruleType === "enum" ? editValue.split(",").map((v) => v.trim()).filter(Boolean) : editValue;
    const ok = await runOrToast(() => updateValidationRule(row.id, { ruleValue }), "Validation rule updated");
    if (ok) {
      setEditingId(null);
      refresh();
    }
  };

  const handleDeactivate = (row) => {
    requestConfirm({
      title: `Deactivate rule for "${row.fieldKey}"?`,
      description: `Forms will stop enforcing this ${row.ruleType} rule until it's reactivated.`,
      confirmLabel: "Deactivate",
      onConfirm: async () => {
        const ok = await runOrToast(() => deleteValidationRule(row.id), "Rule deactivated");
        if (ok) refresh();
      },
    });
  };

  const handleReactivate = async (row) => {
    const ok = await runOrToast(() => updateValidationRule(row.id, { isActive: true }), "Rule reactivated");
    if (ok) refresh();
  };

  return (
    <div className={card}>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text-primary">Validation Rules</h2>
        <button className={primaryBtn} onClick={() => setAdding((v) => !v)}>
          <Plus size={14} /> Add Rule
        </button>
      </div>

      {adding && (
        <div className="mb-3 flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-border-color p-2">
          <Field label="Field Key (e.g. mobile_number)">
            <input className={input} value={draft.fieldKey} onChange={(e) => setDraft({ ...draft, fieldKey: e.target.value })} />
          </Field>
          <Field label="Rule Type">
            <select className={input} value={draft.ruleType} onChange={(e) => setDraft({ ...draft, ruleType: e.target.value })}>
              <option value="regex">Regex</option>
              <option value="enum">Enum (comma-separated)</option>
              <option value="required">Required</option>
              <option value="range">Range</option>
            </select>
          </Field>
          <Field label="Rule Value">
            <input className={input} value={draft.ruleValue} onChange={(e) => setDraft({ ...draft, ruleValue: e.target.value })} />
          </Field>
          <Field label="Error Message">
            <input className={input} value={draft.errorMessage} onChange={(e) => setDraft({ ...draft, errorMessage: e.target.value })} />
          </Field>
          <Field label="Applies To (comma-separated)">
            <input className={input} value={draft.appliesTo} onChange={(e) => setDraft({ ...draft, appliesTo: e.target.value })} />
          </Field>
          <button className={primaryBtn} onClick={handleCreate}>
            <Save size={14} /> Save
          </button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={th}>Field</th>
              <th className={th}>Type</th>
              <th className={th}>Rule Value</th>
              <th className={th}>Error Message</th>
              <th className={th}>Applies To</th>
              <th className={th}>Status</th>
              <th className={th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className={row.isActive ? "" : "opacity-50"}>
                <td className={td}>{row.fieldKey}</td>
                <td className={td}>{row.ruleType}</td>
                <td className={td}>
                  {editingId === row.id ? (
                    <input className={input} value={editValue} onChange={(e) => setEditValue(e.target.value)} />
                  ) : Array.isArray(row.ruleValue) ? (
                    row.ruleValue.join(", ")
                  ) : (
                    String(row.ruleValue)
                  )}
                </td>
                <td className={td}>{row.errorMessage}</td>
                <td className={td}>{(row.appliesTo || []).join(", ")}</td>
                <td className={td}>{row.isActive ? "Active" : "Inactive"}</td>
                <td className={td}>
                  <div className="flex gap-1">
                    {editingId === row.id ? (
                      <>
                        <button className={iconBtn} onClick={() => handleSaveEdit(row)} title="Save">
                          <Save size={14} />
                        </button>
                        <button className={iconBtn} onClick={() => setEditingId(null)} title="Cancel">
                          <X size={14} />
                        </button>
                      </>
                    ) : (
                      <button className={iconBtn} onClick={() => startEdit(row)} title="Edit value">
                        <Pencil size={14} />
                      </button>
                    )}
                    <button
                      className={iconBtn}
                      onClick={() => (row.isActive ? handleDeactivate(row) : handleReactivate(row))}
                      title={row.isActive ? "Deactivate" : "Reactivate"}
                    >
                      {row.isActive ? <Trash2 size={14} /> : <RotateCcw size={14} />}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-text-muted">
      {label}
      {children}
    </label>
  );
}
