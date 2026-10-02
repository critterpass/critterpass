/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
/** How many SOS this person raised since local midnight (the fourth asks once more). */
export const TODAY_SQL = `
  SELECT count(*) AS n FROM help_sessions
   WHERE kind = 'sos' AND user_id = ? AND opened_at >= ?`;
export const TODAY_TABLES = ['help_sessions'] as const;

/** The numbers crewmates show the crew: the no-data SMS goes to them. */
export const PHONES_SQL = `
  SELECT cc.phone_display FROM crew_contact_cards cc JOIN trips t ON t.crew_id = cc.crew_id
   WHERE t.id = ? AND cc.user_id <> ? AND cc.phone_display IS NOT NULL`;
export const PHONES_TABLES = ['crew_contact_cards', 'trips'] as const;

export const PLATFORM = { ios: 'ios', android: 'android' } as const;
