export type UserRole = 'player' | 'admin' | 'agent';

export interface User {
  id: string;
  username: string;
  email: string;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
  role: UserRole;
  isAgent: boolean;
  agentId: string | null;
  walletAddress: string | null;
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}
