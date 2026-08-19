import { useEffect, useRef, useState, useCallback } from "react";

/**
 * useCheckinWebSocket
 * Connects to /ws/ps-updates/{eventId} and listens for checkin_update messages.
 * The backend broadcasts both ps_capacity_update and checkin_update on the same channel.
 */
export function useCheckinWebSocket({ eventId, token, onMessage, enabled = true }) {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef(null);
  const retryCountRef = useRef(0);
  const timeoutRef = useRef(null);

  const onMessageRef = useRef(onMessage);
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  const connect = useCallback(() => {
    if (!eventId || !token || !enabled) return;

    try {
      let wsBase;
      if (import.meta.env.VITE_API_URL) {
        wsBase = import.meta.env.VITE_API_URL.replace(/^http/, 'ws').replace(/\/api\/?$/, '');
      } else {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.hostname || 'localhost';
        wsBase = `${protocol}//${host}:8000`;
      }
      const wsUrl = `${wsBase}/ws/ps-updates/${eventId}?token=${encodeURIComponent(token)}`;


      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        retryCountRef.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (onMessageRef.current) onMessageRef.current(data);
        } catch (e) {
          console.error("[useCheckinWebSocket] Failed to parse message", e);
        }
      };

      ws.onerror = () => { ws.close(); };

      ws.onclose = () => {
        setIsConnected(false);
        wsRef.current = null;
        if (retryCountRef.current < 5) {
          retryCountRef.current += 1;
          const delay = Math.min(1000 * Math.pow(2, retryCountRef.current - 1), 20000);
          timeoutRef.current = setTimeout(connect, delay);
        }
      };
    } catch (e) {
      console.error("[useCheckinWebSocket] Connection error:", e);
    }
  }, [eventId, token, enabled]);

  useEffect(() => {
    if (enabled && eventId && token) connect();
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [eventId, token, enabled, connect]);

  return { isConnected };
}

export default useCheckinWebSocket;
