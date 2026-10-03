/**
 * Recap push copy (catalog id + source message; the worker renders it per recipient): N-32 when a
 * trip's recap is ready, once per recap, and N-35 a year later, quietly.
 */
export const RECAP_PUSH = {
  readyTitle: /*i18n*/ {
    id: 'notifications.recap.ready.title',
    message: '{place}, the recap',
  },
  readyBody: /*i18n*/ {
    id: 'notifications.recap.ready.body',
    message: 'Your {place} recap is ready. Come and see what the crew got up to.',
  },
  anniversaryTitle: /*i18n*/ {
    id: 'notifications.recap.anniversary.title',
    message: 'One year ago today',
  },
  anniversaryBody: /*i18n*/ {
    id: 'notifications.recap.anniversary.body',
    message: '{place}, a year on. Remember this?',
  },
} as const;
