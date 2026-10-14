import { createContext, useContext, useEffect, useRef, useState } from "react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
} from "firebase/auth";
import { auth } from "../firebase";
import api from "../services/api";

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const registering = useRef(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (registering.current) return;
      if (!user) {
        setProfile(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const { data } = await api.get("/api/auth/me");
        setProfile(data.user);
      } catch {
        setProfile(null);
      } finally {
        setLoading(false);
      }
    });
    return unsub;
  }, []);

  const login = (email, password) => signInWithEmailAndPassword(auth, email, password);

  const register = async ({ name, email, password, phone, role, inviteCode }) => {
  registering.current = true;
  let cred;
  let created = false;
  try {
    try {
      cred = await createUserWithEmailAndPassword(auth, email, password);
      created = true;
    } catch (e) {
      if (e.code !== "auth/email-already-in-use") throw e;
      // leftover login from an earlier failed signup: sign in and finish the profile
      cred = await signInWithEmailAndPassword(auth, email, password);
      let exists = true;
      try {
        await api.get("/api/auth/me");
      } catch (err) {
        if (err?.response?.status === 404) exists = false;
        else throw err;
      }
      if (exists) {
        await signOut(auth);
        throw new Error("This email is already registered. Please sign in.");
      }
    }
    await updateProfile(cred.user, { displayName: name });
    const { data } = await api.post("/api/auth/profile", { name, phone, role, inviteCode });
    await cred.user.getIdToken(true); // refresh token to receive the role claim
    setProfile(data.user);
  } catch (err) {
    if (created && cred?.user) await cred.user.delete().catch(() => {}); // only roll back accounts created just now
    throw err;
  } finally {
    registering.current = false;
  }
};

  const logout = async () => {
    await signOut(auth);
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{ profile, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}