/**
 * A quest title as the card sets it: title case ("Sơn Trà Spotters"). The guide writes titles in
 * capitals; a title already in mixed case is the writer's and stays as written.
 */
export function readableTitle(title: string): string {
  const upper = title.toUpperCase();
  if (title !== upper || upper === title.toLowerCase()) return title;
  return title
    .toLowerCase()
    .split(' ')
    .map((word) => {
      const first = word.charAt(0);
      return first === '' ? word : first.toUpperCase() + word.slice(1);
    })
    .join(' ');
}
