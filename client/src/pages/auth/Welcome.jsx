import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { Users, Siren, ShieldCheck } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "../../context/AuthContext";
import { errMsg } from "../../utils/errMsg";
import AuthShell from "../../components/layout/AuthShell";
import GlassCard from "../../components/ui/GlassCard";
import Button from "../../components/ui/Button";

export default function Welcome() {
  const { profile, continueAsCitizen } = useAuth();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);

  if (profile) return <Navigate to={profile.role === "citizen" ? "/citizen" : "/command"} replace />;

  const citizen = async () => {
    setBusy(true);
    try {
      await continueAsCitizen();
      nav("/citizen", { replace: true });
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <GlassCard className="p-8">
        <h2 className="font-display text-3xl font-bold">Welcome to ArkGrid</h2>
        <p className="mb-6 mt-1 text-sm text-slate-400">Choose how you want to continue</p>
        <div className="space-y-3">
          <Button onClick={citizen} loading={busy} className="w-full">
            <Users size={18} /> Continue as Citizen
          </Button>
          <Button variant="secondary" onClick={() => nav("/register?role=responder")} className="w-full">
            <Siren size={18} /> Responder – register
          </Button>
          <Button variant="secondary" onClick={() => nav("/register?role=commander")} className="w-full">
            <ShieldCheck size={18} /> Commander – register
          </Button>
        </div>
        <p className="mt-6 text-center text-sm text-slate-400">
          Already staff?{" "}
          <button className="text-ark-cyan" onClick={() => nav("/login")}>Sign in</button>
        </p>
      </GlassCard>
    </AuthShell>
  );
}