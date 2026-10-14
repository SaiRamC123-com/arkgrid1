import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, X, MapPin, Send } from "lucide-react";
import toast from "react-hot-toast";
import { reportApi } from "../../services/reportService";
import { compressImage } from "../../utils/image";
import { errMsg } from "../../utils/errMsg";
import GlassCard from "../ui/GlassCard";
import Button from "../ui/Button";
import { REPORT_TYPES } from "./reportMeta";

export default function ReportForm({ coords, onDone, onCancel }) {
  const [type, setType] = useState("submerged_road");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [sending, setSending] = useState(false);
  const camRef = useRef(null);
  const galRef = useRef(null);

  useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const pick = (e) => {
    const f = e.target.files?.[0];
    if (f) setFile(f);
    e.target.value = "";
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!coords) return toast.error("Waiting for your location. You can also tap the map");
    if (!file && description.trim().length < 5) return toast.error("Add a photo or describe what you see");

    setSending(true);
    try {
      const fd = new FormData();
      fd.append("type", type);
      fd.append("description", description.trim());
      fd.append("lat", coords.lat);
      fd.append("lng", coords.lng);
      if (file) fd.append("photo", await compressImage(file));
      const res = await reportApi.create(fd);
      toast.success("Report sent. It stays Unverified until others confirm it", { duration: 5000 });
      if (res.photoFailed) toast("Your photo could not be saved, but the report was sent", { icon: "📷" });
      onDone();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <GlassCard>
      <h3 className="font-display text-lg font-semibold">Report a hazard</h3>
      <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
        <MapPin size={13} className="text-ark-coral" />
        {coords ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)} · tap the map to move the pin` : "Getting your location… or tap the map"}
      </p>

      <form onSubmit={submit} className="mt-5 space-y-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {Object.entries(REPORT_TYPES).map(([id, { label, icon: Icon }]) => (
            <button type="button" key={id} onClick={() => setType(id)}
              className={`flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-center text-xs font-semibold transition ${
                type === id
                  ? "border-ark-cyan bg-ark-cyan/15 text-ark-cyan shadow-glow-cyan"
                  : "border-white/10 bg-white/5 text-slate-400 hover:bg-white/10"
              }`}>
              <Icon size={20} /> {label}
            </button>
          ))}
        </div>

        <textarea rows={3} maxLength={300} value={description} onChange={(e) => setDescription(e.target.value)}
          placeholder="What do you see? e.g. Water knee-deep, cars cannot pass" className="input-glass resize-none" />

        {preview ? (
          <div className="relative overflow-hidden rounded-xl border border-white/10">
            <img src={preview} alt="Report preview" className="max-h-56 w-full object-cover" />
            <button type="button" onClick={() => setFile(null)}
              className="absolute right-2 top-2 rounded-full bg-navy-900/80 p-1.5 hover:bg-ark-coral">
              <X size={16} />
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Button type="button" variant="ghost" onClick={() => camRef.current?.click()}><Camera size={17} /> Take photo</Button>
            <Button type="button" variant="ghost" onClick={() => galRef.current?.click()}><ImagePlus size={17} /> Choose photo</Button>
          </div>
        )}
        <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={pick} />
        <input ref={galRef} type="file" accept="image/*" hidden onChange={pick} />

        <p className="text-xs text-slate-500">
          Reports are marked Unverified until confirmed by other people or a responder. For emergencies use SOS.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button type="submit" loading={sending}><Send size={16} /> Send report</Button>
        </div>
      </form>
    </GlassCard>
  );
}