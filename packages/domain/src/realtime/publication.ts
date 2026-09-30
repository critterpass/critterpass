/**
 * The check an `rt_outbox` publication must pass, shared by the write site (`enqueueRealtime`,
 * which rejects a bad payload inside the command's transaction) and the relay (which dead-letters
 * one that slipped in through SQL): the envelope shape and size, plus the typed `data` schema for
 * owner-only `user:#<uid>` types.
 */
import { toRtEnvelope, type RtEnvelopeCheck, type RtEnvelopeDefaults } from './envelope';
import { parseRtChannel } from './namespaces';
import { rtUserPayloadSchema } from './payloads/user';

export type RtPublicationCheck =
  RtEnvelopeCheck | { readonly ok: false; readonly reason: 'data_mismatch'; readonly type: string };

export function checkRtPublication(
  channel: string,
  payload: unknown,
  defaults: RtEnvelopeDefaults,
): RtPublicationCheck {
  const checked = toRtEnvelope(payload, defaults);
  if (!checked.ok) return checked;
  if (parseRtChannel(channel)?.namespace === 'user') {
    const schema = rtUserPayloadSchema(checked.envelope.type);
    if (schema !== undefined && !schema.safeParse(checked.envelope.data).success) {
      return { ok: false, reason: 'data_mismatch', type: checked.envelope.type };
    }
  }
  return checked;
}
