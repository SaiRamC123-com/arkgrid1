import { NavLink } from "react-router-dom";
import Logo from "../ui/Logo";

export default function Sidebar({ items, onNavigate }) {
  return (
    <div className="flex h-full flex-col gap-8 p-5">
      <Logo />
      <nav className="flex flex-col gap-1.5">
        {items.map(({ path, label, icon: Icon, end }) => (
          <NavLink
            key={path}
            to={path}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium transition-all ${
                isActive
                  ? "border-ark-cyan/40 bg-gradient-to-r from-ark-indigo/30 to-ark-cyan/20 text-white shadow-glow-indigo"
                  : "border-transparent text-slate-400 hover:bg-white/5 hover:text-white"
              }`
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="glass mt-auto p-4 text-xs leading-relaxed text-slate-400">
        Decision-support only. Search zones are area guidance, not exact tracking.
        <NavLink to="/about" onClick={onNavigate} className="mt-3 block font-semibold text-ark-cyan hover:underline">
  About, models and data
</NavLink>
      </div>
    </div>
  );
}