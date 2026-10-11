/**
 * The passport's data page on Edit profile (9.02), tilted on the desk and updating as the fields
 * change: photo with a glass "Change" pill, name, username, home airport and the machine line.
 */
import { mrzName } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { GlassPill, Text, TierLabel, usePremiumTheme } from '@/ui/premium';

import type { ProfileModel } from '../../profile/profile-model';
import { PASS_PAPER, PASS_PAPER_TYPE } from '../pass-paper';
import { PremiumProfileFace } from '../profile/profile-face';

// eslint-disable-next-line lingui/no-unlocalized-strings -- a CSS pattern, never copy.
const HATCH = 'repeating-linear-gradient(115deg, rgba(23,20,42,.035) 0 1px, transparent 1px 6px)';

export interface DataPageProps {
  readonly model: ProfileModel | null;
  readonly name: string;
  readonly username: string;
  readonly homeAirport: string | null;
  readonly photoUri: string | null;
  readonly onChangePhoto: () => void;
}

function Field({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <View>
      <Text variant="mono" color={PASS_PAPER.faint} style={{ fontSize: PASS_PAPER_TYPE.label }}>
        {label}
      </Text>
      <Text
        variant={big === true ? 'title' : 'rowTextStrong'}
        color={PASS_PAPER.ink}
        numberOfLines={1}
      >
        {value === '' ? '—' : value}
      </Text>
    </View>
  );
}

export function DataPage({
  model,
  name,
  username,
  homeAirport,
  photoUri,
  onChangePhoto,
}: DataPageProps) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  return (
    <View
      testID="you-edit-data-page"
      style={{
        marginHorizontal: th.space.gap16,
        minHeight: 214,
        borderRadius: th.radius.cardRow,
        padding: th.space.gap14,
        backgroundColor: th.accent.paper,
        experimental_backgroundImage: HATCH,
        boxShadow: th.shadow.card,
        // eslint-disable-next-line lingui/no-unlocalized-strings -- a CSS angle, never copy.
        transform: [{ rotate: '-1.2deg' }],
        gap: th.space.gap10,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text variant="mono" color={PASS_PAPER.label} style={{ fontSize: PASS_PAPER_TYPE.header }}>
          {t({ id: 'you.premium.passHeader', message: 'CRITTERPASS · PASSPORT' })}
        </Text>
        {model?.ring == null ? null : <TierLabel tier={model.ring} />}
      </View>
      <View style={{ flexDirection: 'row', gap: th.space.gap14 }}>
        <View style={{ width: 104, height: 124, borderRadius: 12, overflow: 'hidden' }}>
          <PremiumProfileFace
            avatar={model?.avatar ?? { kind: 'initials' }}
            name={name}
            ring={null}
            photoUri={photoUri}
            size={104}
          />
          <View style={{ position: 'absolute', bottom: 6, alignSelf: 'center' }}>
            <GlassPill
              label={t({ id: 'you.premium.change', message: 'Change' })}
              onPress={onChangePhoto}
              testID="you-edit-change-photo"
            />
          </View>
        </View>
        <View style={{ flex: 1, gap: th.space.gap8 }}>
          <Field
            label={t({ id: 'you.premium.givenName', message: 'GIVEN NAME · PRÉNOM' })}
            value={name}
            big
          />
          <Field
            label={t({ id: 'you.premium.handle', message: 'USERNAME' })}
            value={username === '' ? '' : `@${username}`}
          />
          <Field label={t({ id: 'you.premium.home', message: 'HOME' })} value={homeAirport ?? ''} />
        </View>
      </View>
      <Text variant="mono" color={PASS_PAPER.mrz} numberOfLines={1}>
        {/* eslint-disable-next-line lingui/no-unlocalized-strings -- the machine-readable line. */}
        {`P<CP${mrzName(name)}`.padEnd(30, '<')}
      </Text>
    </View>
  );
}
