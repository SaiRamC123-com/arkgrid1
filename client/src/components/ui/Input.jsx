import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

export default function Input({ label, icon: Icon, type = "text", ...props }) {
  const [show, setShow] = useState(false);
  const isPw = type === "password";

  return (
    <label className="block">
      {label && (
        <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-400">
          {label}
        </span>
      )}
      <div className="relative">
        {Icon && <Icon size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />}
        <input
          type={isPw && show ? "text" : type}
          className={`input-glass ${Icon ? "pl-11" : ""} ${isPw ? "pr-11" : ""}`}
          {...props}
        />
        {isPw && (
          <button
            type="button"
            onClick={() => setShow(!show)}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
          >
            {show ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        )}
      </div>
    </label>
  );
}