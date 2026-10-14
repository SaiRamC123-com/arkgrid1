import { useState } from "react";
import { Link } from "react-router-dom";
import { Mail, Lock } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "../../context/AuthContext";
import { errMsg } from "../../utils/errMsg";
import AuthShell from "../../components/layout/AuthShell";
import GlassCard from "../../components/ui/GlassCard";
import Input from "../../components/ui/Input";
import Button from "../../components/ui/Button";

export default function Login() {
  const { login } = useAuth();
  const [form, setForm] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(form.email.trim(), form.password);
      toast.success("Welcome back");
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell>
      <GlassCard className="p-8">
        <h2 className="font-display text-3xl font-bold">Welcome back</h2>
        <p className="mb-7 mt-1 text-sm text-slate-400">Sign in to your ArkGrid account</p>

        <form onSubmit={submit} className="space-y-5">
          <Input label="Email" icon={Mail} type="email" placeholder="you@example.com"
            value={form.email} onChange={set("email")} required />
          <Input label="Password" icon={Lock} type="password" placeholder="••••••••"
            value={form.password} onChange={set("password")} required />
          <Button type="submit" loading={loading} className="w-full">Sign In</Button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-400">
          New to ArkGrid?{" "}
          <Link to="/register" className="font-semibold text-ark-cyan hover:underline">Create account</Link>
        </p>
      </GlassCard>
    </AuthShell>
  );
}