function SubMenu({ open, collapsed = false, children }) {
  if (collapsed) return null;

  return (
    <div
      className={`overflow-hidden transition-all duration-300 ease-out ${
        open ? "max-h-screen opacity-100" : "max-h-0 opacity-0"
      }`}
    >
      <div className="mt-2 space-y-1 border-l border-border-color pl-3">
        {children}
      </div>
    </div>
  );
}

export default SubMenu;
