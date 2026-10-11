/**
 * 2.18 a full trip, inside the ticket page: the seats in the crew's colours with an empty dashed
 * one, "{crew} is full at {cap}", the place in line the newcomer would get, and the boost hint
 * (only the organiser can boost; the newcomer can ask them once in). Joining the waitlist is the
 * page's main button.
 */
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { Text, usePremiumTheme } from '@/ui/premium';

import type { TicketModel } from '../../invited/ticket-model';
import { memberAccent } from '../components/member-colour';

export function FullTripPanel({ model }: { readonly model: TicketModel }) {
  const theme = usePremiumTheme();
  const crew = model.crewName ?? '';
  const cap = model.seat?.cap ?? 0;
  const position = model.waitlistAhead + 1;
  return (
    <View
      style={{
        borderRadius: theme.radius.cardRow,
        backgroundColor: theme.color.card,
        boxShadow: theme.shadow.card,
        padding: 18,
        gap: theme.space.gap12,
        alignItems: 'center',
      }}
      testID="invite-full"
    >
      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
        {model.members.slice(0, cap).map((member, index) => (
          <View
            key={`${member.name}-${String(index)}`}
            style={{
              width: 36,
              height: 40,
              borderTopLeftRadius: 12,
              borderTopRightRadius: 12,
              borderBottomLeftRadius: 8,
              borderBottomRightRadius: 8,
              backgroundColor: memberAccent(theme, member.colour),
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text variant="avatarInitialSmall" tone="onAccent">
              {[...member.name][0] ?? '?'}
            </Text>
          </View>
        ))}
        <View
          style={{
            width: 36,
            height: 40,
            borderRadius: 10,
            borderWidth: 2,
            borderStyle: 'dashed',
            borderColor: theme.color.outlineEmpty,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text variant="rowTitle" tone="muted">
            +
          </Text>
        </View>
      </View>
      <Text variant="title" align="center">
        {t({ id: 'onboarding.premium.full.title', message: `${crew} is full at ${cap}` })}
      </Text>
      <Text variant="rowText" tone="muted" align="center">
        {t({
          id: 'onboarding.premium.full.line',
          message: 'Join the waitlist and you get the next free seat, with a day to take it.',
        })}
      </Text>
      <View
        style={{
          height: 32,
          paddingHorizontal: 12,
          borderRadius: 16,
          backgroundColor: theme.color.status.maybe.bg,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        }}
        testID="invite-full-position"
      >
        <View
          style={{
            width: 20,
            height: 20,
            borderRadius: 10,
            backgroundColor: theme.accent.sun,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text variant="badge" tone="onAccent">
            {String(position)}
          </Text>
        </View>
        <Text variant="label" color={theme.color.status.maybe.text}>
          {position === 1
            ? t({ id: 'onboarding.premium.full.first', message: 'You’d be next in line' })
            : t({
                id: 'onboarding.premium.full.position',
                message: `You’d be number ${position} in line`,
              })}
        </Text>
      </View>
    </View>
  );
}
