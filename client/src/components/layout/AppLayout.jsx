import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "../../context/AuthContext";
import { citizenNav, commandNav, publicCitizenNav } from "../../config/nav";
import Sidebar from "./Sidebar";
import Navbar from "./Navbar";
import SyncManager from "./SyncManager";
import TelemetryManager from "./TelemetryManager";
import AdvisoryBanner from "./AdvisoryBanner";
import NetworkBanner from "./NetworkBanner";
import LocationHistoryRecorder from "./LocationHistoryRecorder";
import ErrorBoundary from "./ErrorBoundary";
import AuroraBackground from "../ui/AuroraBackground";
import ChatOrb from "../chatbot/ChatOrb";
import ChatWindow from "../chatbot/ChatWindow";

export default function AppLayout() {
  const { profile } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  const items = !profile
    ? publicCitizenNav
    : profile.role === "citizen"
      ? citizenNav
      : commandNav;

  return (
    <div className="min-h-screen">
      <AuroraBackground />
      <SyncManager />
      {profile?.uid && <LocationHistoryRecorder uid={profile.uid} />}
      {profile && profile.role !== "citizen" && <TelemetryManager />}

      <aside className="fixed inset-y-0 left-0 z-20 hidden w-72 border-r border-slate-200 bg-white shadow-sm lg:block">
        <Sidebar items={items} showAbout={Boolean(profile)} />
      </aside>

      <AnimatePresence>
        {open && (
          <motion.div key="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setOpen(false)} className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden" />
        )}
        {open && (
          <motion.aside key="drawer" initial={{ x: -300 }} animate={{ x: 0 }} exit={{ x: -300 }}
            transition={{ type: "spring", damping: 25, stiffness: 220 }}
            className="fixed inset-y-0 left-0 z-50 w-72 border-r border-slate-200 bg-white shadow-xl lg:hidden">
            <Sidebar items={items} onNavigate={() => setOpen(false)} showAbout={Boolean(profile)} />
          </motion.aside>
        )}
      </AnimatePresence>

      <div className="lg:pl-72">
        <NetworkBanner />
        <Navbar onMenu={() => setOpen(true)} />
        <main className="p-4 sm:p-8">
          {profile && <AdvisoryBanner />}
          <ErrorBoundary key={location.pathname} inline>
            <motion.div key={location.pathname} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
              <Outlet />
            </motion.div>
          </ErrorBoundary>
        </main>
      </div>

      {profile && !chatOpen && <ChatOrb onClick={() => setChatOpen(true)} />}
      {profile && <ChatWindow open={chatOpen} onClose={() => setChatOpen(false)} />}
    </div>
  );
}