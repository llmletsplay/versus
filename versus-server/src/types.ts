import type { Context } from 'hono';

export interface Variables {
  user?: {
    userId: string;
    email: string;
    role: string;
    token?: string;
  };
  db?: any;
}
