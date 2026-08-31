import { useCallback, useEffect, useState } from "react";
import { Bell, Check, CheckCheck } from "lucide-react";

import { CARD_SHELL } from "../billingDashboard/theme";
import { formatDateTime } from "../../utils/penaltyFormat";
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../../lib/expenseClaimsApi";

// Compact in-portal notification feed for the Expense Claims module.
export default function NotificationsCard() {
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetchNotifications({ limit: 20 });
      setItems(res.data || []);
      setUnread(res.unread || 0);
    } catch {
      /* silent — notifications are non-critical */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const readOne = async (id) => {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    setUnread((u) => Math.max(0, u - 1));
    try {
      await markNotificationRead(id);
    } catch {
      load();
    }
  };

  const readAll = async () => {
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnread(0);
    try {
      await markAllNotificationsRead();
    } catch {
      load();
    }
  };

  if (loading || items.length === 0) return null;

  return (
    <div className={`${CARD_SHELL} overflow-hidden`}>
      <div className="flex items-center justify-between gap-2 border-b border-border-color/70 px-4 py-2.5">
        <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
          <Bell size={15} className="text-indigo-500" />
          Updates
          {unread ? (
            <span className="rounded-full bg-indigo-500 px-1.5 text-[11px] font-bold text-white">{unread}</span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {unread ? (
            <button type="button" onClick={readAll} className="inline-flex items-center gap-1 text-xs font-medium text-text-secondary hover:text-text-primary">
              <CheckCheck size={13} /> Mark all read
            </button>
          ) : null}
          <button type="button" onClick={() => setCollapsed((c) => !c)} className="text-xs font-medium text-text-secondary hover:text-text-primary">
            {collapsed ? "Show" : "Hide"}
          </button>
        </div>
      </div>
      {!collapsed ? (
        <ul className="max-h-64 divide-y divide-border-color overflow-y-auto">
          {items.map((n) => (
            <li
              key={n.id}
              className={`flex items-start gap-2 px-4 py-2.5 text-sm ${n.isRead ? "" : "bg-indigo-50/60 dark:bg-indigo-500/5"}`}
            >
              <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${n.isRead ? "bg-transparent" : "bg-indigo-500"}`} />
              <div className="min-w-0 flex-1">
                <p className="text-text-primary">{n.message}</p>
                <p className="text-[11px] text-text-muted">{formatDateTime(n.createdAt)}</p>
              </div>
              {!n.isRead ? (
                <button type="button" onClick={() => readOne(n.id)} className="shrink-0 text-text-muted hover:text-emerald-600" title="Mark read">
                  <Check size={14} />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
