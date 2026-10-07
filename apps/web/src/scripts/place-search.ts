/* eslint-disable lingui/no-unlocalized-strings -- selectors, ARIA plumbing and key names; the words
   arrive translated in the page strings (src/scripts/page-strings.ts). */
/**
 * "Somewhere else?": a combobox over the bundled place list (catalogue cities, then airport
 * cities). The list is fetched the first time the field is focused. A visitor can only pick a
 * listed place: what they type is a query, never a destination. A pick replaces the field with a
 * chip of the same height, so the ticket never changes size.
 */
import { placeView } from '../lib/destination-view';
import type { DestinationView } from '../lib/destination-view';
import { indexPlaces, searchPlaces } from '../lib/place-search';
import type { PlaceRow, SearchablePlace } from '../lib/place-search';
import { csEl, setText } from './dom';
import { fill } from './page-strings';
import type { PageStrings } from './page-strings';
import { fetchPlace, fetchPlaces } from './waitlist-api';

export interface PlaceSearch {
  /** Shows `view` as the picked place, or the empty search field for `null`. */
  show(view: DestinationView | null): void;
  /** Text was typed but no place picked: the form must not be sent as if it named a place. */
  hasUnpickedText(): boolean;
  focus(): void;
}

type Strings = Pick<PageStrings, 'searchEmpty' | 'searchFailed' | 'removePlace' | 'chipPlaces'>;

function countryName(code: string, language: string): string {
  try {
    return new Intl.DisplayNames([language], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** The line under a city: its guide where the guide is a public one, and its country. */
function describe(row: PlaceRow, language: string): string {
  const country = countryName(row[2], language);
  return row[3] === 0 && row[4] !== '' ? `${row[4]} · ${country}` : country;
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

  let places: readonly SearchablePlace[] | null = null;
  let loading: Promise<void> | null = null;
  let results: readonly PlaceRow[] = [];
  let active = -1;

  function load(): Promise<void> {
    loading ??= fetchPlaces().then((rows) => {
      if (rows === null) {
        loading = null;
        return;
      }
      places = indexPlaces(rows);
    });
    return loading;
  }

  function close(): void {
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

  function render(): void {
    const query = input.value;
    if (query.trim() === '') return close();
    if (places === null) return say(strings.searchFailed);
    results = searchPlaces(places, query);
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
    const view = placeView(row, language, strings.chipPlaces);
    if (view !== null) return handlers.onPick(view);
    // A catalogue city: the server says who lives there, for this one place.
    void fetchPlace(row[0]).then((named) => {
      if (named === null) say(strings.searchFailed);
      else handlers.onPick(named);
    });
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

  input.addEventListener('focus', () => void load());
  input.addEventListener('input', () => {
    void load().then(render);
  });
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
