import type { Context } from 'hono';
import { DatabaseProvider } from '../core/database.js';
import { logger } from '../utils/logger.js';

export type X402Network = 'base' | 'ethereum' | 'arbitrum' | 'solana' | 'near';
export type X402Scheme = 'exact' | 'upto';

export interface X402PaymentConfig {
  enabled: boolean;
  settlementAddress: string;
  facilitatorUrl?: string;
  defaultAsset?: string;
  defaultNetwork?: X402Network;
}

export interface X402PaymentRequirement {
  version: '1';
  scheme: X402Scheme;
  network: X402Network;
  asset: string;
  amount: string;
  recipient: string;
  description: string;
  deadline?: number;
}

export interface X402PaymentPayload {
  signature: string;
  payload: {
    scheme: string;
    network: string;
    from: string;
    to: string;
    amount: string;
    timestamp: number;
    deadline: number;
    nonce: string;
    metadata?: Record<string, unknown>;
  };
}

export interface X402PaymentRecord {
  id: string;
  reference: string;
  scheme: X402Scheme;
  network: X402Network;
  asset: string;
  amount: string;
  recipient: string;
  payer?: string;
  status: 'pending' | 'verified' | 'settled' | 'failed';
  description: string;
  deadline?: number;
  createdAt: string;
  settledAt?: string;
}

/**
 * x402 v2 Payment Service for VERSUS Platform
 * 
 * Implements x402 HTTP-native payments protocol for agent-to-agent microtransactions.
 * Compatible with x402 facilitators like x402.org
 */
export class X402PaymentService {
  private readonly db: DatabaseProvider;
  private readonly config: X402PaymentConfig;

  constructor(db: DatabaseProvider, config: X402PaymentConfig) {
    this.db = db;
    this.config = {
      enabled: config.enabled ?? false,
      settlementAddress: config.settlementAddress,
      facilitatorUrl: config.facilitatorUrl ?? 'https://x402.org/facilitator',
      defaultAsset: config.defaultAsset ?? '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC on Base
      defaultNetwork: config.defaultNetwork ?? 'base',
    };
  }

  async initialize(): Promise<void> {
    // Initialize database table
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS x402_payments (
        id TEXT PRIMARY KEY,
        reference TEXT NOT NULL UNIQUE,
        scheme TEXT NOT NULL,
        network TEXT NOT NULL,
        asset TEXT NOT NULL,
        amount TEXT NOT NULL,
        recipient TEXT NOT NULL,
        description TEXT NOT NULL,
        payer TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        deadline INTEGER,
        created_at TEXT NOT NULL,
        settled_at TEXT
      )
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_x402_reference ON x402_payments(reference)
    `);

    logger.info('x402 payment service initialized', {
      enabled: this.config.enabled,
      settlementAddress: this.config.settlementAddress,
      network: this.config.defaultNetwork,
      facilitatorUrl: this.config.facilitatorUrl,
    });
  }

  /**
   * Create x402 middleware for Hono
   * Checks for payment header and verifies with facilitator
   */
  createMiddleware() {
    return async (c: Context, next: () => Promise<void>) => {
      if (!this.config.enabled) {
        c.set('paymentVerified', true);
        return next();
      }

      // Check for payment header
      const paymentHeader = c.req.header('X-402-Payment') || c.req.header('payment-signature');
      
      if (!paymentHeader) {
        // No payment provided, return 402
        return this.create402Response(c);
      }

      try {
        // Verify payment with facilitator
        const paymentPayload: X402PaymentPayload = JSON.parse(paymentHeader);
        const isValid = await this.verifyPaymentWithFacilitator(paymentPayload);

        if (!isValid) {
          return c.json({
            success: false,
            error: 'Invalid payment',
            code: 'INVALID_PAYMENT',
          }, 402);
        }

        c.set('paymentVerified', true);
        c.set('paymentPayload', paymentPayload);
        
        // Process the request
        await next();

        // After successful response, settle payment
        if (c.res && c.res.status < 400) {
          await this.settlePaymentWithFacilitator(paymentPayload);
        }

      } catch (error: any) {
        logger.error('Payment verification error', { error: error.message });
        return c.json({
          success: false,
          error: 'Payment verification failed',
          code: 'PAYMENT_ERROR',
        }, 402);
      }
    };
  }

  /**
   * Create 402 Payment Required response
   */
  private create402Response(c: Context): Response {
    const requirement = this.createRequirement('0.01', 'VERSUS Platform Fee');
    
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Payment Required',
        code: 'PAYMENT_REQUIRED',
        x402Version: '1',
        payment: requirement,
      }),
      {
        status: 402,
        headers: {
          'Content-Type': 'application/json',
          'X-402-Payment-Required': JSON.stringify(requirement),
        },
      }
    );
  }

  /**
   * Create a payment requirement
   */
  createRequirement(
    amount: string,
    description: string,
    scheme: X402Scheme = 'exact'
  ): X402PaymentRequirement {
    const now = Math.floor(Date.now() / 1000);
    
    return {
      version: '1',
      scheme,
      network: this.config.defaultNetwork!,
      asset: this.config.defaultAsset!,
      amount,
      recipient: this.config.settlementAddress,
      description,
      deadline: now + 3600, // 1 hour
    };
  }

  /**
   * Verify payment with x402 facilitator
   */
  private async verifyPaymentWithFacilitator(payload: X402PaymentPayload): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.facilitatorUrl}/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          payment: payload,
          recipient: this.config.settlementAddress,
        }),
      });

      if (!response.ok) {
        return false;
      }

      const result = await response.json();
      return result.valid === true;
    } catch (error: any) {
      logger.error('Facilitator verification error', { error: error.message });
      return false;
    }
  }

  /**
   * Settle payment with x402 facilitator
   */
  private async settlePaymentWithFacilitator(payload: X402PaymentPayload): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.facilitatorUrl}/settle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          payment: payload,
          recipient: this.config.settlementAddress,
        }),
      });

      if (!response.ok) {
        return false;
      }

      const result = await response.json();
      return result.success === true;
    } catch (error: any) {
      logger.error('Facilitator settlement error', { error: error.message });
      return false;
    }
  }

  /**
   * Record a payment in database
   */
  async recordPayment(
    reference: string,
    requirement: X402PaymentRequirement,
    payer?: string
  ): Promise<string> {
    const id = `pay-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();

    await this.db.execute(
      `INSERT INTO x402_payments 
       (id, reference, scheme, network, asset, amount, recipient, description, payer, status, deadline, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        reference,
        requirement.scheme,
        requirement.network,
        requirement.asset,
        requirement.amount,
        requirement.recipient,
        requirement.description,
        payer || null,
        'pending',
        requirement.deadline,
        now,
      ]
    );

    logger.debug('Payment recorded', { id, reference, amount: requirement.amount });
    return id;
  }

  /**
   * Get payment by reference
   */
  async getPaymentByReference(reference: string): Promise<X402PaymentRecord | null> {
    const row = await this.db.get(
      'SELECT * FROM x402_payments WHERE reference = ?',
      [reference]
    );

    if (!row) return null;

    return {
      id: row.id,
      reference: row.reference,
      scheme: row.scheme,
      network: row.network,
      asset: row.asset,
      amount: row.amount,
      recipient: row.recipient,
      description: row.description,
      payer: row.payer,
      status: row.status,
      deadline: row.deadline,
      createdAt: row.created_at,
      settledAt: row.settled_at,
    };
  }

  /**
   * Update payment status
   */
  async updatePaymentStatus(
    reference: string,
    status: X402PaymentRecord['status'],
    payer?: string
  ): Promise<void> {
    const settledAt = status === 'settled' ? new Date().toISOString() : null;

    await this.db.execute(
      `UPDATE x402_payments 
       SET status = ?, payer = COALESCE(?, payer), settled_at = COALESCE(?, settled_at)
       WHERE reference = ?`,
      [status, payer, settledAt, reference]
    );

    logger.debug('Payment status updated', { reference, status, payer });
  }

  /**
   * Check if payment is complete
   */
  async isPaymentComplete(reference: string): Promise<boolean> {
    const payment = await this.getPaymentByReference(reference);
    return payment?.status === 'settled';
  }

  /**
   * Get payment statistics
   */
  async getPaymentStats(): Promise<{
    totalPayments: number;
    totalRevenue: string;
    pendingPayments: number;
    settledPayments: number;
  }> {
    const result = await this.db.get(
      `SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'settled' THEN CAST(amount AS DECIMAL) ELSE 0 END) as revenue,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'settled' THEN 1 ELSE 0 END) as settled
       FROM x402_payments`
    );

    return {
      totalPayments: result?.total || 0,
      totalRevenue: result?.revenue || '0',
      pendingPayments: result?.pending || 0,
      settledPayments: result?.settled || 0,
    };
  }

  /**
   * Get settlement address
   */
  getSettlementAddress(): string {
    return this.config.settlementAddress;
  }

  /**
   * Get default asset
   */
  getDefaultAsset(): string {
    return this.config.defaultAsset!;
  }

  /**
   * Get default network
   */
  getDefaultNetwork(): X402Network {
    return this.config.defaultNetwork!;
  }

  /**
   * Check if payments are enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Get facilitator URL
   */
  getFacilitatorUrl(): string {
    return this.config.facilitatorUrl!;
  }
}
