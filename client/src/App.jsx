import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import { citizenNav, commandNav } from "./config/nav";
import AppLayout from "./components/layout/AppLayout";
import ProtectedRoute from "./components/layout/ProtectedRoute";
import Loader from "./components/ui/Loader";
import Login from "./pages/auth/Login";
import Register from "./pages/auth/Register";
import Home from "./pages/citizen/Home";
import Dashboard from "./pages/command/Dashboard";
import ComingSoon from "./pages/ComingSoon";
import FamilyNetwork from "./pages/citizen/FamilyNetwork";
import SOS from "./pages/citizen/SOS";
import Shelters from "./pages/citizen/Shelters";
import Reports from "./pages/citizen/Reports";
import RoadMap from "./pages/citizen/Roadmap";
import Incidents from "./pages/command/Incidents";
import FloodRisk from "./pages/citizen/FloodRisk";
import Priority from "./pages/command/Priority";
import SearchZones from "./pages/command/SearchZones";
import Simulator from "./pages/command/Simulator";
import Logistics from "./pages/command/Logistics";
import Safety from "./pages/command/Safety";
import About from "./pages/About";


const home = (profile) => (profile.role === "citizen" ? "/citizen" : "/command");

function PublicOnly({ children }) {
  const { profile, loading } = useAuth();
  if (loading) return <Loader />;
  if (profile) return <Navigate to={home(profile)} replace />;
  return children;
}

function RootRedirect() {
  const { profile, loading } = useAuth();
  if (loading) return <Loader />;
  return <Navigate to={profile ? home(profile) : "/login"} replace />;
}

const live = {
  "/citizen/family": <FamilyNetwork />,
  "/citizen/sos": <SOS />,
  "/citizen/shelters": <Shelters />,
"/citizen/reports": <Reports />,
  "/citizen/roads": <RoadMap />,
  "/command/shelters": <Shelters />,
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
      <Route path="/register" element={<PublicOnly><Register /></PublicOnly>} />
      <Route path="/" element={<RootRedirect />} />

      <Route element={<ProtectedRoute roles={["citizen"]} />}>
        <Route path="/citizen" element={<AppLayout />}>
          <Route index element={<Home />} />
          {sub(citizenNav, "/citizen")}
        </Route>
      </Route>

      <Route element={<ProtectedRoute roles={["responder", "commander"]} />}>
        <Route path="/command" element={<AppLayout />}>
          <Route index element={<Dashboard />} />
          {sub(commandNav, "/command")}
        </Route>
        </Route>
        <Route element={<ProtectedRoute />}>
  <Route path="/about" element={<AppLayout />}>
    <Route index element={<About />} />
  </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}