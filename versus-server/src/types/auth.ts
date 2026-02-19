export interface User {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
  role: UserRole;
  /** If this user represents an AI agent */
  isAgent: boolean;
  /** Reference to agent_registry.id */
  agentId: string | null;
  /** Wallet address for crypto operations */
  walletAddress: string | null;
}

export type UserRole = 'player' | 'admin' | 'agent';

export interface CreateUserRequest {
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
  user: Omit<User, 'passwordHash'>;
}

export interface JWTPayload {
  userId: string;
  username: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}

export interface AuthenticatedRequest extends Request {
  user?: JWTPayload;
}
