import { useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { apiBaseUrl } from "../services/api.js";

export default function useQueueUpdates(organizationId, onUpdate) {
  const { user } = useAuth();
  const callbackRef = useRef(onUpdate);
  callbackRef.current = onUpdate;

  useEffect(() => {
    if (!organizationId || !user) return undefined;
    let active = true;
    let socket;
    let retryTimer;
    let retryDelay = 1000;

    function connect() {
      if (!active) return;
      const token = localStorage.getItem("queueless.accessToken");
      if (!token) return;
      const apiBase = new URL(apiBaseUrl);
      const protocol = apiBase.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(
        `${protocol}//${apiBase.host}/ws/organizations/${organizationId}/queue?token=${encodeURIComponent(token)}`,
      );
      socket.onopen = () => { retryDelay = 1000; };
      socket.onmessage = () => callbackRef.current?.();
      socket.onclose = () => {
        if (!active) return;
        retryTimer = window.setTimeout(connect, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 30000);
      };
      socket.onerror = () => socket.close();
    }

    connect();
    return () => {
      active = false;
      window.clearTimeout(retryTimer);
      socket?.close();
    };
  }, [organizationId, user]);
}
