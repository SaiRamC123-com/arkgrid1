import { useState } from "react";
import { Users, KeyRound, Plus } from "lucide-react";
import toast from "react-hot-toast";
import { familyApi } from "../../services/familyService";
import { errMsg } from "../../utils/errMsg";
import GlassCard from "../ui/GlassCard";
import Input from "../ui/Input";
import Button from "../ui/Button";

export default function CreateJoinPanel({ onDone, compact = false }) {
  const [tab, setTab] = useState("create");
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = tab === "create" ? await familyApi.create(value) : await familyApi.join(value);
      toast.success(tab === "create" ? "Circle created" : `Joined ${res.name}`);
      setValue("");
      onDone(res.id);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <GlassCard className={compact ? "" : "mx-auto max-w-lg text-center"}>
      {!compact && (
        <>
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-ark-indigo to-ark-cyan shadow-glow-indigo">
            <Users size={30} />
          </div>
          <h2 className="font-display text-2xl font-bold">Build your safety circle</h2>
          <p className="mb-6 mt-2 text-sm text-slate-400">
            Create a circle for your family, or join one with an invite code.
          </p>
        </>
      )}

      <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl bg-white/5 p-1">
        {[["create", "Create", Plus], ["join", "Join", KeyRound]].map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => { setTab(id); setValue(""); }}
            className={`flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold transition ${
              tab === id ? "bg-gradient-to-r from-ark-indigo to-ark-cyan text-white" : "text-slate-400"
            }`}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="space-y-4 text-left">
        <Input
          label={tab === "create" ? "Circle name" : "Invite code"}
          icon={tab === "create" ? Users : KeyRound}
          placeholder={tab === "create" ? "e.g. Home Family" : "ABC123"}
          value={value}
          maxLength={tab === "create" ? 40 : 6}
          onChange={(e) => setValue(tab === "join" ? e.target.value.toUpperCase() : e.target.value)}
          required
        />
        <Button type="submit" loading={loading} className="w-full">
          {tab === "create" ? "Create Circle" : "Join Circle"}
        </Button>
      </form>
    </GlassCard>
  );
}