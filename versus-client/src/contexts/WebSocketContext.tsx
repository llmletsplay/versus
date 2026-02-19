import { createContext, useContext, ReactNode } from "react";
import { useWebSocket, UseWebSocketReturn } from "../hooks/useWebSocket";
import { useAuth } from "../hooks/useAuth";

const WebSocketContext = createContext<UseWebSocketReturn | undefined>(undefined);

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const ws = useWebSocket(token);

  return (
    <WebSocketContext.Provider value={ws}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWS(): UseWebSocketReturn {
  const context = useContext(WebSocketContext);
  if (context === undefined) {
    throw new Error("useWS must be used within a WebSocketProvider");
  }
  return context;
}
