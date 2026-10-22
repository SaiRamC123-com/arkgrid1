import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import Loader from "../ui/Loader";

export default function ProtectedRoute({ roles, redirectTo = "/login" }) {
  const { profile, loading } = useAuth();

  if (loading) return <Loader />;
  if (!profile) return <Navigate to={redirectTo} replace />;
  if (roles && !roles.includes(profile.role)) return <Navigate to="/" replace />;
  return <Outlet />;
}