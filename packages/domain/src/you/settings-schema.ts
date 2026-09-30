/**
 * Synced settings (docs/data-model.md §3.1 `user_settings`, docs/api-contracts.md §4.1
 * `set_settings`): the whitelist a client may patch. Device-only preferences (MMKV) never reach the
 * server; anything not named here is refused, so a stale or hostile client cannot write columns
 * another feature owns (`active_crew_id`, `muted_uids`, `email_import`).
 */
import { z } from 'zod';

import { priceDisplayModeSchema } from '../enums/identity';

export const GUIDE_CHATTINESS_LEVELS = ['quiet', 'normal', 'chatty'] as const;
export const chattinessSchema = z.enum(GUIDE_CHATTINESS_LEVELS);
export type Chattiness = z.infer<typeof chattinessSchema>;

export const CREW_CHAT_MODES = ['all', 'mentions', 'off'] as const;
export const TIME_FORMATS = ['12h', '24h'] as const;
export const DISTANCE_UNITS = ['km', 'mi'] as const;

/** Music follows the guide of the trip under way unless the user pins one theme. */
export const MUSIC_THEME_MODES = ['follow_guide', 'pinned'] as const;

const volume = z.number().min(0).max(1);

/** `user_settings.audio`: every key optional, merged into the stored object. */
export const audioSettingsSchema = z
  .object({
    music_enabled: z.boolean(),
    music_volume: volume,
    theme_mode: z.enum(MUSIC_THEME_MODES),
    theme_id: z.string().min(1).max(64).nullable(),
    sfx_volume: volume,
    sfx_stickers: z.boolean(),
    critter_voices: z.boolean(),
    quiet_on_road: z.boolean(),
    haptics: z.boolean(),
  })
  .partial()
  .strict();
export type AudioSettings = z.infer<typeof audioSettingsSchema>;

/** What the audio object reads as before the user touched anything. */
export const DEFAULT_AUDIO_SETTINGS: Required<AudioSettings> = {
  music_enabled: true,
  music_volume: 0.6,
  theme_mode: 'follow_guide',
  theme_id: null,
  sfx_volume: 0.8,
  sfx_stickers: true,
  critter_voices: true,
  quiet_on_road: true,
  haptics: true,
};

const iso4217 = z.string().regex(/^[A-Z]{3}$/, 'must be an ISO 4217 code');
/** BCP 47 tag of a shipped app locale (`en`, `zh-Hans`, `pt`); the client picks from its list. */
const appLocale = z.string().regex(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/, 'must be a BCP 47 tag');

/** One `set_settings` patch: at least one key, every key a synced setting. */
export const settingsPatchSchema = z
  .object({
    chattiness: chattinessSchema,
    talk_out_loud: z.boolean(),
    leave_by_through_dnd: z.boolean(),
    crew_chat_mode: z.enum(CREW_CHAT_MODES),
    price_display: priceDisplayModeSchema,
    time_format: z.enum(TIME_FORMATS),
    distance_unit: z.enum(DISTANCE_UNITS),
    app_locale: appLocale,
    home_currency_override: iso4217.nullable(),
    hide_lockscreen_details: z.boolean(),
    hide_taste_tags: z.boolean(),
    hide_collection: z.boolean(),
    audio: audioSettingsSchema,
  })
  .partial()
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, { message: 'patch is empty' });
export type SettingsPatch = z.infer<typeof settingsPatchSchema>;

export const setSettingsPayloadSchema = z.object({ patch: settingsPatchSchema }).strict();
export type SetSettingsPayload = z.infer<typeof setSettingsPayloadSchema>;

/** The `user_settings` column each patch key writes; `audio` is merged, never replaced. */
export const SETTINGS_COLUMNS = [
  'chattiness',
  'talk_out_loud',
  'leave_by_through_dnd',
  'crew_chat_mode',
  'price_display',
  'time_format',
  'distance_unit',
  'app_locale',
  'home_currency_override',
  'hide_lockscreen_details',
  'hide_taste_tags',
  'hide_collection',
  'audio',
] as const satisfies readonly (keyof SettingsPatch)[];
export type SettingsColumn = (typeof SETTINGS_COLUMNS)[number];
