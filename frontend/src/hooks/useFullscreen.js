import { useCallback, useEffect, useState } from "react";

const getFullscreenElement = () =>
  document.fullscreenElement || document.webkitFullscreenElement || null;

// Real Fullscreen API rather than a CSS class that only fills the viewport —
// so the browser chrome actually gets out of the way, Esc exits natively, and
// the state stays correct when the user leaves fullscreen by any other means.
export function useFullscreen(targetRef) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const sync = () => setIsFullscreen(!!getFullscreenElement() && getFullscreenElement() === targetRef.current);
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync);
    };
  }, [targetRef]);

  const toggle = useCallback(async () => {
    const el = targetRef.current;
    if (!el) return;
    try {
      if (getFullscreenElement()) {
        await (document.exitFullscreen?.() ?? document.webkitExitFullscreen?.());
      } else {
        await (el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.());
      }
    } catch {
      // Denied (iframe without allowfullscreen, iOS Safari on non-video) —
      // fall back to an in-page expanded layout instead of dead-ending.
      setIsFullscreen(prev => !prev);
    }
  }, [targetRef]);

  return [isFullscreen, toggle];
}
