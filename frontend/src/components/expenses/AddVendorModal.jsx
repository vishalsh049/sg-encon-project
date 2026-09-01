import { useState } from "react";
import { Loader2 } from "lucide-react";
import toast from "react-hot-toast";

import { createVendor } from "../../lib/expenseClaimsApi";

const INPUT =
  "h-10 w-full rounded-xl border border-border-color bg-surface px-3 text-sm text-text-primary outline-none focus:border-indigo-400";
const LABEL = "mb-1 block text-[11px] font-semibold uppercase tracking-[0.1em] text-text-muted";

/**
 * Small reusable "Add Vendor" modal. On save it creates the vendor and returns
 * it via onCreated(vendor) so the caller can auto-select it — no re-search.
 */
export default function AddVendorModal({ open, vendorTypes = [], defaultType = "", onClose, onCreated }) {
  const [form, setForm] = useState({
    name: "",
    vendorType: defaultType || "",
    gstin: "",
    phone: "",
    email: "",
    bankAccount: "",
    ifsc: "",
  });
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const save = async () => {
    if (!form.name.trim()) {
      toast.error("Enter the vendor name.");
      return;
    }
    setSaving(true);
    try {
      const res = await createVendor({
        name: form.name.trim(),
        vendorType: form.vendorType || null,
        gstin: form.gstin.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        bankAccount: form.bankAccount.trim() || null,
        ifsc: form.ifsc.trim().toUpperCase() || null,
      });
      toast.success("Vendor added.");
      onCreated?.(res.data);
      onClose?.();
    } catch (error) {
      toast.error(error.message || "Failed to add the vendor.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center px-4">
      <button
        type="button"
        aria-label="Close"
        disabled={saving}
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-overlay/45 backdrop-blur-sm"
      />
      <div className="relative z-10 w-full max-w-[460px] overflow-hidden rounded-[20px] border border-border-color/80 bg-surface shadow-[0_30px_90px_rgba(15,23,42,0.2)]">
        <div className="px-6 pt-6">
          <h2 className="text-lg font-semibold text-text-primary">Add Vendor</h2>
          <p className="mt-1 text-sm text-text-secondary">
            The new vendor is saved and selected automatically.
          </p>
          <div className="mt-4 space-y-3">
            <label className="block">
              <span className={LABEL}>Vendor Name <span className="text-rose-500">*</span></span>
              <input
                className={INPUT}
                autoFocus
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Sharma Fiber Contractors"
              />
            </label>
            <label className="block">
              <span className={LABEL}>Vendor Type</span>
              <select
                className={INPUT}
                value={form.vendorType}
                onChange={(e) => setForm((f) => ({ ...f, vendorType: e.target.value }))}
              >
                <option value="">Select type…</option>
                {vendorTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className={LABEL}>GSTIN</span>
                <input
                  className={INPUT}
                  value={form.gstin}
                  onChange={(e) => setForm((f) => ({ ...f, gstin: e.target.value.toUpperCase() }))}
                  placeholder="Optional"
                />
              </label>
              <label className="block">
                <span className={LABEL}>Phone</span>
                <input
                  className={INPUT}
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="Optional"
                />
              </label>
              <label className="block">
                <span className={LABEL}>Bank Account Number</span>
                <input
                  className={INPUT}
                  value={form.bankAccount}
                  onChange={(e) => setForm((f) => ({ ...f, bankAccount: e.target.value.replace(/[^0-9]/g, "") }))}
                  placeholder="Optional"
                  inputMode="numeric"
                />
              </label>
              <label className="block">
                <span className={LABEL}>IFSC Code</span>
                <input
                  className={INPUT}
                  value={form.ifsc}
                  onChange={(e) => setForm((f) => ({ ...f, ifsc: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 11) }))}
                  placeholder="Optional"
                />
              </label>
            </div>
          </div>
        </div>
        <div className="mt-5 flex flex-col-reverse gap-2 border-t border-border-color/70 bg-surface-muted/40 px-6 py-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="inline-flex h-10 items-center justify-center rounded-full border border-border-color bg-surface px-5 text-sm font-medium text-text-secondary transition hover:bg-surface-muted disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || !form.name.trim()}
            className="inline-flex h-10 min-w-[140px] items-center justify-center gap-2 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 px-5 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 disabled:opacity-50"
          >
            {saving ? <Loader2 className="animate-spin" size={15} /> : null}
            Save Vendor
          </button>
        </div>
      </div>
    </div>
  );
}
