/**
 * The Settings lab scenes (3n-2, 3n-6, and Sound, 3n-7): the real sections and views over the
 * render's values, every handler a no-op.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, never shipped copy. */
import { bundledAppIconKeys } from '@/lib/app-icon';

import { APP_ICON_PREVIEWS } from '../app-icon/app-icon-previews';
import { AppIconView, type AppIconProblem } from '../app-icon/app-icon-view';
import { pickerModel, type IconUnlock } from '../app-icon/picker-model';
import { useSettingsSections } from '../settings/settings-sections';
import { SettingsView } from '../settings/settings-view';
import { SoundView } from '../sound/sound-view';

const noop = () => undefined;

export function Settings() {
  const sections = useSettingsSections(
    {
      chattiness: 'normal',
      talkOutLoud: true,
      leaveByThroughDnd: true,
      hideTasteTags: false,
      hideLockscreenDetails: false,
      crewChat: 'mentions',
      location: 'trips',
      mailbox: {
        title: 'Find bookings in my email',
        subtitle: 'Read-only, confirmations only',
      },
      helpShare: false,
      hideCollection: false,
      soundEffects: true,
      music: 'Gamelan lo-fi, follows your guide',
      account: true,
      dataExport: { line: 'Plans, photos and chat as a zip', enabled: true },
      language: 'English · prices in S$ and local',
      appIcon: true,
      storeName: 'On the App Store',
      ideasToVote: 48,
    },
    {
      onSynced: noop,
      onCrewChat: noop,
      onPings: noop,
      onLocation: noop,
      onMailbox: noop,
      onHelpShare: noop,
      onOfflineTrips: noop,
      onSoundEffects: noop,
      onMusic: noop,
      onLanguage: noop,
      onAppIcon: noop,
      onSignOut: noop,
      onRate: noop,
      onFeedback: noop,
      onIdea: noop,
      onHelpCentre: noop,
      onDataExport: noop,
      onDeleteAccount: noop,
    },
  );
  return (
    <SettingsView
      sections={sections}
      version="CRITTERPASS 1.0 (214)"
      onTokek={noop}
      onBack={noop}
    />
  );
}

/** 3n-7 as rendered: music on, Tokek's theme following the guide, every effect on. */
export function Sound({ musicOn = true }: { readonly musicOn?: boolean }) {
  return (
    <SoundView
      values={{
        musicEnabled: musicOn,
        musicVolume: 0.6,
        effectsVolume: 0.8,
        stickers: true,
        critterVoices: true,
        quietOnTheRoad: true,
        haptics: true,
        themes: ['tokek', 'pon', 'lundi'],
        current: 'tokek',
        pinned: false,
      }}
      handlers={{
        onMusic: noop,
        onMusicVolume: noop,
        onEffectsVolume: noop,
        onStickers: noop,
        onCritterVoices: noop,
        onQuiet: noop,
        onHaptics: noop,
        onTheme: noop,
        onFollow: noop,
        onBack: noop,
      }}
    />
  );
}

/** 3n-5 with the icons the app bundles: one earned icon open and new, the rest locked. */
export function AppIcon(props: {
  readonly current?: string | null;
  readonly unlocks?: readonly IconUnlock[];
  readonly problem?: AppIconProblem;
}) {
  return (
    <AppIconView
      model={pickerModel({
        bundled: bundledAppIconKeys(['face', 'pon', 'sardi', 'temple']),
        previewed: new Set(Object.keys(APP_ICON_PREVIEWS)),
        currentNativeName: props.current ?? null,
        unlocks: props.unlocks ?? [{ iconKey: 'sardi', seen: false }],
        passPlus: false,
      })}
      switching={null}
      problem={props.problem ?? null}
      onChoose={noop}
      onBack={noop}
    />
  );
}
