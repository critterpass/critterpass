/**
 * Reading a menu the camera is pointed at: one structured call, validated against the lines the
 * device sent. A refusal, an unreadable reply or a failed call answers `failed` with no dishes, so
 * the app keeps its on-device stickers and says the guide could not read the menu.
 */
import type { Gateway } from '../../client';
import { isDeclined, parseStructuredText, textOf } from '../../structured';
import type { UsageContext } from '../../usage';
import { buildMenuRequest, MENU_ROUTE, type MenuRequestInput } from './prompt';
import { menuReplySchema, validateMenuReply, type ParsedMenu } from './schema';

export * from './price';
export * from './prompt';
export * from './schema';

const FAILED: ParsedMenu = { status: 'failed', items: [], suggestion: null };

export interface ReadMenuInput extends MenuRequestInput {
  readonly currencyHint?: string;
}

export async function readMenu(
  gateway: Pick<Gateway, 'callModel'>,
  input: ReadMenuInput,
  context: UsageContext = {},
): Promise<ParsedMenu> {
  if (input.lines.length === 0) return FAILED;
  try {
    const result = await gateway.callModel(MENU_ROUTE, buildMenuRequest(input), context);
    if (isDeclined(result.message)) return FAILED;
    const reply = menuReplySchema.safeParse(parseStructuredText(textOf(result.message)));
    if (!reply.success) return FAILED;
    return validateMenuReply(reply.data, {
      lines: input.lines,
      crew: input.crew,
      ...(input.currencyHint === undefined ? {} : { currencyHint: input.currencyHint }),
    });
  } catch {
    return FAILED;
  }
}
