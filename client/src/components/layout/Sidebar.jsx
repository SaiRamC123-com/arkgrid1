import { NavLink } from "react-router-dom";
import Logo from "../ui/Logo";

export default function Sidebar({ items, onNavigate, showAbout = true }) {
  return (
    <div className="flex h-full flex-col gap-7 bg-white p-5">
      <Logo />
      <nav className="flex flex-col gap-1.5">
        {items.map(({ path, label, icon: Icon, end }) => (
          <NavLink
            key={path}
            to={path}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
                            `nav-item flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium ${
                isActive
                  ? "nav-item-active"
                  : "border-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              }`
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="glass mt-auto p-4 text-xs leading-relaxed text-slate-400">
        {showAbout ? (
          <>
            Decision-support only. Search zones are area guidance, not exact tracking.
            <NavLink to="/about" onClick={onNavigate} className="mt-3 block font-semibold text-ark-cyan hover:underline">
              About, models and data
            </NavLink>
          </>
        ) : "Public information view. Sign in to access personal safety features."}
      </div>
    </div>
  );
}