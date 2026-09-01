import { formatCurrency } from "../../utils/penaltyFormat";

const CHIP =
  "inline-flex items-center rounded-full border border-border-color bg-surface-muted/60 px-2 py-0.5 text-[10px] font-medium text-text-secondary";

// Compact, read-only summary of an expense item's dynamic classification.
// Used in every downstream view so an approver / finance sees the full picture.
export default function ItemClassification({ item, className = "" }) {
  if (!item) return null;
  // Nothing to show for legacy claims saved before the dynamic form.
  const hasDynamic =
    item.claimType || item.billingType || item.workCategory || item.vendorName || item.empRefName || item.poNumber;
  if (!hasDynamic) return null;
  const chips = [];

  if (item.expenseFor === "vendor") {
    chips.push(item.vendorName ? `Vendor: ${item.vendorName}` : "Vendor");
    if (item.vendorType) chips.push(item.vendorType);
  } else {
    chips.push(item.empRefName ? `Emp: ${item.empRefName}${item.empRefCode ? ` (${item.empRefCode})` : ""}` : "Employee");
    if (item.employeeType) chips.push(item.employeeType);
  }
  if (item.claimType) chips.push(item.claimType === "advance" ? "Advance" : "Reimbursement");
  if (item.billingType) chips.push(item.billingType === "billable" ? `Billable${item.clientName ? ` · ${item.clientName}` : ""}` : "Non-Billable");
  if (item.workCategory) chips.push(item.workCategory);
  if (item.poNumber) chips.push(`PO: ${item.poNumber}`);
  if (item.domain) chips.push(`Domain: ${item.domain === "Others" ? item.otherDomain || "Others" : item.domain}`);
  if (item.siteRoute) chips.push(`Site/Route: ${item.siteRoute}`);
  if (item.estimateWccAmount != null) chips.push(`Est. WCC: ${formatCurrency(item.estimateWccAmount)}`);
  if (item.bankAccount) chips.push(`A/C: ${item.bankAccount}`);
  if (item.ifsc) chips.push(`IFSC: ${item.ifsc}`);

  if (!chips.length) return null;
  return (
    <div className={`flex flex-wrap gap-1 ${className}`}>
      {chips.map((c, i) => (
        <span key={i} className={CHIP}>
          {c}
        </span>
      ))}
    </div>
  );
}
