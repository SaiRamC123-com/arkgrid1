import { useCallback, useEffect, useRef, useState } from "react";
import api from "../services/api";

export default function useBackendStatus(online) {
  const [status, setStatus] = useState("checking");
  const requestRef = useRef(null);

  const check = useCallback(async () => {
    if (!online) {
      requestRef.current?.abort();
      requestRef.current = null;
      return;
    }
    if (requestRef.current) return;
    const controller = new AbortController();
    requestRef.current = controller;
    try {
      const response = await api.get("/api/health", { timeout: 5000, signal: controller.signal });
      setStatus(response.data?.status === "ok" ? "available" : "unavailable");
    } catch {
      if (!controller.signal.aborted) setStatus("unavailable");
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
    }
  }, [online]);

  useEffect(() => {
    check();
    if (!online) return undefined;
    const timer = window.setInterval(check, 30000);
    return () => {
      window.clearInterval(timer);
      requestRef.current?.abort();
      requestRef.current = null;
    };
  }, [check, online]);

  if (!online) return "offline";
  return status === "offline" ? "checking" : status;
}
