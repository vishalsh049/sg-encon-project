import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";

import { CARD_SHELL } from "../../components/billingDashboard/theme";
import { formatCurrency } from "../../utils/penaltyFormat";
import { admin, createVendor, fetchAdminConfig } from "../../lib/expenseClaimsApi";

const TABS = [
  { key: "matrix", label: "Approval Matrix" },
  { key: "categories", label: "Expense Categories" },
  { key: "vendors", label: "Vendors" },
  { key: "vendorTypes", label: "Vendor Types" },
  { key: "employeeTypes", label: "Employee Types" },
  { key: "pos", label: "PO Master" },
];
const INPUT =
  "w-full rounded-lg border border-border-color bg-surface px-2.5 py-1.5 text-sm text-text-primary outline-none focus:border-indigo-400";
const TH = "px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted";
const TD = "px-3 py-2 text-sm text-text-secondary";

export default function ExpenseClaimsAdmin() {
  const [tab, setTab] = useState("matrix");
  const [cfg, setCfg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchAdminConfig();
      setCfg(res.data);
    } catch (error) {
      toast.error(error.message || "Failed to load configuration.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const run = async (fn, okMsg) => {
    setBusy(true);
    try {
      await fn();
      if (okMsg) toast.success(okMsg);
      await load();
    } catch (error) {
      toast.error(error.message || "Action failed.");
    } finally {
      setBusy(false);
    }
  };

  if (loading || !cfg) {
    return (
      <div className="flex items-center justify-center py-24 text-text-muted">
        <Loader2 className="animate-spin" size={22} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-text-primary sm:text-xl">
            Expense Settings
          </h1>
          <p className="mt-0.5 text-sm text-text-secondary">
            Configure the approval chain, approval matrix, expense categories, vendors, vendor / employee types and the PO master. No code change needed.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="inline-flex h-9 items-center gap-2 rounded-full border border-border-color bg-surface px-4 text-sm font-medium text-text-secondary transition hover:bg-surface-muted"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      <ApprovalChainCard users={cfg.users} reloadConfig={load} busy={busy} />

      <div className="flex flex-wrap gap-1 rounded-xl border border-border-color bg-surface p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
              tab === t.key
                ? "bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-sm"
                : "text-text-secondary hover:bg-surface-muted"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "matrix" ? <MatrixTab cfg={cfg} run={run} busy={busy} /> : null}
      {tab === "categories" ? <CategoriesTab cfg={cfg} run={run} busy={busy} /> : null}
      {tab === "vendors" ? <VendorsTab cfg={cfg} run={run} busy={busy} /> : null}
      {tab === "vendorTypes" ? (
        <NameMasterTab rows={cfg.vendorTypes} run={run} busy={busy} label="Vendor Type" api={admin.addVendorType} apiUpd={admin.updateVendorType} apiDel={admin.deleteVendorType} />
      ) : null}
      {tab === "employeeTypes" ? (
        <NameMasterTab rows={cfg.employeeTypes} run={run} busy={busy} label="Employee Type" api={admin.addEmployeeType} apiUpd={admin.updateEmployeeType} apiDel={admin.deleteEmployeeType} />
      ) : null}
      {tab === "pos" ? <POsTab cfg={cfg} run={run} busy={busy} /> : null}
    </div>
  );
}

/* ---------------- Generic name master (vendor / employee types) ---------------- */
function NameMasterTab({ rows = [], run, busy, label, api, apiUpd, apiDel }) {
  const [name, setName] = useState("");
  return (
    <Table
      head={
        <>
          <th className={TH}>{label}</th>
          <th className={TH}>Active</th>
          <th className={TH}></th>
        </>
      }
    >
      {rows.map((r) => (
        <tr key={r.id}>
          <td className={TD}>{r.name}</td>
          <td className={TD}>
            <input type="checkbox" checked={r.isActive} onChange={() => run(() => apiUpd(r.id, { isActive: !r.isActive }), "Updated.")} />
          </td>
          <td className={TD}>
            <button type="button" disabled={busy} onClick={() => run(() => apiDel(r.id), "Removed.")} className="text-text-muted hover:text-rose-600">
              <Trash2 size={14} />
            </button>
          </td>
        </tr>
      ))}
      <tr className="bg-surface-muted/40">
        <td className={TD}>
          <input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} placeholder={`New ${label}`} />
        </td>
        <td className={TD} />
        <td className={TD}>
          <button
            type="button"
            disabled={busy || !name.trim()}
            onClick={() => run(() => api({ name: name.trim() }), `${label} added.`).then(() => setName(""))}
            className="inline-flex items-center gap-1 rounded-lg bg-indigo-500 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50"
          >
            <Plus size={12} /> Add
          </button>
        </td>
      </tr>
    </Table>
  );
}

/* ---------------- Expense Categories ---------------- */
function CategoriesTab({ cfg, run, busy }) {
  const [name, setName] = useState("");
  const rows = cfg.categories || [];
  return (
    <div className="space-y-2">
      <p className="text-xs text-text-muted">
        These are the <strong>Expense Category</strong> options on every expense item in Raise Expense.
        O&amp;M, OOS and Project drive the PO / Domain / WCC rules and cannot be removed; add or remove
        any others (e.g. Travel, Food, Hotel) as needed.
      </p>
      <Table
        head={
          <>
            <th className={TH}>Category</th>
            <th className={TH}>Active</th>
            <th className={TH}></th>
          </>
        }
      >
        {rows.map((c) => {
          const locked = ["O&M", "OOS", "Project"].includes(c.name);
          return (
            <tr key={c.id}>
              <td className={TD}>
                {c.name}
                {locked ? <span className="ml-2 text-[10px] uppercase tracking-wide text-text-muted">core</span> : null}
              </td>
              <td className={TD}>
                <input
                  type="checkbox"
                  checked={c.isActive}
                  disabled={locked}
                  onChange={() => run(() => admin.updateCategory(c.id, { isActive: !c.isActive }), "Updated.")}
                />
              </td>
              <td className={TD}>
                {locked ? (
                  <span className="text-text-muted">—</span>
                ) : (
                  <button type="button" disabled={busy} onClick={() => run(() => admin.deleteCategory(c.id), "Removed.")} className="text-text-muted hover:text-rose-600">
                    <Trash2 size={14} />
                  </button>
                )}
              </td>
            </tr>
          );
        })}
        <tr className="bg-surface-muted/40">
          <td className={TD}>
            <input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} placeholder="New category (e.g. Travel, Food, Hotel)" />
          </td>
          <td className={TD} />
          <td className={TD}>
            <button
              type="button"
              disabled={busy || !name.trim()}
              onClick={() => run(() => admin.addCategory({ name: name.trim() }), "Category added.").then(() => setName(""))}
              className="inline-flex items-center gap-1 rounded-lg bg-indigo-500 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50"
            >
              <Plus size={12} /> Add
            </button>
          </td>
        </tr>
      </Table>
    </div>
  );
}

/* ---------------- Vendors ---------------- */
function VendorsTab({ cfg, run, busy }) {
  const empty = { name: "", vendorType: "", gstin: "", phone: "", bankAccount: "", ifsc: "" };
  const [form, setForm] = useState(empty);
  const types = (cfg.vendorTypes || []).filter((t) => t.isActive).map((t) => t.name);
  return (
    <Table
      head={
        <>
          <th className={TH}>Vendor</th>
          <th className={TH}>Type</th>
          <th className={TH}>GSTIN</th>
          <th className={TH}>Bank A/C</th>
          <th className={TH}>IFSC</th>
          <th className={TH}>Active</th>
          <th className={TH}></th>
        </>
      }
    >
      {(cfg.vendors || []).map((v) => (
        <tr key={v.id}>
          <td className={TD}>{v.name}</td>
          <td className={TD}>{v.vendorType || "—"}</td>
          <td className={TD}>{v.gstin || "—"}</td>
          <td className={TD}>{v.bankAccount || "—"}</td>
          <td className={TD}>{v.ifsc || "—"}</td>
          <td className={TD}>
            <input type="checkbox" checked={v.isActive} onChange={() => run(() => admin.updateVendor(v.id, { isActive: !v.isActive }), "Updated.")} />
          </td>
          <td className={TD}>
            <button type="button" disabled={busy} onClick={() => run(() => admin.deleteVendor(v.id), "Removed.")} className="text-text-muted hover:text-rose-600">
              <Trash2 size={14} />
            </button>
          </td>
        </tr>
      ))}
      <tr className="bg-surface-muted/40">
        <td className={TD}><input className={INPUT} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="New vendor name" /></td>
        <td className={TD}>
          <select className={INPUT} value={form.vendorType} onChange={(e) => setForm({ ...form, vendorType: e.target.value })}>
            <option value="">Type…</option>
            {types.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </td>
        <td className={TD}><input className={INPUT} value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })} placeholder="GSTIN" /></td>
        <td className={TD}><input className={INPUT} value={form.bankAccount} onChange={(e) => setForm({ ...form, bankAccount: e.target.value.replace(/[^0-9]/g, "") })} placeholder="Account no." /></td>
        <td className={TD}><input className={INPUT} value={form.ifsc} onChange={(e) => setForm({ ...form, ifsc: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 11) })} placeholder="IFSC" /></td>
        <td className={TD} />
        <td className={TD}>
          <button
            type="button"
            disabled={busy || !form.name.trim()}
            onClick={() => run(() => createVendor({ name: form.name.trim(), vendorType: form.vendorType || null, gstin: form.gstin.trim() || null, phone: form.phone.trim() || null, bankAccount: form.bankAccount.trim() || null, ifsc: form.ifsc.trim() || null }), "Vendor added.").then(() => setForm(empty))}
            className="inline-flex items-center gap-1 rounded-lg bg-indigo-500 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50"
          >
            <Plus size={12} /> Add
          </button>
        </td>
      </tr>
    </Table>
  );
}

/* ---------------- PO Master ---------------- */
function POsTab({ cfg, run, busy }) {
  const empty = { poNumber: "", workCategory: "", domain: "", clientName: "", siteRoute: "", estimateWccAmount: "" };
  const [form, setForm] = useState(empty);
  return (
    <Table
      head={
        <>
          <th className={TH}>PO No.</th>
          <th className={TH}>Category</th>
          <th className={TH}>Domain</th>
          <th className={TH}>Client</th>
          <th className={TH}>Est. WCC</th>
          <th className={TH}>Active</th>
          <th className={TH}></th>
        </>
      }
    >
      {(cfg.pos || []).map((p) => (
        <tr key={p.id}>
          <td className={TD}>{p.poNumber}</td>
          <td className={TD}>{p.workCategory || "—"}</td>
          <td className={TD}>{p.domain || "—"}</td>
          <td className={TD}>{p.clientName || "—"}</td>
          <td className={TD}>{p.estimateWccAmount != null ? formatCurrency(p.estimateWccAmount) : "—"}</td>
          <td className={TD}>
            <input type="checkbox" checked={p.isActive} onChange={() => run(() => admin.updatePO(p.id, { isActive: !p.isActive }), "Updated.")} />
          </td>
          <td className={TD}>
            <button type="button" disabled={busy} onClick={() => run(() => admin.deletePO(p.id), "Removed.")} className="text-text-muted hover:text-rose-600">
              <Trash2 size={14} />
            </button>
          </td>
        </tr>
      ))}
      <tr className="bg-surface-muted/40">
        <td className={TD}><input className={INPUT} value={form.poNumber} onChange={(e) => setForm({ ...form, poNumber: e.target.value })} placeholder="PO number" /></td>
        <td className={TD}>
          <select className={INPUT} value={form.workCategory} onChange={(e) => setForm({ ...form, workCategory: e.target.value })}>
            <option value="">Any</option>
            {["O&M", "OOS", "Project"].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </td>
        <td className={TD}>
          <select className={INPUT} value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })}>
            <option value="">—</option>
            {["Fiber", "FTTx", "Utility", "Others"].map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </td>
        <td className={TD}><input className={INPUT} value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} placeholder="Client" /></td>
        <td className={TD}><input className={INPUT} type="number" value={form.estimateWccAmount} onChange={(e) => setForm({ ...form, estimateWccAmount: e.target.value })} placeholder="0.00" /></td>
        <td className={TD} />
        <td className={TD}>
          <button
            type="button"
            disabled={busy || !form.poNumber.trim()}
            onClick={() => run(() => admin.addPO({
              poNumber: form.poNumber.trim(),
              workCategory: form.workCategory || null,
              domain: form.domain || null,
              clientName: form.clientName.trim() || null,
              siteRoute: form.siteRoute.trim() || null,
              estimateWccAmount: form.estimateWccAmount === "" ? null : Number(form.estimateWccAmount),
            }), "PO added.").then(() => setForm(empty))}
            className="inline-flex items-center gap-1 rounded-lg bg-indigo-500 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50"
          >
            <Plus size={12} /> Add
          </button>
        </td>
      </tr>
    </Table>
  );
}

/* ---------------- Default Approval Chain (simple settings) ---------------- */
function ApprovalChainCard({ users = [], reloadConfig, busy }) {
  const [chain, setChain] = useState(null); // { l1UserId, l2UserId, finalUserId, l1Name, ... , configured }
  const [form, setForm] = useState({ l1UserId: "", l2UserId: "", finalUserId: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await admin.getApprovalChain();
      setChain(res.data);
      setForm({
        l1UserId: res.data.l1UserId ? String(res.data.l1UserId) : "",
        l2UserId: res.data.l2UserId ? String(res.data.l2UserId) : "",
        finalUserId: res.data.finalUserId ? String(res.data.finalUserId) : "",
      });
    } catch (error) {
      toast.error(error.message || "Failed to load the approval chain.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const labelOf = (id) => {
    if (!id) return null;
    const u = users.find((x) => String(x.id) === String(id));
    if (!u) return `User #${id}`;
    return u.designation ? `${u.name} · ${u.designation}` : u.name;
  };

  const save = async () => {
    if (!form.l1UserId) return toast.error("Pick an L1 approver — it is required.");
    if (!form.l2UserId) return toast.error("Pick an L2 approver — it is required.");
    if (form.l2UserId === form.l1UserId) return toast.error("L2 approver must be different from L1.");
    if (form.finalUserId && (form.finalUserId === form.l1UserId || form.finalUserId === form.l2UserId)) {
      return toast.error("Final approver must be different from L1 and L2.");
    }
    setSaving(true);
    try {
      const res = await admin.saveApprovalChain({
        l1UserId: Number(form.l1UserId),
        l2UserId: Number(form.l2UserId),
        finalUserId: form.finalUserId ? Number(form.finalUserId) : null,
      });
      const n = res?.data?.rerouted || 0;
      toast.success(
        n
          ? `Approval chain saved. ${n} in-flight claim${n === 1 ? "" : "s"} re-routed onto the new approvers.`
          : "Approval chain saved."
      );
      await load();
      reloadConfig?.();
    } catch (error) {
      toast.error(error.message || "Failed to save the approval chain.");
    } finally {
      setSaving(false);
    }
  };

  const selected = [labelOf(form.l1UserId), labelOf(form.l2UserId), labelOf(form.finalUserId)].filter(Boolean);
  const disabled = busy || saving;

  return (
    <div className={`${CARD_SHELL} p-4`}>
      <h2 className="text-sm font-semibold text-text-primary">Default Approval Chain</h2>
      <p className="mt-0.5 text-xs text-text-muted">
        Every submitted claim is routed to these people, in order. L1 and L2 are required; Final is optional —
        leave it blank to skip that level. (Category / amount-specific overrides can be added in the Approval Matrix tab below.)
      </p>

      {loading ? (
        <div className="mt-3 flex items-center gap-2 text-sm text-text-muted">
          <Loader2 className="animate-spin" size={14} /> Loading…
        </div>
      ) : (
        <>
          {users.length === 0 ? (
            <p className="mt-3 text-xs font-medium text-rose-600 dark:text-rose-400">
              No active users are available to choose as approvers.
            </p>
          ) : null}

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <ChainSelect label="L1 approver (required)" value={form.l1UserId} onChange={(v) => setForm((f) => ({ ...f, l1UserId: v }))} users={users} />
            <ChainSelect label="L2 approver (required)" value={form.l2UserId} onChange={(v) => setForm((f) => ({ ...f, l2UserId: v }))} users={users} />
            <ChainSelect label="Final approver (optional)" value={form.finalUserId} onChange={(v) => setForm((f) => ({ ...f, finalUserId: v }))} users={users} />
          </div>

          <div className="mt-3 rounded-lg border border-border-color bg-surface-muted/40 px-3 py-2 text-xs">
            {selected.length ? (
              <span className="text-text-secondary">
                Selected:{" "}
                {selected.map((p, i) => (
                  <span key={i}>
                    {i > 0 ? " → " : ""}
                    <strong className="text-text-primary">{p}</strong>
                  </span>
                ))}{" "}
                → Finance
              </span>
            ) : (
              <span className="text-text-muted">No approver selected yet — pick an L1 and an L2 approver.</span>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            {chain?.configured ? (
              <span className="text-xs text-emerald-600 dark:text-emerald-400">
                ✓ Active chain: <strong>{chain.l1Name || `User #${chain.l1UserId}`}</strong>
                {chain.l2UserId ? <> → <strong>{chain.l2Name || `User #${chain.l2UserId}`}</strong></> : null}
                {chain.finalUserId ? <> → <strong>{chain.finalName || `User #${chain.finalUserId}`}</strong></> : null} → Finance
              </span>
            ) : (
              <span className="text-xs font-medium text-rose-600 dark:text-rose-400">
                ⚠ Chain incomplete — employees cannot submit claims until you save an L1 and an L2 approver.
              </span>
            )}
            <button
              type="button"
              onClick={save}
              disabled={disabled || !form.l1UserId || !form.l2UserId}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 px-5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving ? <Loader2 className="animate-spin" size={14} /> : null}
              Save Approval Chain
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function ChainSelect({ label, value, onChange, users }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.1em] text-text-muted">{label}</span>
      <select className={INPUT} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">— none —</option>
        {users.map((u) => (
          <option key={u.id} value={String(u.id)}>
            {u.name}
            {u.designation ? ` · ${u.designation}` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

function Table({ head, children }) {
  return (
    <div className={`${CARD_SHELL} overflow-hidden`}>
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead className="bg-surface-muted">
            <tr>{head}</tr>
          </thead>
          <tbody className="divide-y divide-border-color">{children}</tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------- Approval Matrix ---------------- */
function MatrixTab({ cfg, run, busy }) {
  const empty = { category: "ALL", minAmount: "0", maxAmount: "", l1UserId: "", l2UserId: "", finalUserId: "" };
  const [form, setForm] = useState(empty);
  const userOpts = cfg.users;

  return (
    <div className="space-y-2">
      <p className="text-xs text-text-muted">
        The first matching rule wins — a specific category beats <code>ALL</code>, then the highest matching
        minimum amount. Every submitted claim must match at least one rule with an L1 and an L2 approver (Final optional).
      </p>
      <Table
        head={
          <>
            <th className={TH}>Category</th>
            <th className={TH}>Amount Range</th>
            <th className={TH}>L1</th>
            <th className={TH}>L2</th>
            <th className={TH}>Final</th>
            <th className={TH}>Active</th>
            <th className={TH}></th>
          </>
        }
      >
        {cfg.matrix.map((m) => (
          <tr key={m.id}>
            <td className={TD}>{m.category}</td>
            <td className={TD}>
              {formatCurrency(m.minAmount)} – {m.maxAmount == null ? "∞" : formatCurrency(m.maxAmount)}
            </td>
            <td className={TD}>{m.l1Name || "—"}</td>
            <td className={TD}>{m.l2Name || "—"}</td>
            <td className={TD}>{m.finalName || "—"}</td>
            <td className={TD}>
              <input
                type="checkbox"
                checked={m.isActive}
                onChange={() => run(() => admin.updateMatrix(m.id, {
                  category: m.category, minAmount: m.minAmount, maxAmount: m.maxAmount,
                  l1UserId: m.l1UserId, l2UserId: m.l2UserId, finalUserId: m.finalUserId, isActive: !m.isActive,
                }), "Updated.")}
              />
            </td>
            <td className={TD}>
              <button type="button" disabled={busy} onClick={() => run(() => admin.deleteMatrix(m.id), "Deleted.")} className="text-text-muted hover:text-rose-600">
                <Trash2 size={14} />
              </button>
            </td>
          </tr>
        ))}
        <tr className="bg-surface-muted/40">
          <td className={TD}><input className={INPUT} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="ALL or category" /></td>
          <td className={TD}>
            <div className="flex gap-1">
              <input className={INPUT} type="number" value={form.minAmount} onChange={(e) => setForm({ ...form, minAmount: e.target.value })} placeholder="min" />
              <input className={INPUT} type="number" value={form.maxAmount} onChange={(e) => setForm({ ...form, maxAmount: e.target.value })} placeholder="max (blank = ∞)" />
            </div>
          </td>
          <td className={TD}><UserSelect value={form.l1UserId} onChange={(v) => setForm({ ...form, l1UserId: v })} options={userOpts} /></td>
          <td className={TD}><UserSelect value={form.l2UserId} onChange={(v) => setForm({ ...form, l2UserId: v })} options={userOpts} /></td>
          <td className={TD}><UserSelect value={form.finalUserId} onChange={(v) => setForm({ ...form, finalUserId: v })} options={userOpts} /></td>
          <td className={TD}></td>
          <td className={TD}>
            <button
              type="button"
              disabled={busy || !form.l1UserId || !form.l2UserId}
              onClick={() => run(() => admin.addMatrix({
                category: form.category || "ALL",
                minAmount: Number(form.minAmount) || 0,
                maxAmount: form.maxAmount === "" ? null : Number(form.maxAmount),
                l1UserId: Number(form.l1UserId),
                l2UserId: Number(form.l2UserId),
                finalUserId: form.finalUserId ? Number(form.finalUserId) : null,
              }), "Rule added.").then(() => setForm(empty))}
              className="inline-flex items-center gap-1 rounded-lg bg-indigo-500 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50"
            >
              <Plus size={12} /> Add
            </button>
          </td>
        </tr>
      </Table>
    </div>
  );
}

function UserSelect({ value, onChange, options }) {
  return (
    <select className={INPUT} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">—</option>
      {options.map((u) => (
        <option key={u.id} value={u.id}>{u.name}{u.designation ? ` · ${u.designation}` : ""}</option>
      ))}
    </select>
  );
}

