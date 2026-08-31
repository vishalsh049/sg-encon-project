import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";

import { CARD_SHELL } from "../../components/billingDashboard/theme";
import { formatCurrency } from "../../utils/penaltyFormat";
import { admin, fetchAdminConfig } from "../../lib/expenseClaimsApi";

const TABS = [
  { key: "matrix", label: "Approval Matrix" },
  { key: "categories", label: "Categories" },
  { key: "subCategories", label: "Sub Categories" },
  { key: "policies", label: "Policies" },
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
            Expense Claims — Master Data
          </h1>
          <p className="mt-0.5 text-sm text-text-secondary">
            Configure the approval chain, categories, sub-categories and policy limits. No code change needed.
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

      <ApprovalChainCard users={cfg.users} run={run} busy={busy} />

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
      {tab === "subCategories" ? <SubCategoriesTab cfg={cfg} run={run} busy={busy} /> : null}
      {tab === "policies" ? <PoliciesTab cfg={cfg} run={run} busy={busy} /> : null}
    </div>
  );
}

/* ---------------- Default Approval Chain (simple settings) ---------------- */
function ApprovalChainCard({ users, run, busy }) {
  const [chain, setChain] = useState(null); // { l1UserId, l2UserId, finalUserId, l1Name, ... , configured }
  const [form, setForm] = useState({ l1UserId: "", l2UserId: "", finalUserId: "" });
  const [loading, setLoading] = useState(true);

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

  const save = () =>
    run(
      () =>
        admin.saveApprovalChain({
          l1UserId: form.l1UserId ? Number(form.l1UserId) : null,
          l2UserId: form.l2UserId ? Number(form.l2UserId) : null,
          finalUserId: form.finalUserId ? Number(form.finalUserId) : null,
        }),
      "Approval chain saved."
    ).then(load);

  const dirty =
    chain &&
    (String(chain.l1UserId || "") !== form.l1UserId ||
      String(chain.l2UserId || "") !== form.l2UserId ||
      String(chain.finalUserId || "") !== form.finalUserId);

  return (
    <div className={`${CARD_SHELL} p-4`}>
      <h2 className="text-sm font-semibold text-text-primary">Default Approval Chain</h2>
      <p className="mt-0.5 text-xs text-text-muted">
        Every submitted claim is routed to these people, in order. L2 and Final are optional — leave them
        blank to skip that level. (Category / amount-specific overrides can be added in the Approval Matrix tab below.)
      </p>

      {loading ? (
        <div className="mt-3 flex items-center gap-2 text-sm text-text-muted">
          <Loader2 className="animate-spin" size={14} /> Loading…
        </div>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <ChainSelect label="L1 approver (required)" value={form.l1UserId} onChange={(v) => setForm((f) => ({ ...f, l1UserId: v }))} users={users} />
            <ChainSelect label="L2 approver (optional)" value={form.l2UserId} onChange={(v) => setForm((f) => ({ ...f, l2UserId: v }))} users={users} />
            <ChainSelect label="Final approver (optional)" value={form.finalUserId} onChange={(v) => setForm((f) => ({ ...f, finalUserId: v }))} users={users} />
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            {chain?.configured ? (
              <span className="text-xs text-text-secondary">
                Current: <strong>{chain.l1Name || "—"}</strong>
                {chain.l2Name ? <> → <strong>{chain.l2Name}</strong></> : null}
                {chain.finalName ? <> → <strong>{chain.finalName}</strong></> : null} → Finance
              </span>
            ) : (
              <span className="text-xs font-medium text-rose-600 dark:text-rose-400">
                ⚠ No approvers set — employees cannot submit claims until you save an L1 approver.
              </span>
            )}
            <button
              type="button"
              onClick={save}
              disabled={busy || !form.l1UserId || !dirty}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 px-5 text-sm font-semibold text-white disabled:opacity-50"
            >
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
          <option key={u.id} value={u.id}>
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
        minimum amount. Every submitted claim must match at least one rule with an L1 approver.
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
              disabled={busy || !form.l1UserId}
              onClick={() => run(() => admin.addMatrix({
                category: form.category || "ALL",
                minAmount: Number(form.minAmount) || 0,
                maxAmount: form.maxAmount === "" ? null : Number(form.maxAmount),
                l1UserId: Number(form.l1UserId),
                l2UserId: form.l2UserId ? Number(form.l2UserId) : null,
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

/* ---------------- Categories ---------------- */
function CategoriesTab({ cfg, run, busy }) {
  const [name, setName] = useState("");
  const [requiresBill, setRequiresBill] = useState(false);
  return (
    <Table
      head={
        <>
          <th className={TH}>Category</th>
          <th className={TH}>Bill Required</th>
          <th className={TH}>Active</th>
        </>
      }
    >
      {cfg.categories.map((cat) => (
        <tr key={cat.id}>
          <td className={TD}>{cat.name}</td>
          <td className={TD}>
            <input type="checkbox" checked={cat.requiresBill} onChange={() => run(() => admin.updateCategory(cat.id, { requiresBill: !cat.requiresBill }), "Updated.")} />
          </td>
          <td className={TD}>
            <input type="checkbox" checked={cat.isActive} onChange={() => run(() => admin.updateCategory(cat.id, { isActive: !cat.isActive }), "Updated.")} />
          </td>
        </tr>
      ))}
      <tr className="bg-surface-muted/40">
        <td className={TD}><input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} placeholder="New category name" /></td>
        <td className={TD}><input type="checkbox" checked={requiresBill} onChange={(e) => setRequiresBill(e.target.checked)} /></td>
        <td className={TD}>
          <button type="button" disabled={busy || !name.trim()} onClick={() => run(() => admin.addCategory({ name: name.trim(), requiresBill }), "Category added.").then(() => { setName(""); setRequiresBill(false); })} className="inline-flex items-center gap-1 rounded-lg bg-indigo-500 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50">
            <Plus size={12} /> Add
          </button>
        </td>
      </tr>
    </Table>
  );
}

/* ---------------- Sub Categories ---------------- */
function SubCategoriesTab({ cfg, run, busy }) {
  const [categoryId, setCategoryId] = useState("");
  const [name, setName] = useState("");
  return (
    <Table
      head={
        <>
          <th className={TH}>Category</th>
          <th className={TH}>Sub Category</th>
          <th className={TH}></th>
        </>
      }
    >
      {cfg.subCategories.map((s) => (
        <tr key={s.id}>
          <td className={TD}>{s.category}</td>
          <td className={TD}>{s.name}</td>
          <td className={TD}>
            <button type="button" disabled={busy} onClick={() => run(() => admin.deleteSubCategory(s.id), "Deleted.")} className="text-text-muted hover:text-rose-600">
              <Trash2 size={14} />
            </button>
          </td>
        </tr>
      ))}
      <tr className="bg-surface-muted/40">
        <td className={TD}>
          <select className={INPUT} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Choose category…</option>
            {cfg.categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
          </select>
        </td>
        <td className={TD}><input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} placeholder="New sub-category" /></td>
        <td className={TD}>
          <button type="button" disabled={busy || !categoryId || !name.trim()} onClick={() => run(() => admin.addSubCategory({ categoryId: Number(categoryId), name: name.trim() }), "Added.").then(() => setName(""))} className="inline-flex items-center gap-1 rounded-lg bg-indigo-500 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50">
            <Plus size={12} /> Add
          </button>
        </td>
      </tr>
    </Table>
  );
}

/* ---------------- Policies ---------------- */
function PoliciesTab({ cfg, run, busy }) {
  const empty = { category: "", subCategory: "", period: "day", maxAmount: "", hardLimit: false };
  const [form, setForm] = useState(empty);
  return (
    <div className="space-y-2">
      <p className="text-xs text-text-muted">
        A <strong>hard</strong> limit blocks submission. A soft limit lets the claim through but flags the item
        as a policy exception, and the approver must give a reason to approve it.
      </p>
      <Table
        head={
          <>
            <th className={TH}>Category</th>
            <th className={TH}>Sub Category</th>
            <th className={TH}>Period</th>
            <th className={TH}>Max Amount</th>
            <th className={TH}>Hard</th>
            <th className={TH}>Active</th>
            <th className={TH}></th>
          </>
        }
      >
        {cfg.policies.map((p) => (
          <tr key={p.id}>
            <td className={TD}>{p.category}</td>
            <td className={TD}>{p.subCategory || "—"}</td>
            <td className={TD}>{p.period === "day" ? "Per day" : "Per entry"}</td>
            <td className={TD}>{formatCurrency(p.maxAmount)}</td>
            <td className={TD}>
              <input type="checkbox" checked={p.hardLimit} onChange={() => run(() => admin.updatePolicy(p.id, { hardLimit: !p.hardLimit }), "Updated.")} />
            </td>
            <td className={TD}>
              <input type="checkbox" checked={p.isActive} onChange={() => run(() => admin.updatePolicy(p.id, { isActive: !p.isActive }), "Updated.")} />
            </td>
            <td className={TD}>
              <button type="button" disabled={busy} onClick={() => run(() => admin.deletePolicy(p.id), "Deleted.")} className="text-text-muted hover:text-rose-600">
                <Trash2 size={14} />
              </button>
            </td>
          </tr>
        ))}
        <tr className="bg-surface-muted/40">
          <td className={TD}>
            <select className={INPUT} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              <option value="">Category…</option>
              {cfg.categories.map((cat) => <option key={cat.id} value={cat.name}>{cat.name}</option>)}
            </select>
          </td>
          <td className={TD}><input className={INPUT} value={form.subCategory} onChange={(e) => setForm({ ...form, subCategory: e.target.value })} placeholder="(optional)" /></td>
          <td className={TD}>
            <select className={INPUT} value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })}>
              <option value="day">Per day</option>
              <option value="claim">Per entry</option>
            </select>
          </td>
          <td className={TD}><input className={INPUT} type="number" value={form.maxAmount} onChange={(e) => setForm({ ...form, maxAmount: e.target.value })} placeholder="0.00" /></td>
          <td className={TD}><input type="checkbox" checked={form.hardLimit} onChange={(e) => setForm({ ...form, hardLimit: e.target.checked })} /></td>
          <td className={TD}></td>
          <td className={TD}>
            <button
              type="button"
              disabled={busy || !form.category || !(Number(form.maxAmount) > 0)}
              onClick={() => run(() => admin.addPolicy({
                category: form.category, subCategory: form.subCategory.trim() || null,
                period: form.period, maxAmount: Number(form.maxAmount), hardLimit: form.hardLimit,
              }), "Policy added.").then(() => setForm(empty))}
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
