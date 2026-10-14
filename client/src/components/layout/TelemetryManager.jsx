import { useEffect, useRef, useSyncExternalStore } from "react";
import toast from "react-hot-toast";
import { useAuth } from "../../context/AuthContext";
import useLastFix from "../../hooks/useLastFix";
import { teamApi } from "../../services/opsService";
import { getTele, setTele, subscribeTele } from "../../utils/teleFlag";
import { errMsg } from "../../utils/errMsg";

// GPS is only watched while the responder has switched sharing on
function Sender() {
  const { profile } = useAuth();
  const { fix } = useLastFix(profile.uid);
  const ref = useRef(fix);
  ref.current = fix;

  useEffect(() => {
    const send = async () => {
      const f = ref.current;
      if (!f || !navigator.onLine || Date.now() - f.at > 60000) return;
      try {
        await teamApi.sendLocation({ lat: f.lat, lng: f.lng, accuracy: f.accuracy });
      } catch (err) {
        const s = err?.response?.status;
        if (s && s >= 400 && s < 500 && s !== 429 && s !== 401) {
          setTele(false);
          toast.error(`Location sharing turned off: ${errMsg(err)}`);
        }
      }
    };
    send();
    const t = setInterval(send, 15000);
    return () => clearInterval(t);
  }, []);

  return null;
}

export default function TelemetryManager() {
  const on = useSyncExternalStore(subscribeTele, getTele);
  return on ? <Sender /> : null;
}