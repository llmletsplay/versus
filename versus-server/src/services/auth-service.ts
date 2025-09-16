import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import {
  User,
  CreateUserRequest,
  LoginRequest,
  AuthResponse,
  JWTPayload,
  UserRole,
} from '../types/auth';
import { DatabaseProvider, createDatabaseProvider, DatabaseConfig } from '../core/database';

export class AuthService {
  private db: DatabaseProvider;
  private jwtSecret: string;
  private jwtExpiresIn: string;

  constructor() {
    // Create database configuration
    const dbConfig: DatabaseConfig = process.env.DATABASE_URL
      ? {
          type: 'postgresql',
          connectionString: process.env.DATABASE_URL,
        }
      : {
          type: 'sqlite',
          sqlitePath: process.env.GAME_DATA_PATH
            ? `${process.env.GAME_DATA_PATH}/auth.db`
            : './game_data/auth.db',
        };

    this.db = createDatabaseProvider(dbConfig);
    this.jwtSecret = process.env.JWT_SECRET || 'versus-game-server-secret-change-in-production';
    this.jwtExpiresIn = process.env.JWT_EXPIRES_IN || '24h';

    if (
      process.env.NODE_ENV === 'production' &&
      this.jwtSecret === 'versus-game-server-secret-change-in-production'
    ) {
      throw new Error('JWT_SECRET must be set in production environment');
    }
  }

  async createUser(userData: CreateUserRequest): Promise<AuthResponse> {
    // Validate input
    if (!userData.username || userData.username.length < 3) {
      throw new Error('Username must be at least 3 characters long');
    }
    if (!userData.email || !this.isValidEmail(userData.email)) {
      throw new Error('Valid email address is required');
    }
    if (!userData.password || userData.password.length < 6) {
      throw new Error('Password must be at least 6 characters long');
    }

    // Check if user already exists
    const existingUser = await this.getUserByUsername(userData.username);
    if (existingUser) {
      throw new Error('Username already exists');
    }

    const existingEmail = await this.getUserByEmail(userData.email);
    if (existingEmail) {
      throw new Error('Email already registered');
    }

    // Hash password
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(userData.password, saltRounds);

    // Create user
    const user: User = {
      id: uuidv4(),
      username: userData.username,
      email: userData.email,
      passwordHash,
      createdAt: new Date(),
      updatedAt: new Date(),
      isActive: true,
      role: 'player',
    };

    // Save user to database
    await this.saveUser(user);

    // Generate token
    const token = this.generateToken(user);

    return {
      token,
      user: this.sanitizeUser(user),
    };
  }

  async login(credentials: LoginRequest): Promise<AuthResponse> {
    if (!credentials.username || !credentials.password) {
      throw new Error('Username and password are required');
    }

    // Get user by username
    const user = await this.getUserByUsername(credentials.username);
    if (!user) {
      throw new Error('Invalid credentials');
    }

    if (!user.isActive) {
      throw new Error('Account is deactivated');
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(credentials.password, user.passwordHash);
    if (!isValidPassword) {
      throw new Error('Invalid credentials');
    }

    // Update last login
    user.updatedAt = new Date();
    await this.updateUser(user);

    // Generate token
    const token = this.generateToken(user);

    return {
      token,
      user: this.sanitizeUser(user),
    };
  }

  generateToken(user: User): string {
    const payload: JWTPayload = {
      userId: user.id,
      username: user.username,
      role: user.role,
    };

    return jwt.sign(payload, this.jwtSecret, {
      expiresIn: this.jwtExpiresIn,
    });
  }

  verifyToken(token: string): JWTPayload {
    try {
      return jwt.verify(token, this.jwtSecret) as JWTPayload;
    } catch (error) {
      throw new Error('Invalid or expired token');
    }
  }

  async getUserById(userId: string): Promise<User | null> {
    try {
      const query = 'SELECT * FROM users WHERE id = ?';
      const result = await this.db.query(query, [userId]);
      return result[0] ? this.deserializeUser(result[0]) : null;
    } catch (error) {
      console.error('Error getting user by ID:', error);
      return null;
    }
  }

  async getUserByUsername(username: string): Promise<User | null> {
    try {
      const query = 'SELECT * FROM users WHERE username = ?';
      const result = await this.db.query(query, [username]);
      return result[0] ? this.deserializeUser(result[0]) : null;
    } catch (error) {
      console.error('Error getting user by username:', error);
      return null;
    }
  }

  async getUserByEmail(email: string): Promise<User | null> {
    try {
      const query = 'SELECT * FROM users WHERE email = ?';
      const result = await this.db.query(query, [email]);
      return result[0] ? this.deserializeUser(result[0]) : null;
    } catch (error) {
      console.error('Error getting user by email:', error);
      return null;
    }
  }

  private async saveUser(user: User): Promise<void> {
    const query = `
      INSERT INTO users (id, username, email, password_hash, created_at, updated_at, is_active, role)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await this.db.query(query, [
      user.id,
      user.username,
      user.email,
      user.passwordHash,
      user.createdAt.toISOString(),
      user.updatedAt.toISOString(),
      user.isActive ? 1 : 0,
      user.role,
    ]);
  }

  private async updateUser(user: User): Promise<void> {
    const query = `
      UPDATE users
      SET username = ?, email = ?, password_hash = ?, updated_at = ?, is_active = ?, role = ?
      WHERE id = ?
    `;

    await this.db.query(query, [
      user.username,
      user.email,
      user.passwordHash,
      user.updatedAt.toISOString(),
      user.isActive ? 1 : 0,
      user.role,
      user.id,
    ]);
  }

  private deserializeUser(row: any): User {
    return {
      id: row.id,
      username: row.username,
      email: row.email,
      passwordHash: row.password_hash,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      isActive: Boolean(row.is_active),
      role: row.role as UserRole,
    };
  }

  private sanitizeUser(user: User): Omit<User, 'passwordHash'> {
    const { passwordHash, ...sanitized } = user;
    return sanitized;
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  async initializeUserTable(): Promise<void> {
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        is_active INTEGER DEFAULT 1,
        role TEXT DEFAULT 'player'
      )
    `;

    try {
      await this.db.query(createTableQuery);
    } catch (error) {
      console.error('Error creating users table:', error);
      throw error;
    }
  }
}
