import {
  useState,
  useEffect,
  createContext,
  useContext,
  useCallback,
  ReactNode,
} from "react";
import type { User } from "../types/auth";
import { authApi } from "../services/api-client";

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(
    () => localStorage.getItem("auth_token")
  );
  const [isLoading, setIsLoading] = useState(true);

  // Validate stored token on mount
  useEffect(() => {
    const storedToken = localStorage.getItem("auth_token");
    if (storedToken) {
      authApi.me().then((response) => {
        if (response.data) {
          setUser(response.data);
          setToken(storedToken);
        } else {
          // Token is invalid, clear it
          localStorage.removeItem("auth_token");
          setToken(null);
        }
        setIsLoading(false);
      }).catch(() => {
        localStorage.removeItem("auth_token");
        setToken(null);
        setIsLoading(false);
      });
    } else {
      setIsLoading(false);
    }
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    setIsLoading(true);
    try {
      const response = await authApi.login({ username, password });

      if (response.data) {
        setUser(response.data.user);
        setToken(response.data.token);
        localStorage.setItem("auth_token", response.data.token);
      } else {
        throw new Error(response.error || "Login failed");
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  const register = useCallback(async (username: string, email: string, password: string) => {
    setIsLoading(true);
    try {
      const response = await authApi.register({ username, email, password });

      if (response.data) {
        setUser(response.data.user);
        setToken(response.data.token);
        localStorage.setItem("auth_token", response.data.token);
      } else {
        throw new Error(response.error || "Registration failed");
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    localStorage.removeItem("auth_token");
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, login, register, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
