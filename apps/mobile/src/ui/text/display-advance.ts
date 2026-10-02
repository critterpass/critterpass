/**
 * Horizontal advances of the display face, Archivo Black at each bundled width, in thousandths of
 * an em: one entry per character of `MEASURED`, read from the hmtx tables of
 * apps/mobile/assets/fonts (the display-advance test re-measures the files). Marks add no width
 * (Ẵ advances as A, Ư as U, Đ as D), so accented letters read their base letter's entry. Kerning is
 * left out: pairs only tighten, and the platform's own layout corrects what is left.
 */
const ASCII = Array.from({ length: 0x7f - 0x20 }, (_, index) =>
  String.fromCharCode(0x20 + index),
).join('');
export const MEASURED = `${ASCII}·’‘“”–—…`;

// prettier-ignore
export const DISPLAY_ADVANCES: Readonly<Record<string, readonly number[]>> = {
  'Archivo-W62-900': [110, 266, 396, 499, 400, 742, 566, 213, 389, 389, 369, 528, 222, 240, 222, 278, 444, 371, 427, 440, 435, 437, 445, 396, 432, 445, 222, 222, 528, 528, 528, 424, 688, 530, 498, 513, 509, 462, 402, 543, 513, 263, 453, 510, 432, 705, 518, 554, 485, 554, 509, 469, 475, 503, 490, 729, 500, 481, 475, 389, 278, 389, 528, 380, 198, 443, 440, 421, 440, 428, 287, 415, 437, 228, 232, 462, 228, 649, 437, 433, 440, 440, 296, 400, 293, 437, 414, 638, 448, 408, 383, 389, 204, 389, 528, 210, 204, 204, 373, 373, 310, 620, 666],
  'Archivo-W66-900': [117, 273, 407, 516, 422, 769, 600, 220, 389, 389, 373, 542, 234, 250, 234, 281, 467, 402, 452, 464, 459, 461, 468, 425, 457, 468, 234, 234, 542, 542, 542, 444, 722, 556, 527, 541, 537, 489, 430, 574, 547, 274, 476, 544, 457, 733, 551, 583, 510, 583, 537, 496, 501, 538, 520, 758, 529, 512, 501, 389, 281, 389, 542, 399, 208, 467, 464, 447, 464, 453, 298, 441, 461, 238, 241, 484, 238, 686, 461, 458, 464, 464, 312, 422, 309, 461, 435, 670, 471, 429, 401, 389, 212, 389, 542, 223, 212, 212, 387, 387, 330, 660, 701],
  'Archivo-W70-900': [125, 280, 417, 533, 444, 796, 634, 227, 389, 389, 377, 556, 245, 260, 245, 284, 491, 433, 478, 488, 484, 485, 492, 453, 481, 492, 245, 245, 556, 556, 556, 463, 756, 582, 557, 569, 566, 517, 458, 604, 580, 285, 498, 578, 481, 761, 584, 613, 535, 613, 566, 522, 527, 572, 551, 786, 559, 544, 527, 389, 284, 389, 556, 417, 219, 490, 488, 473, 488, 478, 308, 468, 485, 247, 250, 505, 247, 723, 485, 482, 488, 488, 327, 444, 325, 485, 455, 702, 494, 451, 419, 389, 220, 389, 556, 236, 220, 220, 401, 401, 350, 700, 736],
  'Archivo-W78-900': [139, 294, 439, 567, 489, 851, 702, 240, 389, 389, 385, 584, 269, 279, 269, 290, 538, 496, 528, 536, 533, 534, 538, 510, 531, 538, 269, 269, 584, 584, 584, 503, 824, 634, 616, 625, 622, 571, 514, 665, 648, 308, 543, 646, 531, 817, 651, 671, 585, 671, 622, 576, 579, 642, 611, 843, 617, 606, 579, 389, 290, 389, 584, 454, 240, 537, 536, 525, 536, 529, 330, 521, 534, 266, 267, 548, 266, 797, 534, 532, 536, 536, 358, 489, 357, 534, 497, 767, 540, 493, 456, 389, 237, 389, 584, 262, 235, 235, 430, 430, 390, 780, 807],
  'Archivo-W100-900': [180, 333, 497, 660, 611, 1000, 889, 278, 389, 389, 407, 660, 333, 333, 333, 306, 667, 667, 667, 667, 667, 667, 667, 667, 667, 667, 333, 333, 660, 660, 660, 611, 1010, 778, 778, 778, 778, 722, 667, 833, 833, 369, 667, 833, 667, 972, 833, 833, 722, 833, 778, 722, 722, 833, 778, 1000, 778, 778, 722, 389, 306, 389, 660, 556, 297, 667, 667, 667, 667, 667, 389, 666, 667, 319, 316, 667, 319, 1000, 667, 667, 667, 667, 444, 611, 444, 667, 611, 944, 667, 611, 556, 389, 282, 389, 660, 333, 278, 278, 508, 508, 500, 1000, 1000],
};

const INDEX = new Map([...MEASURED].map((char, index) => [char, index]));

/** Letters Unicode does not decompose into a base letter and marks. */
const BASE_LETTER: Readonly<Record<string, string>> = { Đ: 'D', đ: 'd' };

/**
 * The advance of one character in em for a bundled display face (`Archivo-W62-900`), or
 * `undefined` for a face that isn't measured, so the caller keeps its flat estimate. A character
 * outside the measured set takes the capitals' mean.
 */
export function displayAdvance(fontFamily: string): ((char: string) => number) | undefined {
  const advances = DISPLAY_ADVANCES[fontFamily];
  if (advances === undefined) return undefined;
  const capitals = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map(
    (char) => advances[INDEX.get(char) ?? 0] ?? 0,
  );
  const mean = capitals.reduce((sum, value) => sum + value, 0) / capitals.length;
  return (char) => {
    const base = BASE_LETTER[char] ?? char.normalize('NFD')[0] ?? char;
    const index = INDEX.get(base);
    return (index === undefined ? mean : (advances[index] ?? mean)) / 1000;
  };
}
