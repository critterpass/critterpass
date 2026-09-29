/**
 * CENAPRED (Mexico's national disaster prevention centre) Popocatépetl alert traffic light: every
 * morning CENAPRED posts "Monitoreo del volcán Popocatépetl, hoy …" on gob.mx, stating the
 * "Semáforo de Alerta Volcánica" (Verde; Amarillo Fase 1–3; Rojo Fase 1–2). The refresh reads the
 * gob.mx article archive for the newest such post, then the post for the light. Verde is normal
 * (1), Amarillo Fase 1–2 advisory (2), Amarillo Fase 3 watch (3) and Rojo warning (4). A reading
 * expires three days after its post, so a lapse in the daily reports shows as missing data rather
 * than an old light.
 *
 * Terms (gob.mx términos y condiciones): gob.mx information is public unless marked otherwise, and
 * whoever processes it must cite its electronic location and the date it was consulted: every
 * reading keeps the post's link and its fetch time. robots.txt allows all agents. The level is
 * read as a fact; no CENAPRED text or image is republished. (The CENAPRED technical report on
 * cenapred.unam.mx refuses datacenter and automated clients, so it is not read.)
 */
import type { HazardLevel } from '@cp/domain';
import type { SupplierHttp } from '@cp/suppliers';

import type { HazardReading } from './refresh';

export const CENAPRED_ARCHIVE_URL = 'https://www.gob.mx/cenapred/es/archivo/articulos';
const GOB_MX = 'https://www.gob.mx';
const EXPIRES_AFTER_MS = 3 * 86_400_000;
/** Mexico City keeps UTC−6 all year. */
const CDMX_OFFSET = '-06:00';

export interface CenapredPost {
  readonly url: string;
  readonly published_at: Date;
}

const ARTICLE =
  /<time date="(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})">[\s\S]*?<h2>([^<]*)<\/h2>[\s\S]*?href="(\/cenapred\/[^"]+)"/g;

/** The newest Popocatépetl monitoring post in the archive page (a jQuery-escaped HTML fragment). */
export function parseCenapredArchive(script: string): CenapredPost {
  const html = script.replace(/\\"/g, '"').replace(/\\\//g, '/');
  for (const [, day, time, title = '', href = ''] of html.matchAll(ARTICLE)) {
    if (!/popocat[eé]petl/i.test(title)) continue;
    const published = new Date(`${day}T${time}${CDMX_OFFSET}`);
    if (Number.isNaN(published.getTime())) continue;
    return { url: `${GOB_MX}${href.replace(/&amp;/g, '&')}`, published_at: published };
  }
  throw new Error('CENAPRED archive had no Popocatépetl report');
}

const ENTITIES: Readonly<Record<string, string>> = {
  nbsp: ' ',
  quot: '"',
  amp: '&',
  aacute: 'á',
  eacute: 'é',
  iacute: 'í',
  oacute: 'ó',
  uacute: 'ú',
};

const text = (html: string) =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(\w+);/g, (entity, name: string) => ENTITIES[name] ?? entity)
    .replace(/\s+/g, ' ');

const LIGHT =
  /Sem[aá]foro de Alerta Volc[aá]nica del Popocat[eé]petl se encuentra en (VERDE|AMARILLO|ROJO)(?: FASE (\d))?/i;

function levelFor(colour: string, phase: number | undefined): HazardLevel {
  if (colour === 'verde') return 1;
  if (colour === 'rojo') return 4;
  return phase === 3 ? 3 : 2;
}

export function parseCenapredReport(html: string, post: CenapredPost): HazardReading {
  const match = text(html).match(LIGHT);
  if (match === null) throw new Error('CENAPRED report had no alert light');
  const colour = (match[1] ?? '').toLowerCase();
  const phase = match[2] === undefined ? undefined : Number(match[2]);
  const label = `${colour.charAt(0).toUpperCase()}${colour.slice(1)}${phase === undefined ? '' : ` Fase ${phase}`}`;
  return {
    source: 'cenapred',
    kind: 'volcano',
    subject: 'Popocatepetl',
    level: levelFor(colour, phase),
    level_label: label,
    headline: `Popocatépetl volcanic alert light: ${label} (CENAPRED)`,
    source_url: post.url,
    issued_at: post.published_at,
    expires_at: new Date(post.published_at.getTime() + EXPIRES_AFTER_MS),
  };
}

export async function fetchCenapred(
  http: SupplierHttp,
  signal?: AbortSignal,
): Promise<HazardReading[]> {
  const common = { supplier: 'cenapred', timeoutMs: 30_000, ...(signal ? { signal } : {}) };
  const archive = await http.request({
    ...common,
    endpoint: 'article_archive',
    url: CENAPRED_ARCHIVE_URL,
    headers: { Accept: 'text/javascript, text/html' },
  });
  const post = parseCenapredArchive(archive.body);
  const report = await http.request({
    ...common,
    endpoint: 'popocatepetl_report',
    url: post.url,
    headers: { Accept: 'text/html' },
  });
  return [parseCenapredReport(report.body, post)];
}
