/**
 * The paper pass (2.05, 2.11; reused by the profile's passport page): paper with a guilloche of fine
 * rings, tilted a little, the number row in mono, the photo slot (a dashed "?" until a face is
 * picked), the printed fields with their "not yet" states and the MRZ. Paper and its inks stay the
 * same in dark mode, like every printed document.
 */
import type { ReactNode } from 'react';
import { Image, View } from 'react-native';

import { PrivateContent } from '@/features/help';
import { useLocale } from '@/lib/i18n/use-locale';
import { CritterSticker, Text, usePremiumTheme } from '@/ui/premium';

import { passLabels, type PassFacts } from '../../pass-facts';
import { PAPER_INK } from './onboarding-colours';

export interface PassPaperProps {
  readonly facts: PassFacts;
  /** Replaces the printed name (the name page shows the caret as it types). */
  readonly name?: ReactNode;
  /** Larger issued pass: photo 92×114 and the ISSUED row. */
  readonly size?: 'draft' | 'issued';
  readonly syncing?: boolean;
  readonly rotate?: number;
  /** Stamps laid over the page (absolutely placed by the caller). */
  readonly children?: ReactNode;
  readonly testID?: string;
}

function Field({
  label,
  value,
  pending,
  big = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly pending: boolean;
  readonly big?: boolean;
}) {
  const theme = usePremiumTheme();
  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text variant="badge" color={PAPER_INK.label}>
        {label}
      </Text>
      <Text
        variant={big ? 'title' : 'label'}
        color={pending ? PAPER_INK.pending : theme.color.onAccent}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

/** The issued pass's room between its fields and the MRZ, where the stamps land. */
const ISSUED_STAMP_BAND = 44;

export function PassPaper({
  facts,
  name,
  size = 'draft',
  syncing = false,
  rotate = -1.5,
  children,
  testID = 'onboarding-pass',
}: PassPaperProps) {
  const theme = usePremiumTheme();
  const locale = useLocale();
  const labels = passLabels(locale);
  const issued = size === 'issued';
  const photo = issued ? { w: 92, h: 114 } : { w: 68, h: 84 };
  const face = facts.face;
  const style = (
    <Field
      label={labels.style}
      value={facts.style ?? labels.weWillAsk}
      pending={facts.style === null}
    />
  );
  return (
    <PrivateContent>
      <View
        testID={testID}
        style={{
          borderRadius: issued ? theme.radius.cardRow : theme.radius.card,
          backgroundColor: theme.accent.paper,
          padding: issued ? 18 : 14,
          paddingHorizontal: issued ? 18 : 16,
          gap: issued ? theme.space.gap14 : theme.space.gap10,
          boxShadow: theme.shadow.card,
          transform: [{ rotate: `${String(rotate)}deg` }],
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text variant="mono" color={PAPER_INK.label}>
            {labels.head}
          </Text>
          <Text variant="mono" color={PAPER_INK.label} testID="onboarding-pass-number">
            {syncing ? `${facts.number} · ${labels.syncing}` : facts.number}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: theme.space.gap14 }}>
          <View
            style={{
              width: photo.w,
              height: photo.h,
              borderRadius: theme.radius.dayBadge,
              borderWidth: face.kind === 'empty' ? 2 : 0,
              borderStyle: 'dashed',
              borderColor: PAPER_INK.slot,
              backgroundColor: face.kind === 'empty' ? 'transparent' : theme.color.status.booked.bg,
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            {face.kind === 'guide' ? (
              <CritterSticker
                kind={face.critter}
                name={face.name}
                seed={face.seed}
                size={photo.w - 4}
                edge={false}
              />
            ) : face.kind === 'photo' ? (
              <Image
                source={{ uri: face.uri }}
                style={{ width: photo.w, height: photo.h }}
                accessibilityIgnoresInvertColors
              />
            ) : (
              <Text variant="stat" color={PAPER_INK.slotMark}>
                ?
              </Text>
            )}
          </View>
          <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.gap8 }}>
            <View style={{ width: '100%' }}>
              <Text variant="badge" color={PAPER_INK.label}>
                {labels.givenName}
              </Text>
              {name ?? (
                <Text variant="title" color={theme.color.onAccent} numberOfLines={1}>
                  {facts.name.length > 0 ? facts.name : labels.notYet}
                </Text>
              )}
            </View>
            {/* Two columns (2.05 HOME | STYLE, 2.11 HOME | ISSUED), then the issued pass's style
                across: one column grew the card until the stamps landed on the words. */}
            <View style={{ width: '100%', flexDirection: 'row', gap: theme.space.gap12 }}>
              <Field
                label={labels.home}
                value={facts.home ?? labels.notYet}
                pending={facts.home === null}
              />
              {issued ? (
                <Field
                  label={labels.issued}
                  value={facts.issued ?? labels.notYet}
                  pending={facts.issued === null}
                />
              ) : (
                style
              )}
            </View>
            {issued ? <View style={{ width: '100%', flexDirection: 'row' }}>{style}</View> : null}
          </View>
        </View>
        {/* The issued pass keeps the guilloche band above its MRZ (2.11): the stamps land there,
            on the paper and the code, never on the printed words. */}
        <View
          style={[
            { borderTopWidth: 1.5, borderStyle: 'dashed', borderColor: PAPER_INK.slot },
            issued ? { marginTop: ISSUED_STAMP_BAND } : null,
          ]}
        >
          {facts.mrz.map((line) => (
            <Text key={line} variant="mono" color={PAPER_INK.label} numberOfLines={1}>
              {line}
            </Text>
          ))}
        </View>
        {children}
      </View>
    </PrivateContent>
  );
}
