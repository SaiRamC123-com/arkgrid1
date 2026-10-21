import { useEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { themeForPath } from "../../config/featureThemes";
import { sceneMarkup } from "./scenes";

function setThemeVars(theme) {
  try {
    const root = document.documentElement;
    root.style.setProperty("--accent-rgb", theme.accent);
    root.style.setProperty("--accent2-rgb", theme.accent2);
    root.dataset.theme = theme.id;
  } catch {
    /* styling only; ignore */
  }
}

// A soft expanding circle wherever you touch or click, in the current feature's colour.
function useTapRipple() {
  useEffect(() => {
    const onDown = (e) => {
      if (e.button > 0) return;
      const el = document.createElement("span");
      el.className = "tap-ripple";
      el.style.left = `${e.clientX}px`;
      el.style.top = `${e.clientY}px`;
      el.addEventListener("animationend", () => el.remove(), { once: true });
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 900);
    };
    window.addEventListener("pointerdown", onDown, { passive: true });
    return () => window.removeEventListener("pointerdown", onDown);
  }, []);
}

export default function AuroraBackground() {
  const { pathname } = useLocation();
  const theme = useMemo(() => themeForPath(pathname), [pathname]);
  const html = useMemo(() => ({ __html: sceneMarkup(theme.scene, theme.accent, theme.accent2) }), [theme]);

  useEffect(() => setThemeVars(theme), [theme]);
  useTapRipple();

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#F7F9FC]" aria-hidden="true">
      <AnimatePresence initial={false}>
        <motion.div
          key={theme.id}
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.9, ease: "easeInOut" }}
          style={{ background: `linear-gradient(135deg, ${theme.colors[0]} 0%, ${theme.colors[1]} 48%, ${theme.colors[2]} 100%)` }}
        >
          <div className="absolute inset-0" dangerouslySetInnerHTML={html} />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}