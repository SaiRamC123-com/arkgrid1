import { LogOut, Menu } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "../../context/AuthContext";
import Badge from "../ui/Badge";

const roleTone = { citizen: "cyan", responder: "indigo", commander: "coral" };

export default function Navbar({ onMenu }) {
  const { profile, logout } = useAuth();
if(!profile) return null;
  const handleLogout = async () => {
    await logout();
    toast.success("Logged out safely");
  };

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/10 bg-navy-900/60 px-4 py-3 backdrop-blur-xl sm:px-8">
      <button onClick={onMenu} className="rounded-xl p-2 hover:bg-white/10 lg:hidden" aria-label="Menu">
        <Menu size={22} />
      </button>
      <div className="hidden lg:block" />

      <div className="flex items-center gap-3">
        <Badge tone={roleTone[profile.role]} className="capitalize">{profile.role}</Badge>
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-ark-indigo to-ark-coral font-display font-bold">
          {profile.name.charAt(0).toUpperCase()}
        </div>
        <button onClick={handleLogout} className="rounded-xl p-2 text-slate-400 hover:bg-white/10 hover:text-ark-coral" aria-label="Logout">
          <LogOut size={20} />
        </button>
      </div>
    </header>
  );
}