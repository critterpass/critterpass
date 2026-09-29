/**
 * Split suggestions for a parsed receipt, each with the reason the app shows: a member whose
 * consented dietary flags rule an item out is suggested out of it ("NOT JORDAN" — "Jordan skipped
 * the pork"); service, tax and tip are shared by share; the scanner is suggested as the payer.
 * Everything is a suggestion the member confirms or changes; nothing here decides.
 */
import type { ReceiptLineSuggestion, ReceiptSuggestions } from '@cp/domain';

/** What an item label must contain to count as a food (lower-cased, any of the languages). */
const FOODS: Readonly<Record<string, readonly string[]>> = {
  pork: [
    'pork',
    'babi',
    'heo',
    'lợn',
    'หมู',
    '豚',
    '猪',
    'ham ',
    'bacon',
    'char siu',
    'chashu',
    'tonkatsu',
  ],
  beef: ['beef', 'sapi', 'bò', 'เนื้อ', '牛', 'wagyu', 'rendang'],
  chicken: ['chicken', 'ayam', 'gà', 'ไก่', '鶏', '鸡', '焼き鳥', 'yakitori'],
  fish: ['fish', 'ikan', 'cá ', 'ปลา', '魚', '刺身', 'sashimi', 'salmon', 'tuna'],
  shellfish: [
    'shrimp',
    'prawn',
    'udang',
    'tôm',
    'กุ้ง',
    'crab',
    'kepiting',
    'cua',
    'ปู',
    '蟹',
    'lobster',
    'oyster',
    'clam',
    'mussel',
    'scallop',
  ],
  alcohol: [
    'beer',
    'bir ',
    'bia ',
    'เบียร์',
    'ビール',
    'wine',
    'sake',
    '酒',
    'cocktail',
    'mojito',
    'whisky',
    'soju',
  ],
  peanuts: ['peanut', 'kacang', 'đậu phộng', 'ถั่วลิสง', 'ピーナッツ', 'satay'],
};

/** Foods each consented flag rules out. `no_<food>` flags rule out that food when it is known. */
const RULES: Readonly<Record<string, readonly string[]>> = {
  halal: ['pork', 'alcohol'],
  kosher: ['pork', 'shellfish'],
  vegetarian: ['pork', 'beef', 'chicken', 'fish', 'shellfish'],
  vegan: ['pork', 'beef', 'chicken', 'fish', 'shellfish'],
  pescatarian: ['pork', 'beef', 'chicken'],
};

function ruledOut(flag: string): readonly string[] {
  if (RULES[flag] !== undefined) return RULES[flag];
  const food = flag.startsWith('no_') ? flag.slice(3) : '';
  return FOODS[food] === undefined ? [] : [food];
}

function foodsIn(label: string): string[] {
  const text = ` ${label.toLowerCase()} `;
  return Object.entries(FOODS)
    .filter(([, words]) => words.some((word) => text.includes(word)))
    .map(([food]) => food);
}

export interface SuggestionInput {
  readonly scannerId: string;
  readonly lines: readonly {
    readonly line_id: string;
    readonly kind: string;
    readonly label: string;
  }[];
  /** Each member's consented dietary flags on this trip (members without any are left out). */
  readonly flags: ReadonlyMap<string, readonly string[]>;
}

export function suggestSplit(input: SuggestionInput): ReceiptSuggestions {
  const lines: ReceiptLineSuggestion[] = [];
  for (const line of input.lines) {
    if (line.kind !== 'item') continue;
    const foods = foodsIn(line.label);
    if (foods.length === 0) continue;
    const reasons: ReceiptLineSuggestion['reasons'][number][] = [];
    for (const [uid, flags] of input.flags) {
      for (const flag of flags) {
        const food = ruledOut(flag).find((candidate) => foods.includes(candidate));
        if (food !== undefined) {
          reasons.push({ user_id: uid, kind: 'dietary', flag, food });
          break;
        }
      }
    }
    if (reasons.length > 0) {
      lines.push({ line_id: line.line_id, exclude: reasons.map((r) => r.user_id), reasons });
    }
  }
  return { payer_uid: input.scannerId, payer_reason: 'scanned', adjustments: 'by_share', lines };
}
