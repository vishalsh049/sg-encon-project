import { ChevronRight } from "lucide-react";
import { NavLink } from "react-router-dom";

function MenuItem({
  item,
  depth = 0,
  collapsed = false,
  isOpen = false,
  isActive = false,
  onToggle,
  onNavigate,
  onExpandRequest,
}) {
  const Icon = item.icon;
  const hasChildren = Boolean(item.children?.length);
  const showTooltip = collapsed && depth === 0;

  const sharedClasses = [
    "group relative flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left text-sm transition-all duration-200",
    depth === 0 ? "min-h-[40px]" : "min-h-[36px]",
    isActive
      ? "bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-md"
      : "text-text-secondary hover:bg-surface-muted hover:text-text-primary",
    collapsed && depth === 0 ? "justify-center px-0" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const content = (
    <>
      <span
        className={[
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl transition-colors",
          isActive
            ? "bg-white/15"
            : "bg-surface-muted text-text-secondary group-hover:bg-surface-elevated",
        ].join(" ")}
      >
        {Icon ? (
          <Icon size={16} strokeWidth={2.1} />
        ) : (
          <span className="h-2 w-2 rounded-full bg-current" />
        )}
      </span>

      {!collapsed || depth > 0 ? (
        <>
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{item.label}</div>
            {item.description ? (
              <div className={`truncate text-xs ${isActive ? "text-white/75" : "text-text-muted"}`}>
                {item.description}
              </div>
            ) : null}
          </div>

          {item.badge ? (
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                isActive ? "bg-white/15 text-white" : "bg-surface-elevated text-primary"
              }`}
            >
              {item.badge}
            </span>
          ) : null}

          {hasChildren ? (
            <ChevronRight
              size={16}
              className={`shrink-0 transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`}
            />
          ) : null}
        </>
      ) : null}

      {showTooltip ? (
        <span className="pointer-events-none absolute left-[calc(100%+12px)] top-1/2 z-50
         hidden -translate-y-1/2 whitespace-nowrap rounded-xl border border-border-color
          bg-surface-elevated px-3 py-2 text-xs font-medium text-text-primary shadow-soft group-hover:block">
          {item.label}
        </span>
      ) : null}
    </>
  );

  if (hasChildren) {
    return (
      <button
        type="button"
        onClick={() => {
          if (collapsed && depth === 0) {
            onExpandRequest?.();
            return;
          }
          onToggle?.();
        }}
        className={sharedClasses}
      >
        {content}
      </button>
    );
  }

  return (
    <NavLink to={item.path} onClick={onNavigate} className={sharedClasses}>
      {content}
    </NavLink>
  );
}

export default MenuItem;
