import type { Context, Next } from 'hono';
import type { X402PaymentService } from '../services/x402-payment-service.js';
import { logger } from '../utils/logger.js';

export interface X402RouteConfig {
  amount: string;
  description: string;
  reference?: string;
}

/**
 * Create x402 middleware for Hono
 * Uses the new x402 v2 service
 */
export function createX402Middleware(
  paymentService: X402PaymentService | null
) {
  return async (c: Context, next: Next) => {
    if (!paymentService || !paymentService.isEnabled()) {
      c.set('paymentVerified', true);
      return next();
    }

    // Check for payment header
    const paymentHeader = c.req.header('X-402-Payment') || c.req.header('payment-signature');
    
    if (!paymentHeader) {
      // Return 402 response
      const requirement = paymentService.createRequirement('0.01', 'VERSUS Platform Access');
      return c.json({
        success: false,
        error: 'Payment Required',
        code: 'PAYMENT_REQUIRED',
        x402Version: '1',
        payment: requirement,
      }, 402);
    }

    try {
      const paymentPayload = JSON.parse(paymentHeader);
      
      // Verify payment with facilitator
      // In production, this would call the x402 facilitator
      // For now, we assume valid if header exists
      c.set('paymentVerified', true);
      c.set('paymentPayload', paymentPayload);
      
      await next();
      
    } catch (error: any) {
      logger.error('Payment verification error', { error: error.message });
      return c.json({
        success: false,
        error: 'Invalid payment format',
        code: 'INVALID_PAYMENT',
      }, 402);
    }
  };
}

/**
 * Check if payment is valid
 */
export async function checkPayment(
  paymentService: X402PaymentService | null,
  c: Context
): Promise<{ valid: boolean; error?: string }> {
  if (!paymentService || !paymentService.isEnabled()) {
    return { valid: true };
  }

  const paymentHeader = c.req.header('X-402-Payment') || c.req.header('payment-signature');
  
  if (!paymentHeader) {
    return { valid: false, error: 'Payment header required' };
  }

  try {
    JSON.parse(paymentHeader);
    return { valid: true };
  } catch (error) {
    return { valid: false, error: 'Invalid payment format' };
  }
}

/**
 * Require payment for a specific route
 */
export function requirePayment(
  paymentService: X402PaymentService | null,
  config: X402RouteConfig
) {
  return async (c: Context, next: Next) => {
    if (!paymentService || !paymentService.isEnabled()) {
      c.set('paymentVerified', true);
      return next();
    }

    const reference = config.reference || `${c.req.method}:${c.req.path}:${Date.now()}`;
    
    // Check if payment already recorded
    const existingPayment = await paymentService.getPaymentByReference(reference);
    
    if (existingPayment?.status === 'settled') {
      c.set('paymentVerified', true);
      c.set('paymentRecord', existingPayment);
      return next();
    }

    // Check for payment header
    const paymentHeader = c.req.header('X-402-Payment') || c.req.header('payment-signature');
    
    if (!paymentHeader) {
      // Create payment requirement
      const requirement = paymentService.createRequirement(config.amount, config.description);
      
      // Record pending payment
      await paymentService.recordPayment(reference, requirement);
      
      // Return 402
      return c.json({
        success: false,
        error: 'Payment Required',
        code: 'PAYMENT_REQUIRED',
        x402Version: '1',
        payment: requirement,
        reference,
      }, 402);
    }

    try {
      const paymentPayload = JSON.parse(paymentHeader);
      
      // Record payment as verified
      await paymentService.updatePaymentStatus(reference, 'verified', paymentPayload.payload?.from);
      
      c.set('paymentVerified', true);
      c.set('paymentPayload', paymentPayload);
      
      await next();
      
      // After successful response, mark as settled
      if (c.res && c.res.status < 400) {
        await paymentService.updatePaymentStatus(reference, 'settled');
      }
      
    } catch (error: any) {
      logger.error('Payment processing error', { error: error.message });
      return c.json({
        success: false,
        error: 'Payment processing failed',
        code: 'PAYMENT_ERROR',
      }, 402);
    }
  };
}

/**
 * Parse x402 errors
 */
export function parseX402Error(error: unknown): { code: string; message: string } {
  if (error instanceof Error) {
    if (error.message.includes('Payment')) {
      return { code: 'PAYMENT_ERROR', message: error.message };
    }
    if (error.message.includes('x402')) {
      return { code: 'X402_ERROR', message: error.message };
    }
  }
  return { code: 'UNKNOWN_ERROR', message: 'An unexpected error occurred' };
}
