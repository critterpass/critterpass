/**
 * Every stamp on the premium page (from the pass's "All n ›"): oldest first, a year filter as
 * pills when there is more than one year, each stamp inked as on the pass. A trip's stamp opens its
 * recap, a self-reported one its form; "Add a past trip" back-fills trips taken before the app.
 */
import { useLingui } from '@lingui/react/macro';
import { ScrollView, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { useLocale } from '@/lib/i18n/use-locale';
import {
  Button,
  EmptyState,
  Icon,
  layoutTransition,
  ListCard,
  PressableScale,
  RoundStamp,
  Row,
  Skeleton,
  Text,
  usePremiumReducedMotion,
  usePremiumTheme,
} from '@/ui/premium';
import { PushScreen } from '@/ui/premium/shell';

import { stampBottom, stampLabel, stampTitle } from '../../profile/profile-copy';
import { stampsForYear, stampYears } from '../../history/stamp-book';
import { stampLine } from '../../history/stamps-copy';
import type { StampsViewProps } from '../../history/stamps-props';

const FACE = 44;
const TILTS = [-12, 8, -6, 10, -9];

export function StampsPremiumView(props: StampsViewProps) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const locale = useLocale();
  const reduced = usePremiumReducedMotion();
  const years = props.stamps === null ? [] : stampYears(props.stamps);
  const shown = props.stamps === null ? [] : stampsForYear(props.stamps, props.year);
  return (
    <PushScreen
      title={t({ id: 'you.stamps.title', message: 'Stamps' })}
      backLabel={t({ id: 'you.profile.backPass', message: 'Pass' })}
      testID="you-stamps"
    >
      {years.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            gap: th.space.gap6,
            paddingHorizontal: th.space.gutter,
            paddingBottom: th.space.gap10,
          }}
        >
          <Button
            label={t({ id: 'you.stamps.allYears', message: 'All' })}
            size="small"
            variant={props.year === null ? 'primary' : 'floating'}
            onPress={() => props.onYear(null)}
            testID="you-stamps-year-all"
          />
          {years.map((year) => (
            <Button
              key={year}
              label={String(year)}
              size="small"
              variant={props.year === year ? 'primary' : 'floating'}
              onPress={() => props.onYear(year)}
              testID={`you-stamps-year-${year}`}
            />
          ))}
        </ScrollView>
      ) : null}
      <View style={{ paddingHorizontal: th.space.gutter, gap: th.space.gap10 }}>
        {props.stamps === null ? (
          <View testID="you-stamps-loading">
            <Skeleton height={220} radius={th.radius.card} />
          </View>
        ) : shown.length === 0 ? (
          <EmptyState
            title={t({ id: 'you.premium.stamps.emptyTitle', message: 'No stamps yet' })}
            line={t({
              id: 'you.premium.stamps.emptyLine',
              message: 'Your first trip stamps your pass.',
            })}
            check={false}
            testID="you-stamps-empty"
          />
        ) : (
          <Animated.View layout={layoutTransition(reduced)}>
            <ListCard radius={20}>
              {shown.map((stamp, index) => {
                const open = props.openerFor(stamp);
                const bottom = stampBottom(stamp, locale);
                return (
                  <Row
                    key={stamp.id}
                    title={stampTitle(stamp, locale)}
                    subtitle={stampLine(stamp, locale)}
                    leading={
                      <View
                        accessible
                        accessibilityLabel={stampLabel(stamp, locale)}
                        style={{ opacity: stamp.kind === 'upcoming' ? 0.7 : 1 }}
                      >
                        <RoundStamp
                          word={stampTitle(stamp, locale).toLocaleUpperCase(locale)}
                          {...(bottom === undefined
                            ? {}
                            : { bottom: bottom.toLocaleUpperCase(locale) })}
                          ink={
                            stamp.kind === 'home' ? 'orange' : index % 2 === 0 ? 'pink' : 'green'
                          }
                          size={FACE}
                          rotate={TILTS[index % TILTS.length] ?? 0}
                        />
                      </View>
                    }
                    {...(open === undefined
                      ? {}
                      : {
                          onPress: open,
                          trailing: <Icon name="forward" size={16} color={th.color.placeholder} />,
                        })}
                    testID={`you-stamps-row-${stamp.kind}`}
                  />
                );
              })}
            </ListCard>
          </Animated.View>
        )}
        <PressableScale
          onPress={props.onAddPastTrip}
          accessibilityRole="button"
          testID="you-stamps-add-past-trip"
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: th.space.gap6,
              minHeight: 52,
              borderRadius: th.radius.card,
              borderWidth: 1.5,
              borderStyle: 'dashed',
              borderColor: th.color.fieldBorder,
            }}
          >
            <Icon name="plus" size={16} color={th.color.ink} />
            <Text variant="headline">
              {t({ id: 'you.stamps.addPastTrip', message: 'Add a past trip' })}
            </Text>
          </View>
        </PressableScale>
      </View>
    </PushScreen>
  );
}
