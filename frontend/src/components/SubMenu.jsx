function SubMenu({ open, collapsed = false, children }) {
  if (collapsed) return null;

  return (
    <div
      className={`grid transition-all duration-300 ease-out ${
        open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
      }`}
    >
      <div className="overflow-hidden">
        <div className="mt-2 space-y-1 border-l border-border-color pl-3">
          {children}
        </div>
      </div>
    </div>
  );
}

export default SubMenu;
