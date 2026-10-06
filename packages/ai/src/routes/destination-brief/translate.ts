/**
 * A brief's `why` lines in a reader's language, through the place profile's translation route
 * (`place.profile_translate`, fast tier, structured): the English lines go in with their ids and
 * come back translated; a line whose numbers change keeps its English text.
 */
import type { Gateway } from '../../client';
import { isDeclined, parseStructuredText, textOf } from '../../structured';
import type { UsageContext } from '../../usage';
import {
  buildProfileTranslateRequest,
  PLACE_PROFILE_TRANSLATE_ROUTE,
} from '../place-profile/translate';
import { translateReplySchema, type TranslateLine } from '../translate/schema';
import { validateTranslateReply } from '../translate/validate';

export interface BriefLineTranslation {
  /** Translated text by line id; a line that failed its check is absent. */
  readonly lines: ReadonlyMap<string, string>;
  readonly costMicros: number;
}

/** Translates `lines` (id and English text) into `locale`; a declined reply throws. */
export async function translateBriefLines(
  gateway: Pick<Gateway, 'callModel'>,
  lines: readonly { readonly id: string; readonly text: string }[],
  locale: string,
  usage: UsageContext = {},
): Promise<BriefLineTranslation> {
  const input: TranslateLine[] = lines
    .filter((line) => line.text.trim() !== '')
    .map((line) => ({ id: line.id, text: line.text, max: 200 }));
  if (input.length === 0) return { lines: new Map(), costMicros: 0 };
  const result = await gateway.callModel(
    PLACE_PROFILE_TRANSLATE_ROUTE,
    buildProfileTranslateRequest(locale, input),
    usage,
  );
  if (isDeclined(result.message)) throw new Error('brief translation declined');
  const reply = translateReplySchema.safeParse(parseStructuredText(textOf(result.message)));
  if (!reply.success) throw new Error('brief translation unreadable');
  return {
    lines: validateTranslateReply(reply.data, input).accepted,
    costMicros: result.costMicros,
  };
}
