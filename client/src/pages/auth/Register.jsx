import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Link } from "react-router-dom";
import { User, Mail, Lock, Phone, KeyRound, LifeBuoy, ShieldCheck } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "../../context/AuthContext";
import { errMsg } from "../../utils/errMsg";
import AuthShell from "../../components/layout/AuthShell";
import GlassCard from "../../components/ui/GlassCard";
import Input from "../../components/ui/Input";
import Button from "../../components/ui/Button";

const roles = [
  { id: "responder", label: "Responder", icon: LifeBuoy },
  { id: "commander", label: "Commander", icon: ShieldCheck },
];

export default function Register() {
    const [params] = useSearchParams();
  const startRole = ["responder", "commander"].includes(params.get("role")) ? params.get("role") : "responder";
  const { register } = useAuth();
  const [form, setForm] = useState({
    name: "", email: "", phone: "", password: "", role: startRole, inviteCode: "",
  });
  const [loading, setLoading] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (form.password.length < 6) return toast.error("Password must be at least 6 characters");
    setLoading(true);
    try {
      await register({ ...form, email: form.email.trim() });
      toast.success("Account created. Stay safe!");
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell>
      <GlassCard className="p-8">
        <h2 className="font-display text-3xl font-bold">Create account</h2>
        <p className="mb-6 mt-1 text-sm text-slate-400">Join the ArkGrid safety network</p>

        <form onSubmit={submit} className="space-y-4">
<div className="grid grid-cols-2 gap-2">
            {roles.map(({ id, label, icon: Icon }) => (
              <button
                type="button"
                key={id}
                onClick={() => setForm({ ...form, role: id })}
                className={`flex flex-col items-center gap-1.5 rounded-xl border py-3 text-xs font-semibold transition-all ${
                  form.role === id
                    ? "border-ark-cyan bg-gradient-to-br from-ark-indigo/30 to-ark-cyan/20 text-white shadow-glow-cyan"
                    : "border-white/10 bg-white/5 text-slate-400 hover:bg-white/10"
                }`}
              >
                <Icon size={20} />
                {label}
              </button>
            ))}
          </div>

          <Input label="Full name" icon={User} placeholder="Your name" value={form.name} onChange={set("name")} required />
          <Input label="Email" icon={Mail} type="email" placeholder="you@example.com" value={form.email} onChange={set("email")} required />
          <Input label="Phone" icon={Phone} type="tel" placeholder="+91 98765 43210" value={form.phone} onChange={set("phone")} />
          <Input label="Password" icon={Lock} type="password" placeholder="Min 6 characters" value={form.password} onChange={set("password")} required />

          {form.role !== "citizen" && (
            <Input label="Invite code" icon={KeyRound} placeholder="Provided by your organization"
              value={form.inviteCode} onChange={set("inviteCode")} required />
          )}

          <Button type="submit" loading={loading} className="w-full">Create Account</Button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-400">
          Already registered?{" "}
          <Link to="/login" className="font-semibold text-ark-cyan hover:underline">Sign in</Link>
        </p>
      </GlassCard>
    </AuthShell>
  );
}