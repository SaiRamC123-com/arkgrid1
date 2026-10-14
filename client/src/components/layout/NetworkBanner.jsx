import { WifiOff, RefreshCw } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import useOnlineStatus from "../../hooks/useOnlineStatus";
import useQueue from "../../hooks/useQueue";

export default function NetworkBanner() {
  const { profile } = useAuth();
  const online = useOnlineStatus();
  const { pending } = useQueue(profile.uid);
  if (online && !pending) return null;

  return (
    <div className={`flex items-center justify-center gap-2 border-b px-4 py-2 text-center text-xs font-semibold ${online ? "border-ark-indigo/40 bg-ark-indigo/20 text-indigo-100" : "border-ark-coral/40 bg-ark-coral/15 text-ark-coral"}`}>
      {online ? <RefreshCw size={13} className="animate-spin" /> : <WifiOff size={13} />}
      {online ? `Syncing ${pending} saved item${pending > 1 ? "s" : ""}…` : `You're offline. SOS and saved data still work${pending ? ` · ${pending} waiting to send` : ""}.`}
    </div>
  );
}