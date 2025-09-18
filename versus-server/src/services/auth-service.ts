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
import { logger } from '../utils/logger';

// CRITICAL: Authentication service - handles all user security
// SECURITY: Contains password hashing, JWT generation, and user validation
// WARNING: Changes to this service must undergo security review
export class AuthService {
  private db: DatabaseProvider;
  private jwtSecret: string;
  private jwtExpiresIn: string;

  constructor(dbConfig?: DatabaseConfig) {
    // CRITICAL: Database configuration for user data storage
    const config = dbConfig || (process.env.DATABASE_URL
      ? {
          type: 'postgresql',
          connectionString: process.env.DATABASE_URL,
        }
      : {
          type: 'sqlite',
          sqlitePath: process.env.GAME_DATA_PATH
            ? `${process.env.GAME_DATA_PATH}/versus.db`
            : './game_data/versus.db',
        });

    this.db = createDatabaseProvider(config);

    // SECURITY: JWT secret validation - CRITICAL for token security
    // Ensures minimum security standards for JWT signing
    // DO NOT modify without security team approval
    if (!process.env.JWT_SECRET) {
      throw new Error('SECURITY ERROR: JWT_SECRET environment variable is required');
    }

    if (process.env.JWT_SECRET.length < 32) {
      throw new Error(
        'SECURITY ERROR: JWT_SECRET must be at least 32 characters for production security'
      );
    }

    // SECURITY: Validate JWT secret entropy
    // Prevents weak secrets that could be brute-forced
    const hasUpperCase = /[A-Z]/.test(process.env.JWT_SECRET);
    const hasLowerCase = /[a-z]/.test(process.env.JWT_SECRET);
    const hasNumbers = /\d/.test(process.env.JWT_SECRET);
    const hasSpecialChars = /[^A-Za-z0-9]/.test(process.env.JWT_SECRET);

    if (!(hasUpperCase && hasLowerCase && hasNumbers && hasSpecialChars)) {
      throw new Error(
        'SECURITY ERROR: JWT_SECRET must contain uppercase, lowercase, numbers, and special characters'
      );
    }

    this.jwtSecret = process.env.JWT_SECRET;
    this.jwtExpiresIn = process.env.JWT_EXPIRES_IN || '24h';
  }

  // API: User registration endpoint contract
  // SECURITY: Critical user creation with comprehensive validation
  async createUser(userData: CreateUserRequest): Promise<AuthResponse> {
    // SECURITY: Input validation - prevents malformed data attacks
    if (!userData.username || userData.username.length < 3) {
      throw new Error('Username must be at least 3 characters long');
    }

    // SECURITY: Username validation - prevents SQL injection and XSS
    // Regex ensures only safe characters in usernames
    if (!/^[a-zA-Z0-9_-]+$/.test(userData.username)) {
      throw new Error('Username can only contain letters, numbers, hyphens, and underscores');
    }

    if (!userData.email || !this.isValidEmail(userData.email)) {
      throw new Error('Valid email address is required');
    }

    // SECURITY: Strong password requirements - industry standard minimum
    // 12+ characters significantly improves security against brute force
    if (!userData.password || userData.password.length < 12) {
      throw new Error('Password must be at least 12 characters long');
    }

    // SECURITY: Password complexity validation - prevents weak passwords
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/;
    if (!passwordRegex.test(userData.password)) {
      throw new Error(
        'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
      );
    }

    // SECURITY: Common password check - prevents easily guessable passwords
    // TODO: Expand this list or use a proper password dictionary
    const commonPasswords = ['password123', 'admin123', 'qwerty123', 'letmein123', 'welcome123'];
    if (
      commonPasswords.some(common => userData.password.toLowerCase().includes(common.toLowerCase()))
    ) {
      throw new Error('Password is too common. Please choose a more secure password');
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

    // SECURITY: Password hashing with bcrypt - 12 rounds provides strong protection
    // PERF: 12 rounds balances security vs performance (takes ~100ms)
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

  // API: User login endpoint contract
  // SECURITY: Authentication with timing attack protection
  async login(credentials: LoginRequest): Promise<AuthResponse> {
    // SECURITY: Input validation for login credentials
    if (!credentials.username || !credentials.password) {
      throw new Error('Username and password are required');
    }

    // SECURITY: User lookup and validation
    const user = await this.getUserByUsername(credentials.username);
    if (!user) {
      // SECURITY: Generic error message prevents username enumeration
      throw new Error('Invalid credentials');
    }

    // SECURITY: Account status verification
    if (!user.isActive) {
      throw new Error('Account is deactivated');
    }

    // SECURITY: Password verification using timing-safe comparison
    // bcrypt.compare is inherently timing-safe
    const isValidPassword = await bcrypt.compare(credentials.password, user.passwordHash);
    if (!isValidPassword) {
      // SECURITY: Generic error message prevents timing attacks
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

  // SECURITY: JWT token generation - contains user identity claims
  // CRITICAL: Token contains sensitive user data, ensure proper validation
  generateToken(user: User): string {
    // SECURITY: Minimal payload to reduce token size and exposure
    const payload: JWTPayload = {
      userId: user.id,
      username: user.username,
      role: user.role,
    };

    // SECURITY: Sign with HS256 algorithm and expiration
    return jwt.sign(payload, this.jwtSecret, {
      expiresIn: this.jwtExpiresIn,
    });
  }

  // SECURITY: JWT token verification - validates token signature and expiration
  // CRITICAL: Used by auth middleware to authenticate requests
  verifyToken(token: string): JWTPayload {
    try {
      // SECURITY: Verify signature and expiration automatically
      return jwt.verify(token, this.jwtSecret) as JWTPayload;
    } catch (_error) {
      // SECURITY: Generic error message prevents token analysis
      throw new Error('Invalid or expired token');
    }
  }

  // SECURITY: User lookup by ID - used for token validation
  // PERF: Should be fast query with primary key lookup
  async getUserById(userId: string): Promise<User | null> {
    try {
      // SECURITY: Parameterized query prevents SQL injection
      const query = 'SELECT * FROM users WHERE id = ?';
      const result = await this.db.query(query, [userId]);
      return result[0] ? this.deserializeUser(result[0]) : null;
    } catch (error) {
      logger.error('Error getting user by ID', {
        userId,
        error: error instanceof Error ? error.message : error,
      });
      return null;
    }
  }

  // SECURITY: User lookup by username - used for login authentication
  // WARNING: Could be used for username enumeration attacks
  async getUserByUsername(username: string): Promise<User | null> {
    try {
      // SECURITY: Parameterized query prevents SQL injection
      const query = 'SELECT * FROM users WHERE username = ?';
      const result = await this.db.query(query, [username]);
      return result[0] ? this.deserializeUser(result[0]) : null;
    } catch (error) {
      logger.error('Error getting user by username', {
        username,
        error: error instanceof Error ? error.message : error,
      });
      return null;
    }
  }

  async getUserByEmail(email: string): Promise<User | null> {
    try {
      const query = 'SELECT * FROM users WHERE email = ?';
      const result = await this.db.query(query, [email]);
      return result[0] ? this.deserializeUser(result[0]) : null;
    } catch (error) {
      logger.error('Error getting user by email', {
        email,
        error: error instanceof Error ? error.message : error,
      });
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

  // SECURITY: Remove sensitive data before sending to client
  // CRITICAL: Must never expose password hashes to API responses
  private sanitizeUser(user: User): Omit<User, 'passwordHash'> {
    const { passwordHash: _passwordHash, ...sanitized } = user;
    return sanitized;
  }

  // SECURITY: Email validation using basic regex
  // NOTE: Basic validation, consider using a proper email validation library
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  // CRITICAL: Database schema initialization for user storage
  // SECURITY: Defines user table structure with security constraints
  async initializeUserTable(): Promise<void> {
    // Initialize database connection
    await this.db.initialize();

    // SECURITY: Table schema with UNIQUE constraints for username/email
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
      logger.error('Error creating users table', {
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }
}
