import { useEffect } from "react";
import toast from "react-hot-toast";
import { useAuth } from "../../context/AuthContext";
import { flushQueue, onSynced, onDropped } from "../../offline/sync";

// Mounted once in AppLayout: auto-syncs the offline queue from anywhere in the app
export default function SyncManager() {
  const { profile } = useAuth();
  const uid = profile?.uid;

  useEffect(() => {
    if (!uid) return;
    const run = () => flushQueue(uid);
    const onVisible = () => document.visibilityState === "visible" && run();
    const onMsg = (e) => e.data?.type === "FLUSH_QUEUE" && run();

    run();
    window.addEventListener("online", run);
    document.addEventListener("visibilitychange", onVisible);
    navigator.serviceWorker?.addEventListener("message", onMsg);
    const timer = setInterval(onVisible, 20000);

    const offSynced = onSynced(({ item }) =>
  item.type === "report"
    ? toast.success("Your saved report was received by ArkGrid", { icon: "📍", duration: 5000 })
    : toast.success("Your saved SOS was received by ArkGrid. Delivery to responders is not confirmed.", { icon: "🚨", duration: 7000 })
);
    const offDropped = onDropped(({ message }) => toast.error(message || "A queued SOS was rejected"));

    return () => {
      window.removeEventListener("online", run);
      document.removeEventListener("visibilitychange", onVisible);
      navigator.serviceWorker?.removeEventListener("message", onMsg);
      clearInterval(timer);
      offSynced();
      offDropped();
    };
  }, [uid]);

  return null;
}