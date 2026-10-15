/**
 * A quest title as the card sets it: sentence case ("Warung crawl"). The guide writes titles in
 * capitals; a title already in mixed case is the writer's and stays as written. A word the quest's
 * own text writes with a capital mid-sentence (a place, "Đà Nẵng") keeps it.
 */
export function readableTitle(title: string, context = ''): string {
  const upper = title.toUpperCase();
  if (title !== upper || upper === title.toLowerCase()) return title;
  // Capitals mid-sentence only: the first word of a sentence is capitalised whatever it is.
  const named = new Set(
    [...context.matchAll(/(?<![.!?]\s*|^\s*)(?<=\P{L})\p{Lu}[\p{L}\p{N}-]*/gu)].map((m) => m[0]),
  );
  let started = false;
  return title
    .toLowerCase()
    .split(' ')
    .map((word) => {
      const index = word.search(/\p{L}/u);
      if (index < 0) return word;
      const capital =
        word.slice(0, index) + word.charAt(index).toUpperCase() + word.slice(index + 1);
      const keep = !started || named.has(capital);
      started = true;
      return keep ? capital : word;
    })
    .join(' ');
}
