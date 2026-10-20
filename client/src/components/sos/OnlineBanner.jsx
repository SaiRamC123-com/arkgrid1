import { Wifi, WifiOff, RefreshCw } from "lucide-react";

export default function OnlineBanner({ online, pending, onSync }) {
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-5 py-3 text-sm ${
        online
          ? "border-ark-cyan/40 bg-ark-cyan/10 text-ark-cyan"
          : "border-ark-coral/50 bg-ark-coral/10 text-ark-coral shadow-glow-coral"
      }`}
    >
      <span className="flex items-center gap-2 font-semibold">
        {online ? <Wifi size={17} /> : <WifiOff size={17} />}
        {online ? "Online. SOS can be submitted to the response system" : "Offline. New SOS incidents stay on this device until connectivity returns"}
      </span>
      {pending > 0 && (
        <button onClick={onSync} className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 font-semibold text-white hover:bg-white/20">
          <RefreshCw size={14} /> {pending} waiting. Sync now
        </button>
      )}
    </div>
  );
}