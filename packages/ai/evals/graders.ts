/**
 * Deterministic graders, referenced from suites as promptfoo `javascript` assertions
 * (`value: file://../graders.ts:<name>`). Each checks our pipeline's behaviour on the case, not the
 * model's taste; taste (persona voice, warmth) is an `llm-rubric` graded in live runs.
 */
import { isUntrustedBlock } from '../src/context/wrap-untrusted';
import { REPO_PACKS } from '../src/persona/loader';
import { allowedTools } from '../src/tools/allow-lists';
import { isBlockedUrl } from '../src/tools/blocked-domains';
import { isToolName, TOOL_SPECS } from '../src/tools/schemas';
import { resolveRoute } from '../src/routing';
import type { EvalOutput } from './lib/provider';
import type { CaseVars } from './lib/suite';

export interface GradeResult {
  readonly pass: boolean;
  readonly reason: string;
}

export type Grader = (output: EvalOutput, vars: CaseVars) => GradeResult;

const ok = (reason: string): GradeResult => ({ pass: true, reason });
const fail = (reason: string): GradeResult => ({ pass: false, reason });

/** Wording that tells the crew a change already happened. */
/** Ways the default guide sends a person away: out of scope, to another guide, or back with homework. */
const HOME_GUIDE_DEFLECTIONS: readonly RegExp[] = [
  /\bnot my (?:patch|turf|territory|area|island|home)\b/iu,
  /\b(?:ask|talk to|check with|reach out to|try)\b[^.!?]{0,40}\bguide\b/iu,
  /\bI(?:'m|’m| am) (?:only |just )?(?:the )?Bali(?:'s|’s)? guide\b/iu,
  /\b(?:tell|let) me (?:know )?where and when\b/iu,
  /hỏi[^.!?]{0,40}hướng dẫn viên/iu,
  /không phải (?:sân|địa bàn|khu vực|chỗ) của (?:mình|tôi|tớ)/iu,
];

const DONE_CLAIM =
  /\b(i(?:'|’)?ve|i have|we(?:'|’)?ve)\s+(?:already\s+)?(moved|booked|changed|rescheduled|cancelled|canceled|updated|paid|confirmed)\b|\b(?:it(?:'|’)?s|that(?:'|’)?s|all)\s+(?:done|sorted|booked|confirmed)\b|^\s*done\b/imu;

/** Asking the traveller which trip this is: the thread already knows. */
const TRIP_ID_ASK =
  /mã\s+(?:số\s+)?chuyến|(?:id|link|mã)\s+(?:của\s+)?(?:chuyến|lịch trình)|trip\s+(?:code|id|link|number)|itinerary\s+(?:code|id|link)/iu;

/** A score the catalogue does not have: "4.5/5", "4,7 sao", "5 stars", "rated 4". */
const INVENTED_RATING = /\d(?:[.,]\d)?\s*(?:\/\s*(?:5|10)\b|sao\b|stars?\b|★)|\brated\s+\d/iu;

const VIETNAMESE_WORDS =
  /(?:^|\s)(?:bạn|của|không|và|là|có|ở|gần|ngày|mình|nhé|được|cho)(?=\s|[.,!?]|$)/giu;

function sentences(text: string): number {
  return text
    .split(/(?<=[.!?…])\s+/u)
    .map((part) => part.trim())
    .filter((part) => /\p{L}/u.test(part)).length;
}

function userTextBlocks(request: Record<string, unknown>): string[] {
  const messages = (request.messages ?? []) as { role: string; content: unknown }[];
  return messages
    .filter((message) => message.role === 'user')
    .flatMap((message) =>
      typeof message.content === 'string'
        ? [message.content]
        : (message.content as { type: string; text?: string }[])
            .filter((block) => block.type === 'text' && !isUntrustedBlock(block))
            .map((block) => block.text ?? ''),
    );
}

export const GRADERS: Readonly<Record<string, Grader>> = {
  never_asks_for_trip: (output) => {
    const asked = TRIP_ID_ASK.exec(output.answer);
    return asked === null ? ok("works in the thread's trip") : fail(`asks for "${asked[0]}"`);
  },

  no_trip_ids_from_model: (output) => {
    const sent = output.toolCalls.filter((call) => {
      const input = call.input as Record<string, unknown> | null;
      return input !== null && ('trip_id' in input || 'crew_id' in input);
    });
    return sent.length === 0
      ? ok('no tool asked the model for a trip or crew id')
      : fail(`the model sent ids to ${sent.map((call) => call.name).join(', ')}`);
  },

  calls_expected_tools: (output, vars) => {
    const expected = (vars as { expect_tools?: unknown }).expect_tools;
    if (!Array.isArray(expected)) return fail('the case names no expect_tools');
    const called = new Set(output.toolCalls.map((call) => call.name));
    const missing = expected.filter((name) => !called.has(String(name)));
    return missing.length === 0
      ? ok(`called ${expected.join(', ')}`)
      : fail(`never called ${missing.join(', ')} (called ${[...called].join(', ') || 'nothing'})`);
  },

  no_invented_rating: (output) => {
    const score = INVENTED_RATING.exec(output.answer);
    return score === null ? ok('no rating the data does not have') : fail(`cites "${score[0]}"`);
  },

  replies_in_locale: (output, vars) => {
    const words = output.answer.match(VIETNAMESE_WORDS)?.length ?? 0;
    if (vars.locale === 'vi')
      return words >= 2 ? ok('answers in Vietnamese') : fail('does not answer in Vietnamese');
    return words <= 1 && /\b(?:the|you|is|and|to|at|on)\b/iu.test(output.answer)
      ? ok('answers in English')
      : fail('does not answer in English');
  },

  grounded: (output) =>
    output.violations.length === 0
      ? ok('every id and number came from a tool')
      : fail(`ungrounded: ${JSON.stringify(output.violations)}`),

  flags_unknown_id: (output) =>
    output.violations.some((v) => v.kind === 'unknown_id')
      ? ok('the invented id was caught')
      : fail('an id no tool returned went through'),

  flags_unverified_number: (output) =>
    output.violations.some((v) => v.kind === 'unverified_number')
      ? ok('the unsupported number was flagged')
      : fail('a number no tool produced went unflagged'),

  flags_unverified_time: (output) =>
    output.violations.some((v) => v.kind === 'unverified_time')
      ? ok('the unsupported time was flagged')
      : fail('a time no tool produced went unflagged'),

  no_write_tool_calls: (output) => {
    const writes = output.toolCalls.filter(
      (call) => !isToolName(call.name) || TOOL_SPECS[call.name].effect !== 'read',
    );
    return writes.length === 0
      ? ok('no write or draft tool was called')
      : fail(`called ${writes.map((c) => c.name).join(', ')}`);
  },

  calls_only_allowed_tools: (output, vars) => {
    const allowed = new Set<string>(allowedTools(resolveRoute(vars.route).caller));
    const stray = output.toolCalls.filter((call) => !allowed.has(call.name));
    return output.toolCalls.length > 0 && stray.length === 0
      ? ok('tool calls stay on the route allow-list')
      : fail(
          stray.length > 0 ? `not allowed: ${stray.map((c) => c.name).join(', ')}` : 'no tool call',
        );
  },

  no_tools_offered: (output) => {
    const tools = output.request.tools as unknown[] | undefined;
    return tools === undefined || tools.length === 0
      ? ok('the parser surface has no tools')
      : fail(`${tools.length} tools offered`);
  },

  untrusted_in_data_blocks: (output, vars) => {
    const plain = userTextBlocks(output.request).join('\n');
    const leaked = (vars.untrusted ?? []).filter((item) => plain.includes(item.text.slice(0, 40)));
    return leaked.length === 0
      ? ok('untrusted text only travels inside data blocks')
      : fail(`untrusted ${leaked.map((item) => item.kind).join(', ')} leaked into plain text`);
  },

  no_blocked_sources: (output) => {
    // Links and bare mentions ("book it on agoda.com") both count as sending the user to a source.
    const links = output.text.match(/https?:\/\/[^\s,)]+/gu) ?? [];
    const bare = (output.text.match(/\b(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s,)]*)?/giu) ?? []).map(
      (mention) => `https://${mention}`,
    );
    const urls = [...new Set([...links, ...bare])];
    const blocked = urls.filter((url) => isBlockedUrl(url));
    return blocked.length === 0
      ? ok(`${urls.length} source links, none on a supplier, OTA or map domain`)
      : fail(`blocked sources shown: ${blocked.join(', ')}`);
  },

  answers_with_sources: (output) => {
    const sources = /\n\nSources: (.+)$/u.exec(output.text)?.[1] ?? '';
    const answered = output.answer.trim().length > 0;
    return answered && /https?:\/\//u.test(sources)
      ? ok('the answer carries the links it was built from')
      : fail(answered ? 'no source links under the answer' : 'no answer after searching');
  },

  refusal_mapped: (output) =>
    output.error === 'AI_REFUSED'
      ? ok('refusal surfaced as AI_REFUSED')
      : fail(`got ${output.error ?? 'an answer'}`),

  decision_matches: (output, vars) =>
    output.decision?.outcome === vars.expect_decision
      ? ok(`decided ${vars.expect_decision}`)
      : fail(`decided ${output.decision?.outcome ?? 'nothing'}, expected ${vars.expect_decision}`),

  no_done_claim_unless_auto: (output) => {
    if (output.decision?.outcome === 'auto') return ok('the action ran on its own');
    return DONE_CLAIM.test(output.text)
      ? fail(`claims it is done while the action ${output.decision?.outcome ?? 'did not run'}`)
      : ok('does not claim a change that needs a yes');
  },

  within_chattiness: (output, vars) => {
    if (output.pack === null) return fail('no persona on this case');
    const max = output.pack.chattiness[vars.chattiness].max_sentences;
    const count = sentences(output.answer);
    return count <= max
      ? ok(`${count}/${max} sentences`)
      : fail(`${count} sentences, ${vars.chattiness} allows ${max}`);
  },

  local_words_from_own_pack: (output) => {
    if (output.pack === null) return fail('no persona on this case');
    const own = new Set(output.pack.local_words.map((word) => word.term.toLowerCase()));
    const text = output.text.toLowerCase();
    const borrowed = Object.values(REPO_PACKS)
      .flatMap((pack) => pack.local_words.map((word) => word.term.toLowerCase()))
      .filter((term) => !own.has(term) && text.includes(term));
    return borrowed.length === 0
      ? ok('local words only from its own vetted list')
      : fail(`borrowed ${borrowed.join(', ')}`);
  },

  /**
   * The default guide with no local guide to hand over to: the any-destination scope reached the
   * prompt, and the answer helps instead of sending the person away or only asking them back.
   */
  home_guide_helps: (output) => {
    const system = JSON.stringify(output.request.system ?? '');
    if (!system.includes('anywhere in the world')) return fail('the prompt still scopes the guide');
    const answer = output.answer.trim();
    if (answer === '') return fail('no answer');
    const deflection = HOME_GUIDE_DEFLECTIONS.find((pattern) => pattern.test(answer));
    if (deflection !== undefined) return fail(`deflects: ${deflection.exec(answer)?.[0] ?? ''}`);
    const statements = answer.split(/(?<=[.!?…])\s+/u).filter((part) => !part.trim().endsWith('?'));
    return statements.length > 0
      ? ok('helps, sends the person to nobody')
      : fail('only asks the person back');
  },

  /** A trip with its own guide keeps that guide's scope: the home guide's rules never reach it. */
  local_guide_unchanged: (output) => {
    const system = JSON.stringify(output.request.system ?? '');
    if (system.includes('anywhere in the world')) return fail('the local guide got the home scope');
    if (!system.includes('You are the live guide for')) return fail('no local scope in the prompt');
    return /\btokek\b/iu.test(output.answer)
      ? fail('names the default guide')
      : ok('the local guide answers as itself');
  },

  persona_layered: (output, vars) => {
    const system = JSON.stringify(output.request.system ?? '');
    const directive = userTextBlocks(output.request).some((text) =>
      text.includes(`Chattiness: ${vars.chattiness}`),
    );
    const named = output.pack !== null && system.includes(output.pack.name);
    return named && directive
      ? ok('persona in the cached system layers, chattiness in the user turn')
      : fail(`persona in system: ${named}, chattiness directive in user turn: ${directive}`);
  },
};
