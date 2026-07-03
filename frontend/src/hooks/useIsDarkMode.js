import { useEffect, useState } from "react";

// Dashboard shell toggles a `dark` class on <html> (see DashboardLayout.jsx).
// Recharts renders raw SVG (fill/stroke attributes), which Tailwind's
// class-based dark mode can't reach, so chart views need the boolean directly.
export function useIsDarkMode() {
  const [isDark, setIsDark] = useState(() =>
    typeof document !== "undefined" && document.documentElement.classList.contains("dark")
  );

  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => setIsDark(root.classList.contains("dark")));
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return isDark;
}
