import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import toast from "react-hot-toast";

import { createVendor } from "../../lib/expenseClaimsApi";

const INPUT =
  "h-10 w-full rounded-xl border border-border-color bg-surface px-3 text-sm text-text-primary outline-none focus:border-indigo-400";
const INPUT_ERR = "border-rose-400 bg-rose-50 dark:bg-rose-500/10";
const LABEL = "mb-1 block text-[11px] font-semibold uppercase tracking-[0.1em] text-text-muted";
const ERR = "mt-1 block text-[11px] font-medium text-rose-600 dark:text-rose-400";

/**
 * Small reusable "Add Vendor" modal. Collects only the essentials — Vendor
 * Name + Vendor Type — then creates the vendor via the existing API and hands
 * it back through onCreated(vendor) so the caller can auto-select it.
 * Extra vendor details (GSTIN, bank, …) are managed in Expense Settings.
 */
export default function AddVendorModal({ open, vendorTypes = [], defaultType = "", onClose, onCreated }) {
  const [form, setForm] = useState({ name: "", vendorType: defaultType || "" });
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);

  const errors = {
    name: form.name.trim() ? "" : "Vendor name is required.",
    vendorType: form.vendorType ? "" : "Select a vendor type.",
  };
  const isValid = !errors.name && !errors.vendorType;

  const close = () => {
    if (saving) return;
    setForm({ name: "", vendorType: defaultType || "" });
    setAttempted(false);
    onClose?.();
  };

  // Esc closes the modal (matches the app's other modals).
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, saving]);

  if (!open) return null;

  const save = async () => {
    setAttempted(true);
    if (!isValid || saving) return;
    setSaving(true);
    try {
      const res = await createVendor({
        name: form.name.trim(),
        vendorType: form.vendorType,
      });
      toast.success("Vendor added successfully.");
      onCreated?.(res.data);
      setForm({ name: "", vendorType: defaultType || "" });
      setAttempted(false);
      onClose?.();
    } catch (error) {
      toast.error(error.message || "Failed to add the vendor.");
    } finally {
      setSaving(false);
    }
  };

  const showErr = attempted;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center px-4">
      <button
        type="button"
        aria-label="Close"
        disabled={saving}
        onClick={close}
        className="absolute inset-0 h-full w-full cursor-default bg-overlay/45 backdrop-blur-sm"
      />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-[440px] flex-col overflow-hidden rounded-[20px] border border-border-color/80 bg-surface shadow-[0_30px_90px_rgba(15,23,42,0.2)]">
        <div className="overflow-y-auto px-6 pt-6">
          <h2 className="text-lg font-semibold text-text-primary">Add Vendor</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Add a new vendor and select it automatically for this expense.
          </p>
          <div className="mt-4 space-y-3">
            <label className="block">
              <span className={LABEL}>
                Vendor Name <span className="text-rose-500">*</span>
              </span>
              <input
                className={`${INPUT} ${showErr && errors.name ? INPUT_ERR : ""}`}
                autoFocus
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") save();
                }}
                placeholder="e.g. Reliance"
              />
              {showErr && errors.name ? <span className={ERR}>{errors.name}</span> : null}
            </label>
            <label className="block">
              <span className={LABEL}>
                Vendor Type <span className="text-rose-500">*</span>
              </span>
              <select
                className={`${INPUT} ${showErr && errors.vendorType ? INPUT_ERR : ""}`}
                value={form.vendorType}
                onChange={(e) => setForm((f) => ({ ...f, vendorType: e.target.value }))}
              >
                <option value="">Select vendor type...</option>
                {vendorTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              {showErr && errors.vendorType ? <span className={ERR}>{errors.vendorType}</span> : null}
            </label>
          </div>
        </div>
        <div className="mt-5 flex flex-col-reverse gap-2 border-t border-border-color/70 bg-surface-muted/40 px-6 py-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={close}
            disabled={saving}
            className="inline-flex h-10 items-center justify-center rounded-full border border-border-color bg-surface px-5 text-sm font-medium text-text-secondary transition hover:bg-surface-muted disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || (attempted && !isValid)}
            className="inline-flex h-10 min-w-[140px] items-center justify-center gap-2 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 px-5 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 disabled:opacity-50"
          >
            {saving ? <Loader2 className="animate-spin" size={15} /> : null}
            Add Vendor
          </button>
        </div>
      </div>
    </div>
  );
}
