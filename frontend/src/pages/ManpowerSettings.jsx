import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Plus, Pencil, Trash2, RotateCcw, Save, X } from "lucide-react";

import useManpowerConfig from "../hooks/useManpowerConfig";
import {
  createMainProfile,
  updateMainProfile,
  deleteMainProfile,
  createSubProfile,
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
} from "../lib/manpowerSettings";

const TABS = [
  { key: "main-profiles", label: "Main Profiles" },
  { key: "sub-profiles", label: "Sub Profiles" },
  { key: "circles", label: "Circles & CMPs" },
  { key: "validation-rules", label: "Validation Rules" },
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
  const [activeTab, setActiveTab] = useState("main-profiles");
  const manpower = useManpowerConfig();

  return (
    <div className="min-h-screen space-y-3">
      <div className={card}>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">MANPOWER</p>
        <h1 className="text-lg font-semibold text-text-primary">Manpower Settings</h1>
        <p className="mt-1 text-xs text-text-muted">
          Single source of truth for Main Profiles, Sub Profiles, Circles/CMPs and Validation Rules used across
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
          {activeTab === "main-profiles" && <MainProfilesTab manpower={manpower} />}
          {activeTab === "sub-profiles" && <SubProfilesTab manpower={manpower} />}
          {activeTab === "circles" && <CirclesTab manpower={manpower} />}
          {activeTab === "validation-rules" && <ValidationRulesTab manpower={manpower} />}
        </>
      )}
    </div>
  );
}

/* ------------------------------ Main Profiles ------------------------------ */

function MainProfilesTab({ manpower }) {
  const { config, refresh } = manpower;
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ roleKey: "", label: "", hasSignoffColumn: true, displayOrder: 0 });
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState({});

  const sorted = [...config.mainProfiles].sort((a, b) => a.displayOrder - b.displayOrder);

  const handleCreate = async () => {
    if (!draft.roleKey.trim() || !draft.label.trim()) {
      toast.error("Role key and label are required");
      return;
    }
    const ok = await runOrToast(
      () => createMainProfile({ ...draft, displayOrder: Number(draft.displayOrder) || sorted.length }),
      "Main Profile created"
    );
    if (ok) {
      setDraft({ roleKey: "", label: "", hasSignoffColumn: true, displayOrder: 0 });
      setAdding(false);
      refresh();
    }
  };

  const startEdit = (row) => {
    setEditingId(row.id);
    setEditDraft({ label: row.label, hasSignoffColumn: row.hasSignoffColumn, displayOrder: row.displayOrder });
  };

  const handleSaveEdit = async (id) => {
    const ok = await runOrToast(() => updateMainProfile(id, editDraft), "Main Profile updated");
    if (ok) {
      setEditingId(null);
      refresh();
    }
  };

  const handleToggleActive = async (row) => {
    const ok = row.isActive
      ? await runOrToast(() => deleteMainProfile(row.id), "Main Profile deactivated")
      : await runOrToast(() => updateMainProfile(row.id, { isActive: true }), "Main Profile reactivated");
    if (ok) refresh();
  };

  return (
    <div className={card}>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text-primary">Main Profiles</h2>
        <button className={primaryBtn} onClick={() => setAdding((v) => !v)}>
          <Plus size={14} /> Add Main Profile
        </button>
      </div>

      {adding && (
        <div className="mb-3 flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-border-color p-2">
          <Field label="Role Key (unique, e.g. quality_lead)">
            <input className={input} value={draft.roleKey} onChange={(e) => setDraft({ ...draft, roleKey: e.target.value })} />
          </Field>
          <Field label="Label">
            <input className={input} value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
          </Field>
          <Field label="Display Order">
            <input
              type="number"
              className={input}
              value={draft.displayOrder}
              onChange={(e) => setDraft({ ...draft, displayOrder: e.target.value })}
            />
          </Field>
          <label className="flex items-center gap-1 pb-1 text-xs text-text-secondary">
            <input
              type="checkbox"
              checked={draft.hasSignoffColumn}
              onChange={(e) => setDraft({ ...draft, hasSignoffColumn: e.target.checked })}
            />
            Backed by a Signoff column
          </label>
          <button className={primaryBtn} onClick={handleCreate}>
            <Save size={14} /> Save
          </button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={th}>Order</th>
              <th className={th}>Role Key</th>
              <th className={th}>Label</th>
              <th className={th}>Signoff column?</th>
              <th className={th}>Status</th>
              <th className={th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr key={row.id} className={row.isActive ? "" : "opacity-50"}>
                <td className={td}>{row.displayOrder}</td>
                <td className={td}>
                  <code className="text-xs">{row.roleKey}</code>
                </td>
                <td className={td}>
                  {editingId === row.id ? (
                    <input
                      className={input}
                      value={editDraft.label}
                      onChange={(e) => setEditDraft({ ...editDraft, label: e.target.value })}
                    />
                  ) : (
                    row.label
                  )}
                </td>
                <td className={td}>{row.hasSignoffColumn ? "Yes" : "No"}</td>
                <td className={td}>{row.isActive ? "Active" : "Inactive"}</td>
                <td className={td}>
                  <div className="flex gap-1">
                    {editingId === row.id ? (
                      <>
                        <button className={iconBtn} onClick={() => handleSaveEdit(row.id)} title="Save">
                          <Save size={14} />
                        </button>
                        <button className={iconBtn} onClick={() => setEditingId(null)} title="Cancel">
                          <X size={14} />
                        </button>
                      </>
                    ) : (
                      <button className={iconBtn} onClick={() => startEdit(row)} title="Edit">
                        <Pencil size={14} />
                      </button>
                    )}
                    <button
                      className={iconBtn}
                      onClick={() => handleToggleActive(row)}
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

/* ------------------------------ Sub Profiles ------------------------------ */

function SubProfilesTab({ manpower }) {
  const { config, refresh } = manpower;
  const [filterMainProfileId, setFilterMainProfileId] = useState("");
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ mainProfileId: "", designationLabel: "", matchType: "exact", sourceScope: "both" });

  const mainProfiles = [...config.mainProfiles].sort((a, b) => a.displayOrder - b.displayOrder);
  const rows = useMemo(
    () =>
      config.subProfiles.filter((sp) =>
        filterMainProfileId ? String(sp.mainProfileId) === String(filterMainProfileId) : true
      ),
    [config.subProfiles, filterMainProfileId]
  );

  const handleCreate = async () => {
    if (!draft.designationLabel.trim()) {
      toast.error("Designation label is required");
      return;
    }
    const ok = await runOrToast(
      () => createSubProfile({ ...draft, mainProfileId: draft.mainProfileId || null }),
      "Sub Profile created"
    );
    if (ok) {
      setDraft({ mainProfileId: "", designationLabel: "", matchType: "exact", sourceScope: "both" });
      setAdding(false);
      refresh();
    }
  };

  const handleToggleActive = async (row) => {
    const ok = row.isActive
      ? await runOrToast(() => deleteSubProfile(row.id), "Sub Profile deactivated")
      : await runOrToast(() => updateSubProfile(row.id, { isActive: true }), "Sub Profile reactivated");
    if (ok) refresh();
  };

  return (
    <div className={card}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-text-primary">Sub Profiles (Designation → Main Profile mapping)</h2>
        <div className="flex items-center gap-2">
          <select className={input} value={filterMainProfileId} onChange={(e) => setFilterMainProfileId(e.target.value)}>
            <option value="">All Main Profiles</option>
            {mainProfiles.map((mp) => (
              <option key={mp.id} value={mp.id}>
                {mp.label}
              </option>
            ))}
          </select>
          <button className={primaryBtn} onClick={() => setAdding((v) => !v)}>
            <Plus size={14} /> Add Sub Profile
          </button>
        </div>
      </div>

      {adding && (
        <div className="mb-3 flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-border-color p-2">
          <Field label="Main Profile (blank = unmapped)">
            <select
              className={input}
              value={draft.mainProfileId}
              onChange={(e) => setDraft({ ...draft, mainProfileId: e.target.value })}
            >
              <option value="">— Unmapped —</option>
              {mainProfiles.map((mp) => (
                <option key={mp.id} value={mp.id}>
                  {mp.label}
                </option>
              ))}
            </select>
          </Field>
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

      <div className="max-h-[520px] overflow-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={th}>Designation</th>
              <th className={th}>Main Profile</th>
              <th className={th}>Match</th>
              <th className={th}>Applies To</th>
              <th className={th}>Status</th>
              <th className={th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className={row.isActive ? "" : "opacity-50"}>
                <td className={td}>{row.designationLabel}</td>
                <td className={td}>{row.mainProfileRoleKey || <em className="text-text-muted">unmapped</em>}</td>
                <td className={td}>{row.matchType}</td>
                <td className={td}>{row.sourceScope}</td>
                <td className={td}>{row.isActive ? "Active" : "Inactive"}</td>
                <td className={td}>
                  <button
                    className={iconBtn}
                    onClick={() => handleToggleActive(row)}
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
    </div>
  );
}

/* -------------------------------- Circles -------------------------------- */

function CirclesTab({ manpower }) {
  const { config, refresh } = manpower;
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

  const handleToggleCircle = async (row) => {
    const ok = row.isActive
      ? await runOrToast(() => deleteCircle(row.id), "Circle deactivated")
      : await runOrToast(() => updateCircle(row.id, { isActive: true }), "Circle reactivated");
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

  const handleToggleCmp = async (row) => {
    const ok = row.isActive
      ? await runOrToast(() => deleteCmp(row.id), "CMP deactivated")
      : await runOrToast(() => updateCmp(row.id, { isActive: true }), "CMP reactivated");
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
              onClick={() => handleToggleCircle(circle)}
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
                {manpower.cmpsForCircle(circle.name).length === 0 &&
                  config.cmps
                    .filter((c) => c.circleId === circle.id)
                    .map((c) => (
                      <tr key={c.id} className="opacity-50">
                        <td className={td}>{c.name}</td>
                        <td className={td}>Inactive</td>
                        <td className={td}>
                          <button className={iconBtn} onClick={() => handleToggleCmp(c)} title="Reactivate">
                            <RotateCcw size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                {config.cmps
                  .filter((c) => c.circleId === circle.id && c.isActive)
                  .sort((a, b) => a.displayOrder - b.displayOrder)
                  .map((c) => (
                    <tr key={c.id}>
                      <td className={td}>{c.name}</td>
                      <td className={td}>Active</td>
                      <td className={td}>
                        <button className={iconBtn} onClick={() => handleToggleCmp(c)} title="Deactivate">
                          <Trash2 size={14} />
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

function ValidationRulesTab({ manpower }) {
  const { config, refresh } = manpower;
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

  const handleToggleActive = async (row) => {
    const ok = row.isActive
      ? await runOrToast(() => deleteValidationRule(row.id), "Rule deactivated")
      : await runOrToast(() => updateValidationRule(row.id, { isActive: true }), "Rule reactivated");
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
                      onClick={() => handleToggleActive(row)}
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
