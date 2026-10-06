/**
 * "Getting there from {home city}" on All days: the real ways to make the journey (flight, train,
 * bus, car, boat), each with about how long it takes and about what it costs one person, the line
 * that says they are web estimates and the pages they were written from. While the estimate is
 * being written the guide says so; when none was found, or it could not be loaded, the card says
 * that instead of showing a guess.
 */
import { formatMoney, money, roundEstimate } from '@cp/cost-engine';
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { Linking, View } from 'react-native';

import { sourcesOf, type WayThere } from '@/data/areas/getting-there';
import { travelLegLabel } from '@/data/areas/travel-line';
import type { GettingThereState } from '@/data/areas/use-getting-there';
import { useLocale } from '@/lib/i18n/use-locale';
import { TextLink } from '@/ui/buttons/TextLink';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

export interface GettingThereSectionProps {
  readonly state: GettingThereState;
  /** The trip's destination, as its row names it. */
  readonly place: string;
  readonly guide: string;
  readonly onRetry: () => void;
}

/** The pages named under the card: enough to check the figures, not a bibliography. */
const SOURCES_SHOWN = 3;

const useStyles = makeStyles((t) => ({
  section: { gap: t.space['8'] },
  card: {
    borderRadius: t.radius.lg,
    backgroundColor: t.semantic.bg.raised,
    paddingHorizontal: t.space['14'],
  },
  way: { paddingVertical: t.space['12'], gap: t.space['2'] },
  divider: { borderTopWidth: 1, borderTopColor: t.color.divider },
  quiet: { paddingVertical: t.space['12'], gap: t.space['4'], alignItems: 'flex-start' },
  sources: { gap: t.space['2'], alignItems: 'flex-start' },
}));

function hostOf(url: string): string {
  const match = /^https?:\/\/(?:www\.)?([^/?#]+)/i.exec(url);
  return match?.[1] ?? url;
}

function costText(locale: string, cost: NonNullable<WayThere['cost']>): string {
  return formatMoney(roundEstimate(money(BigInt(Math.round(cost.amountMinor)), cost.currency)), {
    locale,
    mode: 'local',
  });
}

export function GettingThereSection({ state, place, guide, onRetry }: GettingThereSectionProps) {
  const { t } = useLingui();
  const locale = useLocale();
  const styles = useStyles();
  const theme = useTheme();
  const secondary = theme.semantic.text.secondary;
  const city = state.status === 'ready' || state.status === 'none' ? state.origin.city : null;
  const title =
    city === null
      ? t({ id: 'plan.allDays.gettingThere.titlePlain', message: 'Getting there' })
      : t({ id: 'plan.allDays.gettingThere.title', message: `Getting there from ${city}` });
  const tryAgain = (
    <TextLink
      label={t({ id: 'plan.allDays.gettingThere.retry', message: 'Try again' })}
      onPress={onRetry}
      testID="getting-there-retry"
    />
  );
  const quiet = (line: string, action = false) => (
    <View style={styles.card}>
      <View style={styles.quiet}>
        <Text variant="body" color={secondary} testID={`getting-there-${state.status}`}>
          {line}
        </Text>
        {action ? tryAgain : null}
      </View>
    </View>
  );
  const body = () => {
    switch (state.status) {
      case 'loading':
        return quiet(
          t({
            id: 'plan.allDays.gettingThere.loading',
            message: `${guide} is looking up the ways to get there. The first look takes about a minute.`,
          }),
        );
      case 'slow':
        return quiet(
          t({
            id: 'plan.allDays.gettingThere.slow',
            message: `${guide} is still looking. This is taking longer than usual.`,
          }),
          true,
        );
      case 'no_home':
        return quiet(
          t({
            id: 'plan.allDays.gettingThere.noHome',
            message: 'Add your home airport to your profile to see the ways to get there.',
          }),
        );
      case 'none': {
        const home = state.origin.city;
        return quiet(
          t({
            id: 'plan.allDays.gettingThere.none',
            message: `${guide} found no way from ${home} to ${place} with a source to back it, so none is shown.`,
          }),
        );
      }
      case 'failed':
        return quiet(
          state.reason === 'offline'
            ? t({
                id: 'plan.allDays.gettingThere.offline',
                message: 'You’re offline. The ways to get there load once you’re back online.',
              })
            : t({
                id: 'plan.allDays.gettingThere.failed',
                message: 'The ways to get there didn’t load.',
              }),
          true,
        );
      case 'ready': {
        const sources = sourcesOf(state.ways).slice(0, SOURCES_SHOWN);
        const written =
          state.generatedAt === null
            ? null
            : new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(
                new Date(state.generatedAt),
              );
        return (
          <>
            <View style={styles.card} testID="getting-there-ways">
              {state.ways.map((way, index) => {
                const amount = way.cost === null ? null : costText(locale, way.cost);
                return (
                  <View
                    key={way.mode}
                    style={[styles.way, index === 0 ? null : styles.divider]}
                    testID={`getting-there-way-${way.mode}`}
                  >
                    <Text variant="h3">{travelLegLabel(way)}</Text>
                    {amount === null ? null : (
                      <Text variant="body">
                        {t({
                          id: 'plan.allDays.gettingThere.cost',
                          message: `about ${amount} each, one way`,
                        })}
                      </Text>
                    )}
                    {way.note === null ? null : (
                      <Text variant="bodySm" color={secondary}>
                        {way.note}
                      </Text>
                    )}
                  </View>
                );
              })}
            </View>
            <Text variant="bodySm" color={secondary} testID="getting-there-estimate">
              {written === null
                ? t({
                    id: 'plan.allDays.gettingThere.estimate',
                    message: 'Estimates from the web. Check before you book.',
                  })
                : t({
                    id: 'plan.allDays.gettingThere.estimateDated',
                    message: `Estimates from the web, written ${written}. Check before you book.`,
                  })}
            </Text>
            {sources.length === 0 ? null : (
              <View style={styles.sources} testID="getting-there-sources">
                <Text variant="label" color={secondary}>
                  {t({ id: 'plan.allDays.gettingThere.sources', message: 'Written from' })}
                </Text>
                {sources.map((source, index) => (
                  <TextLink
                    key={source.url}
                    label={source.title ?? hostOf(source.url)}
                    onPress={() => void Linking.openURL(source.url).catch(() => undefined)}
                    testID={`getting-there-source-${String(index)}`}
                  />
                ))}
              </View>
            )}
          </>
        );
      }
    }
  };
  return (
    <View style={styles.section} testID="getting-there">
      <Text variant="eyebrow" numberOfLines={2} singleLine={false}>
        {upper(title, locale)}
      </Text>
      {body()}
    </View>
  );
}
