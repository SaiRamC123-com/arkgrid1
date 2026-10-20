import { Wifi, WifiOff, RefreshCw, ServerCrash } from "lucide-react";
import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import useOnlineStatus from "../../hooks/useOnlineStatus";
import useBackendStatus from "../../hooks/useBackendStatus";
import useQueue from "../../hooks/useQueue";

export default function NetworkBanner() {
  const { profile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const redirectedRef = useRef(false);
  const online = useOnlineStatus();
  const backend = useBackendStatus(online);
  const { pending: queued } = useQueue(profile?.uid);
  const pending = profile ? queued : 0;
  const offline = !online;
  const unavailable = online && backend === "unavailable";
  const checking = online && backend === "checking";

  useEffect(() => {
    const emergencyMode = !online || backend === "unavailable";
    if (!emergencyMode) {
      redirectedRef.current = false;
      return;
    }
    if (profile?.role === "citizen" && !location.pathname.startsWith("/citizen/sos") && !redirectedRef.current) {
      redirectedRef.current = true;
      navigate("/citizen/sos", { replace: true });
    }
  }, [backend, location.pathname, navigate, online, profile?.role]);
  const tone = offline || unavailable
    ? "border-ark-coral/40 bg-ark-coral/15 text-ark-coral"
    : checking
      ? "border-amber-400/30 bg-amber-400/10 text-amber-200"
      : "border-emerald-400/25 bg-emerald-400/5 text-emerald-200";

  return (
    <div className={`flex items-center justify-center gap-2 border-b px-4 py-2 text-center text-xs font-semibold ${tone}`} role="status">
      {offline ? <WifiOff size={13} /> : unavailable ? <ServerCrash size={13} /> : checking ? <RefreshCw size={13} className="animate-spin" /> : <Wifi size={13} />}
      {offline
        ? `OFFLINE — EMERGENCY MODE${pending ? ` · ${pending} saved item${pending === 1 ? "" : "s"} waiting to sync` : ""}`
        : unavailable
          ? `SERVER UNAVAILABLE${pending ? ` · ${pending} saved item${pending === 1 ? "" : "s"} waiting to sync` : ""}`
          : checking
            ? "Checking server connection…"
            : `ONLINE · ArkGrid server available${pending ? ` · ${pending} saved item${pending === 1 ? "" : "s"} waiting to sync` : ""}`}
    </div>
  );
}