import { useEffect, useRef, useState, useCallback } from 'react';

export function usePsWebSocket({ eventId, token, onMessage, enabled = true }) {
  const [isConnected, setIsConnected] = useState(false);
  const [isPollingFallback, setIsPollingFallback] = useState(false);
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
      const apiUrl = import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.host}`;
      const wsBase = apiUrl.replace(/^http/, 'ws').replace(/\/api\/?$/, '');
      const wsUrl = `${wsBase}/ws/ps-updates/${eventId}?token=${encodeURIComponent(token)}`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        setIsPollingFallback(false);
        retryCountRef.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (onMessageRef.current) {
            onMessageRef.current(data);
          }
        } catch (e) {
          console.error('Failed to parse WebSocket message', e);
        }
      };

      ws.onerror = () => {
        ws.close();
      };

      ws.onclose = () => {
        setIsConnected(false);
        wsRef.current = null;

        if (retryCountRef.current < 3) {
          retryCountRef.current += 1;
          const delay = Math.min(1000 * Math.pow(2, retryCountRef.current - 1), 15000);
          timeoutRef.current = setTimeout(connect, delay);
        } else {
          // Switch to polling fallback after 3 failed connection attempts
          setIsPollingFallback(true);
        }
      };
    } catch (e) {
      console.error('WebSocket connection error:', e);
      setIsPollingFallback(true);
    }
  }, [eventId, token, enabled]);

  useEffect(() => {
    if (enabled && eventId && token) {
      connect();
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [eventId, token, enabled, connect]);

  return { isConnected, isPollingFallback };
}

export default usePsWebSocket;
