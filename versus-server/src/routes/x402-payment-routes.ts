import { randomUUID } from 'crypto';
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { X402PaymentService } from '../services/x402-payment-service.js';
import { logger } from '../utils/logger.js';
import { errors } from '../middleware/error-handler.js';
import { ErrorCode } from '../utils/errors.js';

const createChargeSchema = z.object({
  reference: z.string().min(1),
  amountUsd: z.number().positive().optional(),
  currency: z.string().min(1).optional(),
  description: z.string().max(280).optional(),
  metadata: z.record(z.any()).optional(),
  customerEmail: z.string().email().optional(),
});

export function createX402PaymentRoutes(service: X402PaymentService) {
  const app = new Hono();

  app.post('/charges', zValidator('json', createChargeSchema), async (c) => {
    const params = c.req.valid('json');

    try {
      const charge = await service.createCharge(params);
      return c.json(
        {
          success: true,
          data: {
            chargeId: charge.chargeId,
            code: charge.code,
            status: charge.status,
            hostedUrl: charge.hostedUrl,
            amountUsd: charge.amountUsd,
            currency: charge.currency,
            reference: charge.reference,
            expiresAt: charge.expiresAt,
            headers: service.buildPaymentRequiredHeaders(charge),
          },
        },
        201
      );
    } catch (error) {
      logger.error('Failed to create x402 charge', { error });
      throw error;
    }
  });

  app.get('/charges/:chargeId', async (c) => {
    const chargeId = c.req.param('chargeId');
    const source = c.req.query('source') ?? undefined;

    const charge =
      source === 'remote'
        ? await service.refreshCharge(chargeId)
        : await service.getCharge(chargeId);

    if (!charge) {
      throw errors.notFound('Charge', chargeId);
    }

    return c.json({
      success: true,
      data: {
        chargeId: charge.chargeId,
        code: charge.code,
        status: charge.status,
        hostedUrl: charge.hostedUrl,
        amountUsd: charge.amountUsd,
        currency: charge.currency,
        reference: charge.reference,
        expiresAt: charge.expiresAt,
      },
    });
  });

  app.post('/charges/:chargeId/refresh', async (c) => {
    const chargeId = c.req.param('chargeId');
    const charge = await service.refreshCharge(chargeId);
    return c.json({
      success: true,
      data: {
        chargeId: charge.chargeId,
        status: charge.status,
        hostedUrl: charge.hostedUrl,
        amountUsd: charge.amountUsd,
        currency: charge.currency,
        reference: charge.reference,
        expiresAt: charge.expiresAt,
      },
    });
  });

  app.post('/webhook', async (c) => {
    const signature = c.req.header('X-CC-Webhook-Signature');
    const payload = await c.req.text();

    try {
      await service.handleWebhook(payload, signature ?? undefined);
      return c.json({ success: true });
    } catch (error) {
      logger.error('Failed to process x402 webhook', { error });
      return c.json({ success: false, error: 'invalid webhook signature' }, 400);
    }
  });

  app.post(
    '/402',
    zValidator('json', createChargeSchema.partial({ reference: true })),
    async (c) => {
      const body = c.req.valid('json');
      const reference = body.reference ?? randomUUID();

      const charge = await service.createCharge({ ...body, reference });
      const headers = service.buildPaymentRequiredHeaders(charge);

      c.header('Cache-Control', 'no-store');
      for (const [key, value] of Object.entries(headers)) {
        c.header(key, value);
      }

      return c.json(
        {
          success: false,
          error: 'Payment required',
          code: ErrorCode.PAYMENT_REQUIRED,
          data: {
            chargeId: charge.chargeId,
            status: charge.status,
            hostedUrl: charge.hostedUrl,
            amountUsd: charge.amountUsd,
            currency: charge.currency,
            reference: charge.reference,
            expiresAt: charge.expiresAt,
          },
        },
        402 as any
      );
    }
  );

  return app;
}
