/**
 * The shared tail of every OTP delivery-status webhook: an undelivered code for a tracked send
 * emits `otp.channel_failed{verification_id}` on the requester's `user:#uid` channel so the app
 * can offer SMS instead. Untracked ids (expired record, no session uid) are ignored.
 */
import { enqueueRealtime, withSystem } from '@cp/db';
import { userChannel } from '@cp/domain';
import type pg from 'pg';

import { findDeliveryByProviderMessageId, type DeliveryTrackerRedisClient } from './router';

export async function emitOtpChannelFailed(
  appPool: pg.Pool,
  redis: DeliveryTrackerRedisClient,
  providerMessageId: string,
): Promise<void> {
  const delivery = await findDeliveryByProviderMessageId(redis, providerMessageId);
  const uid = delivery?.uid;
  if (!delivery || !uid) return;
  await withSystem(appPool, (tx) =>
    enqueueRealtime(tx, {
      channel: userChannel(uid),
      payload: {
        type: 'otp.channel_failed',
        data: { verification_id: delivery.verificationId ?? null },
      },
    }),
  );
}
