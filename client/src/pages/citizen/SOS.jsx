import { useCallback, useEffect, useRef, useState } from "react";
import { Minus, Plus, Satellite, MessageSquare } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "../../context/AuthContext";
import { sosApi } from "../../services/sosService";
import { enqueue, getMeta, removeFromQueue, setMeta, updateQueueItem } from "../../offline/queue";
import { flushQueue, onSynced, requestBackgroundSync } from "../../offline/sync";
import useOnlineStatus from "../../hooks/useOnlineStatus";
import useQueue from "../../hooks/useQueue";
import useLastFix from "../../hooks/useLastFix";
import { newId } from "../../utils/id";
import { errMsg } from "../../utils/errMsg";
import { sendSosSms } from "../../utils/sosSms";
import GlassCard from "../../components/ui/GlassCard";
import SOSButton from "../../components/sos/SOSButton";
import OnlineBanner from "../../components/sos/OnlineBanner";
import ActiveSOSCard, { NEED_LABELS } from "../../components/sos/ActiveSOSCard";
import MedicalForm from "../../components/sos/MedicalForm";
import SOSHistory from "../../components/sos/SOSHistory";

export default function SOS() {
  const { profile } = useAuth();
  const uid = profile.uid;
  const online = useOnlineStatus();
  const { items: queue, pending } = useQueue(uid);
  const { fix, error: geoError, resolveFix } = useLastFix(uid);

  const [mine, setMine] = useState([]);
  const [medical, setMedical] = useState(null);
  const [needs, setNeeds] = useState([]);
  const [peopleCount, setPeopleCount] = useState(1);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const queued = queue.find((i) => i.type === "sos") || null;
  const active = mine.find((s) => s.status === "active") || null;
  const phase = queued ? "queued" : active ? "active" : "idle";

  const fixRef = useRef(fix);
  fixRef.current = fix;

  const loadMine = useCallback(async () => {
    try {
      setMine(await sosApi.mine());
    } catch {
      /* offline: keep what we have */
    }
  }, []);

  useEffect(() => { loadMine(); }, [loadMine]);
  useEffect(() => onSynced(() => loadMine()), [loadMine]);

  // Medical profile: server first, IndexedDB copy when offline
  useEffect(() => {
    (async () => {
      try {
        const m = await sosApi.getMedical();
        setMedical(m);
        setMeta(`medical_${uid}`, m);
      } catch {
        setMedical((await getMeta(`medical_${uid}`)) || {});
      }
    })();
  }, [uid]);

  // While queued: keep the stored SOS pointing at the freshest location
  useEffect(() => {
    if (!queued || !fix) return;
    if (fix.at <= Date.parse(queued.payload.capturedAt)) return;
    updateQueueItem(queued.id, {
      payload: {
        ...queued.payload,
        lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy,
        capturedAt: new Date(fix.at).toISOString(),
      },
    });
  }, [fix, queued]);

  // While active + online: ping location every 30s
  useEffect(() => {
    if (phase !== "active" || !online) return;
    const send = async () => {
      const f = fixRef.current;
      if (!f) return;
      try {
        await sosApi.ping(active.id, { lat: f.lat, lng: f.lng, accuracy: f.accuracy });
      } catch { /* retry on next tick */ }
    };
    send();
    const t = setInterval(send, 30000);
    return () => clearInterval(t);
  }, [phase, online, active?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const activate = async () => {
    setSending(true);
    try {
      const f = await resolveFix(); // instant when a recent fix exists
      const now = new Date();
      const id = newId();
      // 1) local-first: write to IndexedDB so nothing is ever lost
      await enqueue({
        id, uid, type: "sos", createdAt: Date.now(), attempts: 0,
        payload: {
          clientId: id,
          lat: f?.lat ?? null, lng: f?.lng ?? null, accuracy: f?.accuracy ?? 0,
          capturedAt: new Date(f?.at || now).toISOString(),
          triggeredAt: now.toISOString(),
          message, peopleCount, needs,
        },
      });
      navigator.vibrate?.([200, 100, 200]);
      // 2) then try to send right away
      if (navigator.onLine) flushQueue(uid);
      else {
        requestBackgroundSync();
        toast("Offline: SOS stored on your device. Use 'Send via SMS' for instant help.", { icon: "📡", duration: 7000 });
      }
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSending(false);
    }
  };

  const resolve = async (outcome) => {
    try {
      if (phase === "queued") {
        await removeFromQueue(queued.id);
        toast("Queued SOS cancelled");
        return;
      }
      await sosApi.resolve(active.id, outcome);
      toast.success(outcome === "safe" ? "Glad you're safe" : "SOS cancelled");
      await loadMine();
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  const saveMedical = async (form) => {
    try {
      const saved = await sosApi.saveMedical(form);
      setMedical(saved);
      setMeta(`medical_${uid}`, saved);
      toast.success("Medical profile saved");
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  const toggleNeed = (n) => setNeeds((cur) => (cur.includes(n) ? cur.filter((x) => x !== n) : [...cur, n]));

  // SMS fallback: opens the phone's SMS app with the SOS text prefilled
  const smsFallback = () => {
    const f = fixRef.current;
    const lat = f?.lat ?? queued?.payload?.lat ?? null;
    const lng = f?.lng ?? queued?.payload?.lng ?? null;
    // Change `emergencyPhone` to the real field name in your medical profile
    const numbers = [medical?.emergencyPhone].filter(Boolean);
    sendSosSms({
      numbers,
      lat, lng,
      name: profile.name,
      message: queued?.payload?.message || message,
    });
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold">
          One-Tap <span className="text-gradient">SOS</span>
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Your location and medical info broadcast instantly, even with no signal.
        </p>
      </div>

      <OnlineBanner online={online} pending={pending} onSync={() => flushQueue(uid)} />

      {(!online || phase === "queued") && (
        <button onClick={smsFallback}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-ark-coral/40 bg-ark-coral/10 px-5 py-3 text-sm font-semibold text-ark-coral transition hover:bg-ark-coral/20">
          <MessageSquare size={17} />
          No internet? Send SOS via SMS
        </button>
      )}

      {!fix && (
        <div className="flex items-center gap-3 rounded-2xl border border-ark-indigo/40 bg-ark-indigo/10 px-5 py-3 text-sm text-indigo-200">
          <Satellite size={17} className="animate-pulse" />
          {geoError || "Waiting for GPS. SOS still works and will use your last known location."}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          {phase === "idle" ? (
            <GlassCard className="text-center">
              <SOSButton onActivate={activate} disabled={sending} />

              <div className="mt-6 space-y-5 text-left">
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-400">What do you need? (optional)</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(NEED_LABELS).map(([k, l]) => (
                      <button key={k} onClick={() => toggleNeed(k)}
                        className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
                          needs.includes(k)
                            ? "border-ark-coral bg-ark-coral/20 text-ark-coral shadow-glow-coral"
                            : "border-white/10 bg-white/5 text-slate-400 hover:bg-white/10"
                        }`}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-xl bg-white/5 px-4 py-3">
                  <span className="text-sm text-slate-300">People with you</span>
                  <div className="flex items-center gap-4">
                    <button onClick={() => setPeopleCount((c) => Math.max(1, c - 1))} className="rounded-lg bg-white/10 p-1.5 hover:bg-white/20"><Minus size={16} /></button>
                    <span className="w-6 text-center font-display text-lg font-bold">{peopleCount}</span>
                    <button onClick={() => setPeopleCount((c) => Math.min(50, c + 1))} className="rounded-lg bg-white/10 p-1.5 hover:bg-white/20"><Plus size={16} /></button>
                  </div>
                </div>

                <textarea rows={2} maxLength={200} value={message} onChange={(e) => setMessage(e.target.value)}
                  placeholder="Short message for responders (optional)" className="input-glass resize-none" />
              </div>
            </GlassCard>
          ) : (
            <ActiveSOSCard phase={phase} sos={active} queued={queued} fix={fix} online={online} onResolve={resolve} />
          )}

          <SOSHistory items={mine} />
        </div>

        {medical && <MedicalForm initial={medical} onSave={saveMedical} />}
      </div>
    </div>
  );
}