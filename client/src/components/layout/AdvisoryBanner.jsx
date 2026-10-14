import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Megaphone, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { advisoryApi } from "../../services/simService";
import { timeAgo } from "../../utils/geo";

const CACHE = "ark_adv_cache";
const DISMISS = "ark_adv_dismissed";
const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const STYLE = {
  watch: "border-ark-indigo/50 bg-ark-indigo/15 text-indigo-100",
  warning: "border-ark-coral/50 bg-ark-coral/15 text-white",
  evacuate: "border-ark-coral bg-ark-coral/25 text-white shadow-glow-coral",
};

export default function AdvisoryBanner() {
  const { profile } = useAuth();
  const [list, setList] = useState(() => read(CACHE, []));
  const [dismissed, setDismissed] = useState(() => read(DISMISS, {}));
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const load = async () => {
      let f = null;
      try { const x = JSON.parse(localStorage.getItem(`ark_last_fix_${profile.uid}`)); if (x?.lat != null) f = { lat: x.lat, lng: x.lng }; } catch { /* no fix yet */ }
      try {
        const a = await advisoryApi.active(f);
        setList(a);
        localStorage.setItem(CACHE, JSON.stringify(a)); // offline users keep the last known advisories until they expire
      } catch { /* offline: keep the cached list */ }
    };
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 60000);
    const tick = setInterval(() => setNow(Date.now()), 30000);
    window.addEventListener("online", load);
    return () => { clearInterval(t); clearInterval(tick); window.removeEventListener("online", load); };
  }, [profile.uid]);

  const shown = list.filter((a) => Date.parse(a.expiresAt) > now && !(dismissed[a.id] > now));

  const dismiss = (id) => {
    const next = { ...dismissed, [id]: Date.now() + 30 * 60000 };
    setDismissed(next);
    localStorage.setItem(DISMISS, JSON.stringify(next));
  };

  if (!shown.length) return null;
  return (
    <div className="mb-5 space-y-3">
      <AnimatePresence>
        {shown.map((a) => (
          <motion.div key={a.id} initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className={`flex items-start gap-3 rounded-2xl border px-5 py-4 ${STYLE[a.severity]}`}>
            <Megaphone size={20} className={`mt-0.5 shrink-0 ${a.severity === "evacuate" ? "animate-pulse" : ""}`} />
            <div className="min-w-0 flex-1">
              <p className="font-display text-lg font-bold uppercase tracking-wide">{a.severity}: {a.title}</p>
              <p className="mt-1 text-sm">{a.message}</p>
              <p className="mt-2 text-xs opacity-70">Issued by {a.issuedByName} · {timeAgo(a.issuedAt)} · valid until {new Date(a.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
            </div>
            {a.severity === "watch" && (
              <button onClick={() => dismiss(a.id)} className="rounded-lg p-1.5 hover:bg-white/10" title="Hide for 30 min"><X size={16} /></button>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}