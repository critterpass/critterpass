/**
 * Local-only season research candidates for the console's season review, written the way the
 * monthly research job queues them (unreviewed, `web: <host>` source, fetched day). Idempotent.
 */
import type pg from 'pg';

const CANDIDATES = [
  {
    key: 'research-kyoto-arashiyama-hanatouro',
    kind: 'festival',
    name: 'Arashiyama Hanatouro',
    starts_on: '2026-12-12',
    ends_on: '2026-12-21',
    source_url: 'https://www.hanatouro.jp/e/arashiyama/',
  },
  {
    key: 'research-kyoto-okera-mairi',
    kind: 'ceremony',
    name: 'Okera Mairi at Yasaka Shrine',
    starts_on: '2026-12-31',
    ends_on: '2027-01-01',
    source_url: 'https://www.yasaka-jinja.or.jp/en/event/',
  },
] as const;

export async function seedSeasonReview(client: pg.Client): Promise<void> {
  const { rows } = await client.query<{ id: string }>(
    "SELECT id FROM destinations WHERE slug = 'kyoto'",
  );
  const kyoto = rows[0]?.id;
  if (kyoto === undefined) return;
  for (const candidate of CANDIDATES) {
    await client.query(
      `INSERT INTO season_events (destination_id, key, kind, name, starts_on, ends_on, confidence,
         source, source_url, sourced_on)
       VALUES ($1, $2, $3, $4, $5, $6, 'confirmed', $7, $8, '2026-09-28')
       ON CONFLICT (destination_id, key) DO NOTHING`,
      [
        kyoto,
        candidate.key,
        candidate.kind,
        candidate.name,
        candidate.starts_on,
        candidate.ends_on,
        `web: ${new URL(candidate.source_url).hostname.replace(/^www\./, '')}`,
        candidate.source_url,
      ],
    );
  }
}
