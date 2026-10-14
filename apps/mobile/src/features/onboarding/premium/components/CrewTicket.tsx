/**
 * The crew ticket (2.14; reused by crew invites and store shots): a white boarding-pass card with
 * a colour strip carrying the dates sticker and Tokek, a mono header (CRITTERPASS AIR · the crew),
 * the YOU → place route, a perforation with ground-coloured notches, and three facts. `expired`
 * greys it and lays a rectangular stamp across (2.17).
 */
import { t } from '@lingui/core/macro';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { CritterSticker, Icon, Tag, Text, usePremiumTheme } from '@/ui/premium';

export interface CrewTicketProps {
  readonly crew: string;
  /** The invite's code, printed top right like a booking reference; the crew's name without one. */
  readonly code?: string | null;
  readonly placeCode: string;
  readonly place: string | null;
  readonly facts: readonly { readonly label: string; readonly value: string }[];
  readonly dateTag?: string;
  readonly guide?: { readonly kind: string; readonly name: string };
  readonly faded?: boolean;
  /** Laid over the card (the EXPIRED stamp). */
  readonly overlay?: ReactNode;
  readonly testID?: string;
}

export function CrewTicket({
  crew,
  code = null,
  placeCode,
  place,
  facts,
  dateTag,
  guide,
  faded = false,
  overlay,
  testID,
}: CrewTicketProps) {
  const theme = usePremiumTheme();
  const notch = { width: 20, height: 20, borderRadius: 10, backgroundColor: theme.color.ground };
  return (
    <View testID={testID}>
      <View
        style={{
          borderRadius: theme.radius.cardLarge,
          backgroundColor: theme.color.card,
          boxShadow: theme.shadow.card,
          opacity: faded ? 0.55 : 1,
        }}
      >
        <View
          style={{
            margin: 8,
            height: 110,
            borderRadius: theme.radius.banner,
            backgroundColor: theme.accent.sky,
            justifyContent: 'flex-start',
            padding: 18,
          }}
        >
          {dateTag === undefined ? null : (
            <Tag label={dateTag} color={theme.accent.sun} rotate={-7} />
          )}
        </View>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            gap: theme.space.gap12,
            paddingHorizontal: 18,
            paddingTop: 6,
          }}
        >
          {/* A ticket's mono header prints in capitals. */}
          <Text variant="mono" tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
            {t({
              id: 'onboarding.invite.ticket.head',
              message: 'CritterPass Air · crew ticket',
            }).toLocaleUpperCase()}
          </Text>
          <Text variant="mono" tone="muted" numberOfLines={1} style={{ maxWidth: '40%' }}>
            {(code ?? crew).toLocaleUpperCase()}
          </Text>
        </View>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.space.gap12,
            paddingHorizontal: 18,
            paddingTop: 10,
            paddingBottom: 16,
          }}
        >
          <Text variant="stat">{t({ id: 'onboarding.invite.ticket.you', message: 'You' })}</Text>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <View
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                borderTopWidth: 2,
                borderStyle: 'dashed',
                borderColor: theme.color.outlineEmpty,
              }}
            />
            <View
              style={{
                width: 28,
                height: 24,
                borderRadius: 8,
                backgroundColor: theme.color.card,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="forward" size={14} color={theme.color.inkSecondary} />
            </View>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text variant="stat">{placeCode}</Text>
            {place === null ? null : (
              <Text variant="caption" tone="muted" style={{ fontWeight: '400' }}>
                {place}
              </Text>
            )}
          </View>
        </View>
        <View style={{ height: 20, justifyContent: 'center' }}>
          <View
            style={{
              marginHorizontal: 18,
              borderTopWidth: 2,
              borderStyle: 'dashed',
              borderColor: theme.color.fieldBorder,
            }}
          />
          <View style={[notch, { position: 'absolute', left: -10 }]} />
          <View style={[notch, { position: 'absolute', right: -10 }]} />
        </View>
        <View
          style={{
            flexDirection: 'row',
            gap: theme.space.gap8,
            paddingHorizontal: 18,
            paddingTop: 10,
            paddingBottom: 16,
          }}
        >
          {facts.map((fact) => (
            <View key={fact.label} style={{ flex: 1 }}>
              <Text variant="captionMuted">{fact.label}</Text>
              {/* Every value at the same size: a long one wraps rather than shrinking alone. */}
              <Text variant="headline" numberOfLines={2}>
                {fact.value}
              </Text>
            </View>
          ))}
        </View>
      </View>
      {guide === undefined || faded ? null : (
        <View pointerEvents="none" style={{ position: 'absolute', right: -10, top: -40 }}>
          <CritterSticker kind={guide.kind} name={guide.name} size={84} pose="wave" />
        </View>
      )}
      {overlay}
    </View>
  );
}
