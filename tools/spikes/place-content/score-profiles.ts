/**
 * Scores `profiles.json`: Jev types each profile (and each reviewed note) into best times, a
 * visit-length bucket and a meal role; a pro-tier judge compares every pipeline's profile for a
 * place, blind, with the reviewed note (Đà Lạt) and rates the Vietnamese; names of other places a
 * profile mentions are checked against our index. Writes `scores.json` and prints the table.
 */
import { createDecisionClient } from '../../../packages/ai/src/decide/client';
import { choice, noul, type QuestionMap } from '../../../packages/ai/src/decide/questions';
import { matchName, withReadOnly, type SamplePlace } from './db';
import { generate, readOut, TAVILY_USD_PER_CREDIT, writeOut } from './lib';
import { BEST_TIMES, PIPELINES, type ProfileResult } from './profile';

const sample = readOut<SamplePlace[]>('sample.json');
const profiles = readOut<ProfileResult[]>('profiles.json');
const byId = new Map(sample.map((p) => [p.id, p]));

const VISIT = ['30', '60', '120', 'half_day', 'full_day'] as const;
type Visit = (typeof VISIT)[number];
export function visitBucket(minutes: number): Visit {
  if (minutes <= 45) return '30';
  if (minutes <= 90) return '60';
  if (minutes <= 180) return '120';
  if (minutes <= 300) return 'half_day';
  return 'full_day';
}

const TIME_TEXT: Record<(typeof BEST_TIMES)[number], string> = {
  early_morning: 'early morning, before about 8:00',
  morning: 'morning',
  midday: 'midday or lunchtime',
  afternoon: 'afternoon',
  sunset: 'around sunset',
  evening: 'evening or dinner time',
  after_dark: 'after dark, late night',
};

interface Typed {
  readonly times: string[];
  readonly visit: Visit;
  readonly visitConfidence: number;
  readonly meal: string;
}

/** Jev types up to 8 texts per call: 9 questions each. */
async function typeTexts(items: { key: string; text: string }[]): Promise<Map<string, Typed>> {
  const jev = createDecisionClient({
    apiKey: process.env.TYPESAFE_API_KEY,
    timeoutMs: 30_000,
  });
  const typed = new Map<string, Typed>();
  let micros = 0;
  for (let at = 0; at < items.length; at += 8) {
    const batch = items.slice(at, at + 8);
    const state: Record<string, string> = {};
    const questions: Record<string, QuestionMap[string]> = {};
    batch.forEach((item, i) => {
      const k = `p${i}`;
      state[k] = item.text;
      for (const time of BEST_TIMES) {
        questions[`${k}_${time}`] = noul(
          `Place ${k}: does its text recommend visiting in the ${TIME_TEXT[time]}?`,
        );
      }
      questions[`${k}_visit`] = choice(`Place ${k}: how long does a typical visit take?`, {
        '30': 'under 45 minutes (a quick stop, coffee or snack)',
        '60': 'about an hour (a meal, a small sight)',
        '120': 'one and a half to three hours',
        half_day: 'half a day',
        full_day: 'a whole day',
      });
      questions[`${k}_meal`] = choice(`Place ${k}: what part does food play in a visit?`, {
        meal: 'people come to eat a full meal here',
        light: 'coffee, drinks or a snack',
        none: 'not a place to eat or drink',
      });
    });
    const decision = await jev.decide('poi.duplicate_tiebreak', { state, questions });
    micros += decision.costMicros;
    const answers = decision.answers as Record<
      string,
      { noul?: number; choice?: string; confidence: number }
    >;
    batch.forEach((item, i) => {
      const k = `p${i}`;
      const times = BEST_TIMES.filter((t) => (answers[`${k}_${t}`]?.noul ?? 0) >= 0.5);
      const visit = answers[`${k}_visit`];
      typed.set(item.key, {
        times,
        visit: (visit?.choice ?? '60') as Visit,
        visitConfidence: visit?.confidence ?? 0,
        meal: answers[`${k}_meal`]?.choice ?? 'none',
      });
    });
    console.log(`jev batch ${at / 8 + 1}: ${decision.latencyMs} ms by ${decision.answered_by}`);
  }
  console.log(`jev spend $${(micros / 1e6).toFixed(4)}`);
  return typed;
}

const profileText = (r: ProfileResult) => {
  const p = r.profile;
  if (p === null || p.decision !== 'write') return '';
  return [p.why_go.en, `Best time: ${p.best_time.en}`, `Crowds: ${p.crowd.en}`]
    .concat(r.kept.map((f) => f.en))
    .join('\n');
};
const goldText = (g: Record<string, unknown>) =>
  [g.why_go, `Best time: ${String(g.best_time)}`, `Crowds: ${String(g.crowd_hint)}`].join('\n');

const JUDGE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['candidates'],
  properties: {
    candidates: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'label',
          'agrees',
          'contradicts',
          'contradictions',
          'doubtful',
          'vi_quality',
          'vi_issues',
          'usefulness',
          'other_places',
        ],
        properties: {
          label: { type: 'string' },
          agrees: { type: 'integer', description: 'claims the reviewed note supports' },
          contradicts: { type: 'integer', description: 'claims the reviewed note contradicts' },
          contradictions: { type: 'array', items: { type: 'string' } },
          doubtful: {
            type: 'array',
            items: { type: 'string' },
            description: 'claims you believe are wrong for this place, from what you know',
          },
          vi_quality: { type: 'integer', minimum: 1, maximum: 5 },
          vi_issues: { type: 'string' },
          usefulness: { type: 'integer', minimum: 1, maximum: 5 },
          other_places: {
            type: 'array',
            items: { type: 'string' },
            description: 'names of other specific places the candidate mentions',
          },
        },
      },
    },
  },
};

const JUDGE_SYSTEM = [
  'You grade short travel-app place pages written by different systems for the same place.',
  'For each candidate (labelled A, B, ...):',
  '- agrees / contradicts: count its claims (why go, best time, crowds, visit length, each fact)',
  '  that the REVIEWED NOTE supports or contradicts. A claim the note does not cover counts as',
  '  neither. With no reviewed note, both are 0.',
  '- contradictions: each contradicted claim, briefly.',
  '- doubtful: claims you believe are wrong for this place from your own knowledge (wrong fee,',
  '  wrong hours, wrong kind of place, invented detail). Be strict but fair; empty when none.',
  '- vi_quality 1-5: is the Vietnamese natural, correct, and does it use the names locals use',
  '  (with accents)? 5 = reads like a local editor; 3 = understandable but translated; 1 = wrong.',
  '- usefulness 1-5: would a group planning a visit find it specific and helpful?',
  '- other_places: names of other specific places it mentions (not this place, not the city).',
].join('\n');

function letters(n: number): string[] {
  return Array.from({ length: n }, (_, i) => String.fromCharCode(65 + i));
}

async function judge(place: SamplePlace, results: ProfileResult[]) {
  // A fixed shuffle per place so the judge never sees the pipelines in one order.
  const order = [...results].sort(
    (a, b) => hash(place.id + a.pipeline) - hash(place.id + b.pipeline),
  );
  const labels = letters(order.length);
  const user = [
    `Place: ${place.name}${place.nameLocal === null ? '' : ` (${place.nameLocal})`}, ${place.destination}, kind ${place.category}`,
    place.gold === null
      ? 'REVIEWED NOTE: none'
      : `REVIEWED NOTE:\n${JSON.stringify(place.gold, null, 1)}`,
    '',
    ...order.map((r, i) => {
      const p = r.profile;
      if (p === null || p.decision !== 'write') return `CANDIDATE ${labels[i]}: declined`;
      return `CANDIDATE ${labels[i]}:\n${JSON.stringify(
        {
          why_go: p.why_go,
          best_time: p.best_time,
          crowd: p.crowd,
          best_times: p.best_times,
          visit_min: p.visit_min,
          meal_role: p.meal_role,
          dish: p.dish,
          facts: r.kept.map((f) => ({ kind: f.kind, en: f.en, vi: f.vi })),
        },
        null,
        1,
      )}`;
    }),
  ].join('\n');
  const result = await generate({
    tier: 'pro',
    thinking: true,
    system: JUDGE_SYSTEM,
    user,
    schema: JUDGE_SCHEMA,
    maxTokens: 24_000,
    label: 'judge',
  });
  const json = result.json as {
    candidates?: ({ label: string } & Record<string, unknown>)[];
  } | null;
  const graded = new Map<string, Record<string, unknown>>();
  for (const c of json?.candidates ?? []) {
    const index = labels.indexOf(c.label.replace(/[^A-Z]/gu, ''));
    const r = order[index];
    if (r !== undefined) graded.set(r.pipeline, c);
  }
  return { graded, costMicros: result.costMicros };
}

function hash(text: string): number {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return h;
}

const jaccard = (a: readonly string[], b: readonly string[]) => {
  const union = new Set([...a, ...b]);
  if (union.size === 0) return 1;
  return a.filter((x) => b.includes(x)).length / union.size;
};

// 1. Jev typing.
const items = [
  ...profiles
    .filter((r) => profileText(r) !== '')
    .map((r) => ({ key: `${r.pipeline}|${r.placeId}`, text: profileText(r) })),
  ...sample
    .filter((p) => p.gold !== null)
    .map((p) => ({ key: `gold|${p.id}`, text: goldText(p.gold ?? {}) })),
];
const typed = await typeTexts(items);

// 2. Judge, one call per place over all pipelines.
const judged = new Map<string, Record<string, unknown>>();
let judgeMicros = 0;
await Promise.all(
  sample.map(async (place) => {
    const results = profiles.filter((r) => r.placeId === place.id);
    const { graded, costMicros } = await judge(place, results);
    judgeMicros += costMicros;
    for (const [pipeline, grade] of graded) judged.set(`${pipeline}|${place.id}`, grade);
  }),
);

// 3. Other place names a profile mentions, against our index.
const nameChecks = new Map<string, { name: string; found: boolean }[]>();
await withReadOnly(async (client) => {
  for (const [key, grade] of judged) {
    const placeId = key.split('|')[1] ?? '';
    const place = byId.get(placeId);
    if (place === undefined) continue;
    const names = (grade.other_places as string[] | undefined) ?? [];
    const checks = [];
    for (const name of names) {
      const row = await matchName(client, place.destination, {
        name,
        localName: null,
        kind: 'other',
        area: null,
      });
      checks.push({ name, found: row !== null });
    }
    nameChecks.set(key, checks);
  }
});

// 4. Per pipeline rows.
const rows = PIPELINES.map((spec) => {
  const rs = profiles.filter((r) => r.pipeline === spec.id);
  const written = rs.filter((r) => profileText(r) !== '');
  const gold = written.filter((r) => byId.get(r.placeId)?.gold != null);
  let agree = 0;
  let contra = 0;
  let doubtful = 0;
  let vi = 0;
  let use = 0;
  let viN = 0;
  let named = 0;
  let unknownNames = 0;
  const visitModel: boolean[] = [];
  const visitJev: boolean[] = [];
  const timesModel: number[] = [];
  const timesJev: number[] = [];
  const timesModelHit: boolean[] = [];
  for (const r of written) {
    const key = `${r.pipeline}|${r.placeId}`;
    const g = judged.get(key);
    if (g !== undefined) {
      vi += Number(g.vi_quality);
      use += Number(g.usefulness);
      viN += 1;
      doubtful += (g.doubtful as string[]).length;
      if (gold.includes(r)) {
        agree += Number(g.agrees);
        contra += Number(g.contradicts);
      }
    }
    for (const check of nameChecks.get(key) ?? []) {
      named += 1;
      if (!check.found) unknownNames += 1;
    }
  }
  for (const r of gold) {
    const place = byId.get(r.placeId);
    const goldMin = Number(place?.gold?.time_needed_min);
    const goldTyped = typed.get(`gold|${r.placeId}`);
    const mine = typed.get(`${r.pipeline}|${r.placeId}`);
    const p = r.profile;
    if (p === null) continue;
    if (Number.isFinite(goldMin)) {
      visitModel.push(visitBucket(p.visit_min) === visitBucket(goldMin));
      if (mine !== undefined) visitJev.push(mine.visit === visitBucket(goldMin));
    }
    if (goldTyped !== undefined) {
      timesModel.push(jaccard(p.best_times, goldTyped.times));
      timesModelHit.push(p.best_times.some((t) => goldTyped.times.includes(t)));
      if (mine !== undefined) timesJev.push(jaccard(mine.times, goldTyped.times));
    }
  }
  const facts = rs.reduce((n, r) => n + r.kept.length + r.dropped.length, 0);
  const dropped = rs.reduce((n, r) => n + r.dropped.length, 0);
  const prose = rs.reduce((n, r) => n + r.proseDropped.length, 0);
  const share = (xs: boolean[]) => (xs.length === 0 ? NaN : xs.filter(Boolean).length / xs.length);
  const mean = (xs: number[]) =>
    xs.length === 0 ? NaN : xs.reduce((a, b) => a + b, 0) / xs.length;
  const ms = rs.map((r) => r.ms + r.evidenceMs).sort((a, b) => a - b);
  const paidSearch = !['fast-memory-row', 'pro-nothink-free-pages'].includes(spec.id);
  const searchUsd = !paidSearch
    ? 0
    : rs.length * 2 * TAVILY_USD_PER_CREDIT + (spec.pages ? rs.length * TAVILY_USD_PER_CREDIT : 0);
  return {
    pipeline: spec.id,
    written: `${written.length}/${rs.length}`,
    agreement: agree + contra === 0 ? NaN : agree / (agree + contra),
    contradictions: contra,
    doubtfulPerPlace: doubtful / Math.max(1, viN),
    factsPerPlace: (facts - dropped) / rs.length,
    droppedShare: facts === 0 ? 0 : dropped / facts,
    proseDropped: prose,
    unknownNames: `${unknownNames}/${named}`,
    viQuality: vi / Math.max(1, viN),
    usefulness: use / Math.max(1, viN),
    visitModel: share(visitModel),
    visitJev: share(visitJev),
    timesJaccardModel: mean(timesModel),
    timesJaccardJev: mean(timesJev),
    timesOverlapModel: share(timesModelHit),
    p50ms: ms[Math.floor(ms.length / 2)] ?? 0,
    p95ms: ms[Math.min(ms.length - 1, Math.ceil(ms.length * 0.95) - 1)] ?? 0,
    modelUsdPerPlace: rs.reduce((n, r) => n + r.costMicros, 0) / 1e6 / rs.length,
    searchUsdPerPlace: searchUsd / rs.length,
    tokensInPerPlace: Math.round(rs.reduce((n, r) => n + r.inputTokens, 0) / rs.length),
    tokensOutPerPlace: Math.round(rs.reduce((n, r) => n + r.outputTokens, 0) / rs.length),
  };
});

writeOut('scores.json', {
  rows,
  judged: Object.fromEntries(judged),
  typed: Object.fromEntries(typed),
  nameChecks: Object.fromEntries(nameChecks),
  judgeUsd: judgeMicros / 1e6,
});
console.table(
  rows.map((r) =>
    Object.fromEntries(
      Object.entries(r).map(([k, v]) => [k, typeof v === 'number' ? Number(v.toFixed(3)) : v]),
    ),
  ),
);
console.log(`judge spend $${(judgeMicros / 1e6).toFixed(4)}`);
