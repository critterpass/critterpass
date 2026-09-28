/**
 * Registers the sign-in code delivery-status webhooks whose credentials this deployment has:
 * WhatsApp (`/webhooks/whatsapp`) and Telegram Gateway (`/webhooks/telegram-gateway`). Each one
 * turns an undelivered code into `otp.channel_failed` so the app can offer SMS.
 */
import type { Hono } from 'hono';
import type pg from 'pg';
import type { Logger } from 'pino';

import type { DeliveryTrackerRedisClient } from '../auth/otp/router';
import type { ApiEnv } from '../env';
import { registerTelegramGatewayWebhookRoutes } from './webhooks-telegram-gateway';
import { registerWhatsAppWebhookRoutes } from './webhooks-whatsapp';

export function registerOtpWebhookRoutes<E extends { Variables: object }>(
  app: Hono<E>,
  deps: {
    readonly env: Pick<
      ApiEnv,
      'WHATSAPP_APP_SECRET' | 'WHATSAPP_VERIFY_TOKEN' | 'TELEGRAM_GATEWAY_TOKEN'
    >;
    readonly appPool: pg.Pool;
    readonly redis: DeliveryTrackerRedisClient;
    readonly logger: Pick<Logger, 'info'>;
  },
): void {
  const { env, appPool, redis, logger } = deps;
  if (env.WHATSAPP_APP_SECRET && env.WHATSAPP_VERIFY_TOKEN) {
    registerWhatsAppWebhookRoutes(app, {
      appPool,
      redis,
      appSecret: env.WHATSAPP_APP_SECRET,
      verifyToken: env.WHATSAPP_VERIFY_TOKEN,
    });
  } else {
    logger.info(
      'WhatsApp status webhook is disabled: WHATSAPP_APP_SECRET or WHATSAPP_VERIFY_TOKEN is unset',
    );
  }
  if (env.TELEGRAM_GATEWAY_TOKEN) {
    registerTelegramGatewayWebhookRoutes(app, {
      appPool,
      redis,
      token: env.TELEGRAM_GATEWAY_TOKEN,
    });
  } else {
    logger.info('Telegram Gateway delivery webhook is disabled: TELEGRAM_GATEWAY_TOKEN is unset');
  }
}
