import { useEffect, useRef, useState, useCallback } from 'react';
import api from '../services/api';

export function usePsWebSocket({ eventId, token, onMessage, enabled = true }) {
  const [isConnected, setIsConnected] = useState(false);
  const [isPollingFallback, setIsPollingFallback] = useState(false);
  const wsRef = useRef(null);
  const retryCountRef = useRef(0);
  const timeoutRef = useRef(null);
  const pollIntervalRef = useRef(null);

  const onMessageRef = useRef(onMessage);
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  const pollProblemStatements = useCallback(async () => {
    if (!eventId || !enabled) return;
    try {
      const res = await api.get('/admin/problem-statements');
      if (res.data && Array.isArray(res.data) && onMessageRef.current) {
        res.data.forEach((ps) => {
          onMessageRef.current({
            type: 'ps_capacity_update',
            psId: ps.id,
            selectedCount: ps.selectedCount || 0,
            remainingCapacity: ps.remainingCapacity || 0
          });
        });
      }
    } catch (e) {
      // Silent catch
    }
  }, [eventId, enabled]);

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
          // Silent
        }
      };

      ws.onerror = () => {
        try { ws.close(); } catch (e) {}
      };

      ws.onclose = () => {
        setIsConnected(false);
        wsRef.current = null;

        if (retryCountRef.current < 1) {
          retryCountRef.current += 1;
          timeoutRef.current = setTimeout(connect, 3000);
        } else {
          setIsPollingFallback(true);
        }
      };
    } catch (e) {
      setIsPollingFallback(true);
    }
  }, [eventId, token, enabled]);

  useEffect(() => {
    if (enabled && eventId && token) {
      connect();
    }

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (wsRef.current) {
        try { wsRef.current.close(); } catch (e) {}
      }
    };
  }, [eventId, token, enabled, connect]);

  useEffect(() => {
    if (isPollingFallback && enabled) {
      pollProblemStatements();
      pollIntervalRef.current = setInterval(pollProblemStatements, 12000);
      return () => {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      };
    }
  }, [isPollingFallback, enabled, pollProblemStatements]);

  return { isConnected, isPollingFallback };
}

export default usePsWebSocket;

