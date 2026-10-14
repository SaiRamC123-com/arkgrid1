import { useCallback, useEffect, useState } from "react";
import { Copy, LogOut, Plus, Radio } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "../../context/AuthContext";
import { familyApi } from "../../services/familyService";
import useLiveLocation from "../../hooks/useLiveLocation";
import { errMsg } from "../../utils/errMsg";
import GlassCard from "../../components/ui/GlassCard";
import Badge from "../../components/ui/Badge";
import Loader from "../../components/ui/Loader";
import FamilyMap from "../../components/family/FamilyMap";
import StatusToggle from "../../components/family/StatusToggle";
import MemberCard from "../../components/family/MemberCard";
import CreateJoinPanel from "../../components/family/CreateJoinPanel";
import ZoneManager from "../../components/family/ZoneManager";
import ActivityFeed from "../../components/family/ActivityFeed";

export default function FamilyNetwork() {
  const { profile } = useAuth();
  const me = profile.uid;

  const [families, setFamilies] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [activity, setActivity] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState(() => localStorage.getItem("ark_share_loc") === "1");
  const [picked, setPicked] = useState(null);
  const [radius, setRadius] = useState(300);

  const load = useCallback(async () => {
    try {
      const list = await familyApi.list();
      setFamilies(list);
      setActiveId((cur) => (list.some((f) => f.id === cur) ? cur : list[0]?.id || null));
    } catch (err) {
      toast.error(errMsg(err));
      setFamilies((f) => f || []);
    }
  }, []);

  const active = families?.find((f) => f.id === activeId) || null;

  const loadActivity = useCallback(async () => {
    if (!activeId) return setActivity([]);
    try {
      setActivity(await familyApi.activity(activeId));
    } catch {
      /* ignore transient errors */
    }
  }, [activeId]);

  // initial load + polling every 15s (sockets arrive in the dashboard step)
  useEffect(() => {
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 15000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    loadActivity();
    const t = setInterval(loadActivity, 15000);
    return () => clearInterval(t);
  }, [loadActivity]);

  const { pos, error: geoError } = useLiveLocation(sharing, async (fix) => {
    try {
      const r = await familyApi.sendLocation(fix);
      if (r.checkedInAt) toast.success(`Auto check-in: ${r.checkedInAt}`);
      load();
      loadActivity();
    } catch {
      /* offline queue arrives in the SOS step */
    }
  });

  useEffect(() => {
    if (geoError) toast.error(geoError, { id: "geo" });
  }, [geoError]);

  const toggleSharing = () => {
    const next = !sharing;
    setSharing(next);
    localStorage.setItem("ark_share_loc", next ? "1" : "0");
    toast(next ? "Live location sharing on" : "Live location sharing off", { icon: next ? "📡" : "⏸️" });
  };

  const handleStatus = async (status) => {
    if (status === "sos" && !window.confirm("Mark yourself as SOS? Your whole circle will be alerted.")) return;
    setBusy(true);
    try {
      await familyApi.setStatus({ status, ...(pos || {}) });
      toast.success(`Status set to ${status.toUpperCase()}`);
      await Promise.all([load(), loadActivity()]);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  const copyCode = async () => {
    await navigator.clipboard.writeText(active.inviteCode);
    toast.success("Invite code copied");
  };

  const leave = async () => {
    if (!window.confirm(`Leave "${active.name}"?`)) return;
    try {
      await familyApi.leave(active.id);
      toast.success("You left the circle");
      setActiveId(null);
      load();
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  if (!families) return <Loader />;

  if (families.length === 0) {
    return (
      <div className="pt-8">
        <CreateJoinPanel onDone={(id) => { setActiveId(id); load(); }} />
      </div>
    );
  }

  const myMember = active.members.find((m) => m.uid === me);
  const myPos = pos || myMember?.lastLocation || null;
  const isOwner = active.ownerUid === me;
  const sosCount = active.members.filter((m) => m.status === "sos").length;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        {families.map((f) => (
          <button
            key={f.id}
            onClick={() => { setActiveId(f.id); setPicked(null); }}
            className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
              f.id === activeId
                ? "border-ark-cyan bg-gradient-to-r from-ark-indigo/40 to-ark-cyan/30 text-white shadow-glow-cyan"
                : "border-white/10 bg-white/5 text-slate-400 hover:bg-white/10"
            }`}
          >
            {f.name}
          </button>
        ))}
        <button onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1.5 rounded-full border border-dashed border-white/20 px-4 py-2 text-sm text-slate-400 hover:text-white">
          <Plus size={15} /> Add
        </button>
      </div>

      {showAdd && (
        <CreateJoinPanel compact onDone={(id) => { setShowAdd(false); setActiveId(id); load(); }} />
      )}

      {sosCount > 0 && (
        <div className="flex items-center gap-3 rounded-2xl border border-ark-coral/60 bg-ark-coral/15 p-4 shadow-glow-coral">
          <Radio className="animate-pulse text-ark-coral" />
          <p className="text-sm font-semibold text-ark-coral">
            {sosCount} member{sosCount > 1 ? "s" : ""} in your circle {sosCount > 1 ? "have" : "has"} sent an SOS
          </p>
        </div>
      )}

      {/* Invite + sharing */}
      <GlassCard className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-slate-400">Invite code</p>
          <button onClick={copyCode} className="mt-1 flex items-center gap-2 font-display text-3xl font-bold tracking-[0.25em] text-gradient">
            {active.inviteCode} <Copy size={18} className="text-slate-400" />
          </button>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={toggleSharing}
            className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${
              sharing ? "border-ark-cyan bg-ark-cyan/15 text-ark-cyan shadow-glow-cyan" : "border-white/10 bg-white/5 text-slate-300"
            }`}>
            <Radio size={16} className={sharing ? "animate-pulse" : ""} />
            {sharing ? "Sharing live location" : "Share my location"}
          </button>
          <button onClick={leave} className="rounded-xl p-2.5 text-slate-500 hover:bg-white/10 hover:text-ark-coral" title="Leave circle">
            <LogOut size={18} />
          </button>
        </div>
      </GlassCard>

      {/* Map + status */}
      <div className="grid gap-6 lg:grid-cols-3">
        <GlassCard className="overflow-hidden p-2 lg:col-span-2">
          <FamilyMap
            members={active.members}
            zones={active.safeZones}
            myUid={me}
            picked={picked}
            pickRadius={radius}
            canPick={isOwner}
            onPick={setPicked}
            fitKey={`${active.id}-${active.members.filter((m) => m.lastLocation).length}-${active.safeZones.length}`}
          />
        </GlassCard>

        <div className="space-y-6">
          <GlassCard>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold">My status</h3>
              {myMember?.lastLocation && <Badge tone="cyan">Location saved</Badge>}
            </div>
            <StatusToggle value={myMember?.status || "unknown"} onChange={handleStatus} busy={busy} />
            <p className="mt-4 text-xs text-slate-400">
              Turn on location sharing to enable automatic safe-zone check-ins.
            </p>
          </GlassCard>

          <ZoneManager
            family={active}
            isOwner={isOwner}
            picked={picked}
            myPos={myPos}
            radius={radius}
            setRadius={setRadius}
            onUsePos={() => myPos && setPicked({ lat: myPos.lat, lng: myPos.lng })}
            onChanged={(clear) => { if (clear) setPicked(null); load(); }}
          />
        </div>
      </div>

      {/* Members + activity */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="grid gap-4 sm:grid-cols-2 lg:col-span-2">
          {active.members.map((m) => (
            <MemberCard key={m.uid} member={m} isMe={m.uid === me} isOwner={m.uid === active.ownerUid} myPos={myPos} />
          ))}
        </div>
        <ActivityFeed items={activity} />
      </div>
    </div>
  );
}