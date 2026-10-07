/* eslint-disable lingui/no-unlocalized-strings -- selectors, ARIA plumbing and key names; the words
   arrive translated in the page strings (src/scripts/page-strings.ts). */
/**
 * "Somewhere else?": a combobox over the server's place list (catalogue cities, then airport
 * cities). The server searches as the visitor types and sends the few best matches; the list
 * itself never reaches the browser. A visitor can only pick a listed place: what they type is a query, never a destination. A pick replaces the field with a
 * chip of the same height, so the ticket never changes size.
 */
import { placeView } from '../lib/destination-view';
import type { DestinationView } from '../lib/destination-view';
import { isSearchable } from '../lib/place-search';
import type { PlaceRow } from '../lib/place-search';
import { csEl, setText } from './dom';
import { fill } from './page-strings';
import type { PageStrings } from './page-strings';
import { searchPlaces } from './waitlist-api';

export interface PlaceSearch {
  /** Shows `view` as the picked place, or the empty search field for `null`. */
  show(view: DestinationView | null): void;
  /** Text was typed but no place picked: the form must not be sent as if it named a place. */
  hasUnpickedText(): boolean;
  focus(): void;
}

type Strings = Pick<PageStrings, 'searchEmpty' | 'searchFailed' | 'removePlace' | 'chipPlaces'>;

const SEARCH_PAUSE_MS = 120;

function countryName(code: string, language: string): string {
  try {
    return new Intl.DisplayNames([language], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** The line under a city: its local (species too where the page is in the data's language) and country. */
function describe(row: PlaceRow, language: string): string {
  const country = countryName(row[2], language);
  if (row[3] !== 0) return country;
  // Species names exist in English only, so they show on the English page only.
  return [row[4], ...(language.startsWith('en') ? [row[5]] : []), country].join(' · ');
}

export function startPlaceSearch(
  root: ParentNode,
  strings: Strings,
  language: string,
  handlers: { onPick(view: DestinationView): void; onClear(): void },
): PlaceSearch {
  const noop: PlaceSearch = { show: () => {}, hasUnpickedText: () => false, focus: () => {} };
  const inputEl = csEl<HTMLInputElement>(root, 'place-input');
  const listEl = csEl<HTMLUListElement>(root, 'place-list');
  const statusEl = csEl(root, 'place-status');
  const pickedEl = csEl<HTMLButtonElement>(root, 'place-picked');
  if (!inputEl || !listEl || !statusEl || !pickedEl) return noop;
  const input: HTMLInputElement = inputEl;
  const list: HTMLUListElement = listEl;
  const status: HTMLElement = statusEl;
  const picked: HTMLButtonElement = pickedEl;

  let results: readonly PlaceRow[] = [];
  let active = -1;
  // The search in flight: an answer to an earlier one, or one that arrives after the list was
  // closed, is dropped.
  let asked = 0;
  let waiting: ReturnType<typeof setTimeout> | undefined;

  function close(): void {
    asked += 1;
    clearTimeout(waiting);
    list.hidden = true;
    status.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    active = -1;
  }

  function setActive(index: number): void {
    active = index;
    Array.from(list.children).forEach((option, at) => {
      option.setAttribute('aria-selected', String(at === index));
    });
    const option = list.children[index];
    if (option) {
      input.setAttribute('aria-activedescendant', option.id);
      option.scrollIntoView({ block: 'nearest' });
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  }

  function say(message: string): void {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    status.textContent = message;
    status.hidden = false;
  }

  /** Asks the server once the typing pauses; shorter than two letters is not a search. */
  function search(): void {
    const query = input.value;
    if (!isSearchable(query)) return close();
    asked += 1;
    const mine = asked;
    clearTimeout(waiting);
    waiting = setTimeout(() => {
      void searchPlaces(query).then((rows) => {
        if (mine === asked) render(rows);
      });
    }, SEARCH_PAUSE_MS);
  }

  function render(rows: readonly PlaceRow[] | null): void {
    if (rows === null) return say(strings.searchFailed);
    results = rows;
    if (results.length === 0) return say(strings.searchEmpty);
    status.hidden = true;
    list.replaceChildren(
      ...results.map((row, index) => {
        const option = document.createElement('li');
        option.id = `cs-place-option-${index}`;
        option.className = 'cs-place__option';
        option.setAttribute('role', 'option');
        option.setAttribute('aria-selected', 'false');
        option.dataset['index'] = String(index);
        const city = document.createElement('span');
        city.className = 'cs-place__city';
        city.textContent = row[1];
        const meta = document.createElement('span');
        meta.className = 'cs-place__meta';
        meta.textContent = describe(row, language);
        option.append(city, meta);
        return option;
      }),
    );
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    setActive(-1);
  }

  function pick(index: number): void {
    const row = results[index];
    if (!row) return;
    input.value = '';
    close();
    handlers.onPick(placeView(row, language, strings.chipPlaces));
  }

  function show(view: DestinationView | null): void {
    const field = input.parentElement;
    if (view === null) {
      picked.hidden = true;
      if (field) field.hidden = false;
      return;
    }
    input.value = '';
    close();
    if (field) field.hidden = true;
    picked.hidden = false;
    picked.style.background = view.bg;
    picked.setAttribute('aria-label', fill(strings.removePlace, { city: view.place }));
    setText(csEl(picked, 'place-picked-city'), view.city);
    const critter = csEl(picked, 'place-picked-critter');
    if (critter) {
      critter.setAttribute('kind', view.kind);
      critter.setAttribute('seed', String(view.seed));
    }
  }

  input.addEventListener('input', search);
  input.addEventListener('keydown', (event) => {
    const open = !list.hidden;
    if (event.key === 'ArrowDown' && open) {
      event.preventDefault();
      setActive((active + 1) % results.length);
    } else if (event.key === 'ArrowUp' && open) {
      event.preventDefault();
      setActive((active - 1 + results.length) % results.length);
    } else if (event.key === 'Enter') {
      // Enter in the search never sends the form: it picks the highlighted (or first) place.
      event.preventDefault();
      if (open) pick(active === -1 ? 0 : active);
    } else if (event.key === 'Escape') {
      if (open || !status.hidden) close();
      else input.value = '';
    }
  });
  // Close on blur, after a tap on an option has had its turn.
  input.addEventListener('blur', () => setTimeout(close, 120));
  list.addEventListener('pointerdown', (event) => event.preventDefault());
  list.addEventListener('click', (event) => {
    const option = (event.target as Element).closest<HTMLElement>('[role="option"]');
    if (option) pick(Number(option.dataset['index']));
  });
  picked.addEventListener('click', () => {
    handlers.onClear();
    input.focus();
  });

  return {
    show,
    hasUnpickedText: () => picked.hidden && input.value.trim() !== '',
    focus: () => input.focus(),
  };
}
