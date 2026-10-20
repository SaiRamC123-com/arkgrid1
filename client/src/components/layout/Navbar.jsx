import { LogIn, LogOut, Menu } from "lucide-react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { useAuth } from "../../context/AuthContext";
import Badge from "../ui/Badge";

const roleTone = { citizen: "cyan", responder: "indigo", commander: "coral" };

export default function Navbar({ onMenu }) {
  const { profile, logout } = useAuth();
  const handleLogout = async () => {
    await logout();
    toast.success("Logged out safely");
  };

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur-xl sm:px-8">
      <button onClick={onMenu} className="rounded-xl p-2 text-slate-600 hover:bg-slate-100 lg:hidden" aria-label="Menu">
        <Menu size={22} />
      </button>
      <div className="hidden lg:block" />

      <div className="flex items-center gap-3">
        {profile ? (
          <>
            <Badge tone={roleTone[profile.role]} className="capitalize">{profile.role}</Badge>
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 font-display font-bold text-blue-800">
              {profile.name.charAt(0).toUpperCase()}
            </div>
          <button onClick={handleLogout} className="rounded-xl p-2 text-slate-500 hover:bg-red-50 hover:text-red-700" aria-label="Logout">
            <LogOut size={20} />
          </button>
          </>
        ) : (
          <Link to="/login" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
            <LogIn size={15} /> Account sign in
          </Link>
        )}
      </div>
    </header>
  );
}