import { useState, useEffect, useRef, useCallback } from "react";
import type { WSEventType, WSMessage } from "../types/websocket";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5556";

function getWsUrl(token: string): string {
  const url = new URL(API_BASE_URL);
  const protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${url.host}/ws?token=${encodeURIComponent(token)}`;
}

type EventHandler = (data: unknown, roomId?: string) => void;

export interface UseWebSocketReturn {
  isConnected: boolean;
  subscribe: (event: WSEventType, handler: EventHandler) => () => void;
  send: (event: WSEventType, data: unknown, roomId?: string) => void;
  joinRoom: (roomId: string) => void;
  leaveRoom: (roomId: string) => void;
}

export function useWebSocket(token: string | null): UseWebSocketReturn {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef<Map<WSEventType, Set<EventHandler>>>(new Map());
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const reconnectDelayRef = useRef(1000);
  const mountedRef = useRef(true);

  const dispatch = useCallback((event: WSEventType, data: unknown, roomId?: string) => {
    const handlers = handlersRef.current.get(event);
    if (handlers) {
      handlers.forEach((handler) => handler(data, roomId));
    }
  }, []);

  const send = useCallback((event: WSEventType, data: unknown, roomId?: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const message: { event: WSEventType; data: unknown; roomId?: string } = { event, data };
      if (roomId) message.roomId = roomId;
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  const connect = useCallback((authToken: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(getWsUrl(authToken));

    ws.onopen = () => {
      if (!mountedRef.current) { ws.close(); return; }
      setIsConnected(true);
      reconnectDelayRef.current = 1000; // Reset backoff
    };

    ws.onmessage = (event) => {
      try {
        const msg: WSMessage = JSON.parse(event.data);
        // Auto-respond to pings
        if (msg.event === "system:ping") {
          send("system:pong", {});
          return;
        }
        dispatch(msg.event, msg.data, msg.roomId);
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      setIsConnected(false);
      wsRef.current = null;

      // Reconnect with exponential backoff
      const delay = reconnectDelayRef.current;
      reconnectTimeoutRef.current = setTimeout(() => {
        if (mountedRef.current) {
          reconnectDelayRef.current = Math.min(delay * 2, 30000);
          connect(authToken);
        }
      }, delay);
    };

    ws.onerror = () => {
      // onclose will fire after this, handling reconnect
    };

    wsRef.current = ws;
  }, [dispatch, send]);

  useEffect(() => {
    mountedRef.current = true;

    if (token) {
      connect(token);
    }

    return () => {
      mountedRef.current = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [token, connect]);

  const subscribe = useCallback((event: WSEventType, handler: EventHandler): (() => void) => {
    if (!handlersRef.current.has(event)) {
      handlersRef.current.set(event, new Set());
    }
    handlersRef.current.get(event)!.add(handler);

    return () => {
      const handlers = handlersRef.current.get(event);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          handlersRef.current.delete(event);
        }
      }
    };
  }, []);

  const joinRoom = useCallback((roomId: string) => {
    send("room:join", {}, roomId);
  }, [send]);

  const leaveRoom = useCallback((roomId: string) => {
    send("room:leave", {}, roomId);
  }, [send]);

  return { isConnected, subscribe, send, joinRoom, leaveRoom };
}
