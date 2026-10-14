import Logo from "./Logo";

export default function Loader() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-6">
      <div className="relative h-20 w-20">
        <div
          className="absolute inset-0 animate-spin-slow rounded-full"
          style={{ background: "conic-gradient(#6366F1,#22D3EE,#FF5A6E,#6366F1)" }}
        />
        <div className="absolute inset-1 flex items-center justify-center rounded-full bg-navy-900">
          <Logo size={34} text={false} />
        </div>
      </div>
      <p className="text-sm tracking-widest text-slate-400">LOADING ARKGRID</p>
    </div>
  );
}