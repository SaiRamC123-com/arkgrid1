import { Component } from "react";
import { TriangleAlert, RefreshCw } from "lucide-react";

export default class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error("UI error:", error, info); }

  render() {
    if (!this.state.error) return this.props.children;
    const card = (
      <div className="glass mx-auto max-w-md p-8 text-center">
        <TriangleAlert size={34} className="mx-auto text-ark-coral" />
        <h2 className="mt-4 font-display text-2xl font-bold">Something went wrong</h2>
        <p className="mt-2 text-sm text-slate-400">
          This screen hit an unexpected error. Your data is safe, and SOS still works from the SOS page.
        </p>
        {import.meta.env.DEV && <pre className="mt-3 overflow-x-auto rounded-xl bg-white/5 p-3 text-left text-xs text-ark-coral">{String(this.state.error?.message)}</pre>}
        <div className="mt-5 flex justify-center gap-3">
          <button onClick={() => window.location.reload()} className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-ark-indigo to-ark-cyan px-5 py-2.5 text-sm font-semibold">
            <RefreshCw size={15} /> Reload
          </button>
          <a href="/" className="rounded-xl border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-semibold hover:bg-white/10">Home</a>
        </div>
      </div>
    );
    return this.props.inline ? <div className="pt-10">{card}</div> : <div className="flex min-h-screen items-center justify-center p-6">{card}</div>;
  }
}