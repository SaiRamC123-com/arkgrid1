import { FlaskConical, Database, Lock, Scale, ShieldCheck } from "lucide-react";
import GlassCard from "../components/ui/GlassCard";
import Badge from "../components/ui/Badge";

const MODELS = [
  { n: "01", name: "Flood risk scoring", how: "Gradient-boosted classifier over elevation, slope, local relief, height above the lowest ground, assumed soil permeability and rainfall.", out: "4-tier susceptibility mask", data: "By default trained on synthetic labels from a documented heuristic (a demo). You can retrain on a real flood-extent dataset.", status: "Prototype. Not validated against real flood events." },
  { n: "02", name: "Incident clustering", how: "DBSCAN (optionally HDBSCAN) over space and time, 150 m and 60 min by default.", out: "Macro-incidents from scattered SOS and reports", data: "No training. Parameters are starting values and are not tuned on real incidents.", status: "Working method. Parameters unvalidated." },
  { n: "03", name: "Search zone estimator", how: "Monte Carlo drift over terrain with elevation weighting, optionally steered by an assessed flow vector.", out: "50 / 75 / 90% probability areas", data: "No training. Drift speeds, walking speeds and decay lengths are assumptions.", status: "Prototype. Not validated against search outcomes." },
  { n: "04", name: "Rescue prioritization", how: "Transparent weighted score over severity, headcount, vulnerability, waiting time and flood hazard, with a rank-stability check.", out: "Sorted triage score with per-criterion breakdown", data: "No training. Weights are adjustable starting assumptions.", status: "Decision support. Weights need expert agreement." },
];

const SOURCES = [
  "Elevation: Copernicus DEM GLO-90 (about 90 m), served by Open-Meteo.com, or your own GeoTIFF.",
  "Weather and rainfall: Open-Meteo.com.",
  "Map tiles: © OpenStreetMap contributors, © CARTO. Routing: OSRM public demo servers.",
  "Ground truth: reports, roads, SOS and infrastructure entered by citizens, responders and commanders.",
  "ArkBot: a large language model through Groq, answering only from live ArkGrid data. It can make mistakes.",
];

const BEFORE = [
  "Benchmark each model against public datasets such as Copernicus EMS flood extents, USGS 3DEP and OpenStreetMap, with a spatial hold-out.",
  "Agree triage weights, supply rates and safety margins with the responsible agency.",
  "Connect official alert channels (SMS, sirens, broadcast). In-app advisories only reach people using the app.",
  "Run a privacy and security review, and set data-retention rules for SOS, medical and location data.",
  "Test with real responders in drills, including offline conditions and low-end phones.",
];

export default function About() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold">About, <span className="text-gradient">models and data</span></h1>
        <p className="mt-1 text-sm text-slate-400">What ArkGrid computes, from what, and how much to trust it.</p>
      </div>

      <GlassCard className="border-ark-coral/40">
        <h3 className="flex items-center gap-2 font-display text-lg font-semibold text-ark-coral"><Scale size={18} /> Academic and technical integrity</h3>
        <p className="mt-2 text-sm text-slate-300">
          These are proposed prototype architectures. Models need training and benchmarking against public datasets before anyone relies on them, and no accuracy percentage is claimed anywhere in ArkGrid. Decision-support tools show their assumptions, and final judgement belongs to human incident chiefs.
        </p>
      </GlassCard>

      <div className="space-y-4">
        {MODELS.map((m) => (
          <GlassCard key={m.n} className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-lg bg-white/10 px-2.5 py-1 font-display text-xs font-bold text-ark-cyan">MODEL {m.n}</span>
              <h3 className="font-display text-lg font-semibold">{m.name}</h3>
              <Badge tone="indigo"><FlaskConical size={12} /> {m.status}</Badge>
            </div>
            <p className="text-sm text-slate-300"><b className="text-slate-100">How:</b> {m.how}</p>
            <p className="text-sm text-slate-300"><b className="text-slate-100">Output:</b> {m.out}</p>
            <p className="text-sm text-slate-300"><b className="text-slate-100">Training data:</b> {m.data}</p>
          </GlassCard>
        ))}
        <p className="px-1 text-xs text-slate-500">The What-If Simulator reuses Model 01 for rainfall scenarios and adds a connected-bathtub surge model. The 90 m terrain has vertical errors of several metres, so use it to compare scenarios rather than to read exact depths.</p>
      </div>

      <GlassCard>
        <h3 className="flex items-center gap-2 font-display text-lg font-semibold"><Database size={18} className="text-ark-cyan" /> Data sources and attribution</h3>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-slate-300">{SOURCES.map((s) => <li key={s}>{s}</li>)}</ul>
      </GlassCard>

      <GlassCard>
        <h3 className="flex items-center gap-2 font-display text-lg font-semibold"><Lock size={18} className="text-ark-indigo" /> Privacy</h3>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-slate-300">
          <li>Family circle members see each other's status and last known location. Nobody else does.</li>
          <li>An active SOS, including the medical profile you saved, is visible to responders and commanders only.</li>
          <li>Report photos are re-encoded on your device, which removes embedded GPS metadata, and are stored with unguessable links.</li>
          <li>Responders' live location is shared only while they switch sharing on.</li>
          <li>All data access goes through the ArkGrid API. The database refuses direct access from apps.</li>
        </ul>
      </GlassCard>

      <GlassCard>
        <h3 className="flex items-center gap-2 font-display text-lg font-semibold"><ShieldCheck size={18} className="text-ark-cyan" /> Before real-world use</h3>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-slate-300">{BEFORE.map((s) => <li key={s}>{s}</li>)}</ul>
      </GlassCard>
    </div>
  );
}