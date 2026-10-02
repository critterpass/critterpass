/**
 * Every stamp the person holds (opened from the profile's "ALL n ›"): oldest first, filtered by
 * year, each with its stamp face. A trip's stamp opens its recap once that screen exists; a
 * self-reported one opens its edit form. "Add a past trip" back-fills trips taken before the app.
 */
import { useLingui } from '@lingui/react/macro';
import { ScrollView, View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { DashedAddCard } from '@/ui/cards/DashedAddCard';
import { ListCard } from '@/ui/cards/ListCard';
import { FilterChip } from '@/ui/chips/FilterChip';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { LargeTitle } from '@/ui/shell/LargeTitle';
import { Skeleton } from '@/ui/states/Skeleton';
import { Scaffold } from '@/ui/surface/Scaffold';
import { makeStyles } from '@/ui/theme';

import { stampLabel } from '../profile/profile-copy';
import { ProfileStampFace, stampTitle } from '../profile/profile-parts';
import { stampsForYear, stampYears, type ProfileStamp } from './stamp-book';
import { stampLine } from './stamps-copy';

export interface StampsViewProps {
  /** Null while the first read is still out. */
  readonly stamps: readonly ProfileStamp[] | null;
  readonly year: number | null;
  readonly onYear: (year: number | null) => void;
  readonly onBack?: () => void;
  readonly onAddPastTrip: () => void;
  /** Opens a stamp: a self-reported trip's form, or a trip's recap; absent when it has none. */
  readonly openerFor: (stamp: ProfileStamp) => (() => void) | undefined;
}

const FACE = 52;

const useStyles = makeStyles((t) => ({
  content: { paddingHorizontal: t.size.gutter, paddingBottom: t.space['32'], gap: t.space['12'] },
  face: { width: FACE, height: FACE, alignItems: 'center', justifyContent: 'center' },
  years: { gap: t.space['8'], paddingHorizontal: t.size.gutter, paddingBottom: t.space['12'] },
}));

export function StampsView(props: StampsViewProps) {
  const { t } = useLingui();
  const styles = useStyles();
  const locale = useLocale();
  const years = props.stamps === null ? [] : stampYears(props.stamps);
  const shown = props.stamps === null ? [] : stampsForYear(props.stamps, props.year);
  return (
    <Scaffold variant="dark" edges={['top']} testID="you-stamps">
      <LargeTitle
        title={t({ id: 'you.stamps.title', message: 'Stamps' })}
        start={
          <BackEyebrow
            label={t({ id: 'you.stamps.back', message: 'Profile' })}
            onPress={props.onBack}
            testID="you-stamps-back"
          />
        }
      />
      {years.length > 1 ? (
        <View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.years}
          >
            <FilterChip
              label={t({ id: 'you.stamps.allYears', message: 'All' })}
              selected={props.year === null}
              onPress={() => props.onYear(null)}
              testID="you-stamps-year-all"
            />
            {years.map((year) => (
              <FilterChip
                key={year}
                label={String(year)}
                selected={props.year === year}
                onPress={() => props.onYear(year)}
                testID={`you-stamps-year-${year}`}
              />
            ))}
          </ScrollView>
        </View>
      ) : null}
      <ScrollView contentContainerStyle={styles.content}>
        {props.stamps === null ? (
          <Skeleton preset="list" testID="you-stamps-loading" />
        ) : (
          shown.map((stamp, index) => {
            const open = props.openerFor(stamp);
            return (
              <ListCard
                key={stamp.id}
                title={stampTitle(stamp, locale)}
                subtitle={stampLine(stamp, locale)}
                leading={
                  <View style={styles.face} accessibilityLabel={stampLabel(stamp, locale)}>
                    <ProfileStampFace stamp={stamp} index={index} size={FACE} bare />
                  </View>
                }
                {...(open === undefined ? { chevron: false } : { onPress: open })}
                testID={`you-stamps-row-${stamp.kind}`}
              />
            );
          })
        )}
        <DashedAddCard
          label={t({ id: 'you.stamps.addPastTrip', message: 'Add a past trip' })}
          onPress={props.onAddPastTrip}
          testID="you-stamps-add-past-trip"
        />
      </ScrollView>
    </Scaffold>
  );
}
