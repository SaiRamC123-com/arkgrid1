import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import { citizenNav, commandNav } from "./config/nav";
import AppLayout from "./components/layout/AppLayout";
import ProtectedRoute from "./components/layout/ProtectedRoute";
import Loader from "./components/ui/Loader";
import Login from "./pages/auth/Login";
import Home from "./pages/citizen/Home";
import Register from "./pages/auth/Register";
import Dashboard from "./pages/command/Dashboard";
import ComingSoon from "./pages/ComingSoon";
import FamilyNetwork from "./pages/citizen/FamilyNetwork";
import SOS from "./pages/citizen/SOS";
import Reports from "./pages/citizen/Reports";
import RoadMap from "./pages/citizen/Roadmap";
import Incidents from "./pages/command/Incidents";
import FloodRisk from "./pages/citizen/FloodRisk";
import Priority from "./pages/command/Priority";
import SearchZones from "./pages/command/SearchZones";
import Simulator from "./pages/command/Simulator";
import Logistics from "./pages/command/Logistics";
import Safety from "./pages/command/safety";
import About from "./pages/About";
import LiveObservations from "./pages/citizen/LiveObservations";
import HeatWave from "./pages/citizen/HeatWave";
import DisasterHistory from "./pages/citizen/DisasterHistory";
import Welcome from "./pages/auth/Welcome";

const home = (profile) => (profile.role === "citizen" ? "/citizen" : "/command");

function PublicOnly({ children }) {
  const { profile, loading } = useAuth();
  if (loading) return <Loader />;
  if (profile && profile.role !== "citizen") return <Navigate to={home(profile)} replace />;
  return children;
}

<Route path="/" element={<Welcome />} />

const live = {
  "/citizen/family": <FamilyNetwork />,
  "/citizen/sos": <SOS />,
  "/citizen/reports": <Reports />,
  "/citizen/roads": <RoadMap />,
  "/command/reports": <Reports />,
  "/command/roads": <RoadMap />,
  "/command/incidents": <Incidents />,
  "/citizen/risk": <FloodRisk />,
  "/command/risk": <FloodRisk />,
  "/command/priority": <Priority />,
  "/command/search-zones": <SearchZones />,
  "/command/simulator": <Simulator />,
  "/command/logistics": <Logistics />,
  "/command/drone-safety": <Safety />,
  "/command/observations": <LiveObservations />,
  "/command/heat-wave": <HeatWave />,
};

const sub = (nav, base) =>
  nav.slice(1).map((n) => (
    <Route
      key={n.path}
      path={n.path.replace(`${base}/`, "")}
      element={live[n.path] || <ComingSoon title={n.label} />}
    />
  ));

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />

<Route path="/register" element={<PublicOnly><Register /></PublicOnly>} />      <Route path="/" element={<RootRedirect />} />
      <Route path="/citizen/shelters" element={<Navigate to="/citizen" replace />} />
      <Route path="/command/shelters" element={<Navigate to="/command" replace />} />

      {/* Citizen area: fully public, no login */}
           {/* Citizen area: guest session is created on the Welcome screen */}
      <Route element={<ProtectedRoute roles={["citizen"]} redirectTo="/" />}>
        <Route path="/citizen" element={<AppLayout />}>
          <Route index element={<Home />} />
          <Route path="observations" element={<LiveObservations />} />
          <Route path="heat-wave" element={<HeatWave />} />
          <Route path="disaster-history" element={<DisasterHistory />} />
          {sub(
            citizenNav.filter((item) => ![
              "/citizen/observations",
              "/citizen/heat-wave",
              "/citizen/disaster-history",
            ].includes(item.path)),
            "/citizen"
          )}
        </Route>
      </Route>
      {/* Command area: login still required */}
      <Route element={<ProtectedRoute roles={["responder", "commander"]} />}>
        <Route path="/command" element={<AppLayout />}>
          <Route index element={<Dashboard />} />
          {sub(commandNav, "/command")}
        </Route>
      </Route>

      <Route path="/about" element={<AppLayout />}>
        <Route index element={<About />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}