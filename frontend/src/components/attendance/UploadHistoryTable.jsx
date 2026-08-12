import { formatDisplayDate, formatDateTime } from "../../lib/attendanceFormat";

export default function UploadHistoryTable({ uploads, uploadsLoading }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border-color/70 bg-surface/70">
      <table className="w-full text-left text-sm">
        <thead className="bg-surface-muted text-xs uppercase text-text-muted">
          <tr>
            <th className="px-4 py-3">Uploaded At</th>
            <th className="px-4 py-3">Attendance Date</th>
            <th className="px-4 py-3">File</th>
            <th className="px-4 py-3">Uploaded By</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Total</th>
            <th className="px-4 py-3">Inserted</th>
            <th className="px-4 py-3">Updated</th>
            <th className="px-4 py-3">Skipped</th>
          </tr>
        </thead>
        <tbody>
          {uploadsLoading ? (
            <tr>
              <td colSpan={9} className="px-4 py-6 text-center text-text-muted">Loading...</td>
            </tr>
          ) : uploads.length === 0 ? (
            <tr>
              <td colSpan={9} className="px-4 py-6 text-center text-text-muted">No uploads yet.</td>
            </tr>
          ) : (
            uploads.map((item) => (
              <tr key={item.id} className="border-t border-border-color/50">
                <td className="px-4 py-3">{formatDateTime(item.created_at)}</td>
                <td className="px-4 py-3">{formatDisplayDate(String(item.attendance_date).slice(0, 10))}</td>
                <td className="px-4 py-3">{item.original_name}</td>
                <td className="px-4 py-3">{item.uploaded_by_name || "-"}</td>
                <td className="px-4 py-3 capitalize">{item.status.replace("_", " ")}</td>
                <td className="px-4 py-3">{item.total_rows}</td>
                <td className="px-4 py-3">{item.inserted_rows}</td>
                <td className="px-4 py-3">{item.updated_rows}</td>
                <td className="px-4 py-3">{item.skipped_rows}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
