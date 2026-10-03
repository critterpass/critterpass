/**
 * The add-a-must-do sheet (3c-10), as a pure view: "{PLACE} · MUST-DOS" with "AS {NAME}", the
 * guide's question, a search field (return adds what is typed), the typed words as a row of their
 * own ("Keep it just as you typed it") and under it the guide's matches with their pills. The keep
 * row comes first so places that land late never push it from under the finger. Offline the
 * places on the phone still show, and a pick waits in the queue. A place closed on every trip day
 * is set apart under "Closed on your dates" below the ones that are open.
 */
import { t } from '@lingui/core/macro';
import type { ReactNode } from 'react';
import { I18nManager, View } from 'react-native';

import { MUST_DO_TITLE_MAX } from '@cp/domain';

import { GUIDE_STICKERS } from '@/ui/avatar/guides';
import { Icon } from '@/ui/icons/Icon';
import { TextField } from '@/ui/inputs/TextField';
import { Row } from '@/ui/layout/Row';
import { GuideLine } from '@/ui/people/GuideLine';
import { Avatar } from '@/ui/people/Avatar';
import { PressScale } from '@/ui/press/PressScale';
import { useNoBackByDesign } from '@/ui/qa/back-affordance';
import { Sheet } from '@/ui/sheet/Sheet';
import { SheetScrollView } from '@/ui/sheet/SheetScrollView';
import { Skeleton } from '@/ui/states/Skeleton';
import { Sticker } from '@/ui/sticker/Sticker';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import type { SetupMember, SetupTrip } from '../data/setup-trip';
import { FitPill } from './fit-pill';
import { addSheetRows } from './result-rows';
import type { PlaceResult, SearchState } from './search';

export interface AddSheetViewProps {
  readonly trip: SetupTrip;
  readonly me: SetupMember;
  readonly query: string;
  readonly search: SearchState;
  readonly onQuery: (text: string) => void;
  readonly onPickPlace: (place: PlaceResult) => void;
  readonly onKeepText: () => void;
  readonly onDismiss?: (() => void) | undefined;
  /** Live results past the guide's own ("More places"), drawn under the list. */
  readonly more?: ReactNode;
}

const useStyles = makeStyles((th) => ({
  body: { paddingHorizontal: th.space['20'], paddingBottom: th.space['24'], gap: th.space['14'] },
  head: { justifyContent: 'space-between', gap: th.space['8'] },
  who: { gap: th.space['6'] },
  list: { gap: th.space['10'] },
  result: {
    borderRadius: th.radius.md,
    // One step up from the sheet (itself the raised surface), so each row reads as a card.
    backgroundColor: th.semantic.bg.control,
    paddingHorizontal: th.space['14'],
    paddingVertical: th.space['12'],
    gap: th.space['12'],
  },
  text: { flex: 1, gap: th.space['2'] },
}));

export function ResultRow({
  title,
  line,
  trailing,
  onPress,
  label,
  testID,
}: {
  readonly title: string;
  readonly line: string | null;
  readonly trailing: ReactNode;
  readonly onPress: () => void;
  readonly label: string;
  readonly testID: string;
}) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <PressScale onPress={onPress} accessibilityLabel={label} testID={testID}>
      <Row align="center" style={styles.result}>
        <View style={styles.text}>
          <Text variant="title">{title}</Text>
          {line === null ? null : (
            <Text variant="bodySm" color={theme.semantic.text.secondary}>
              {line}
            </Text>
          )}
        </View>
        {trailing}
      </Row>
    </PressScale>
  );
}

function PlaceRow({ place, onPick }: { readonly place: PlaceResult; readonly onPick: () => void }) {
  return (
    <ResultRow
      title={place.name}
      line={place.blurb}
      trailing={place.pill === null ? null : <FitPill pill={place.pill} />}
      onPress={onPick}
      label={[place.name, place.blurb].filter(Boolean).join(', ')}
      testID={`add-must-do-place-${place.id}`}
    />
  );
}

export function AddSheetView({
  trip,
  me,
  query,
  search,
  onQuery,
  onPickPlace,
  onKeepText,
  onDismiss,
  more,
}: AddSheetViewProps) {
  const styles = useStyles();
  // 3c-10 draws no ✕: the grabber (and a swipe down) is the way back.
  useNoBackByDesign();
  const theme = useTheme();
  const guide = GUIDE_STICKERS[trip.guide];
  const place = trip.destinationName;
  const guideName = guide.name;
  const name = me.name;
  const typed = query.trim();
  const rows = addSheetRows(typed, search);
  const title = t({ id: 'setup.addMustDo.header', message: `${place} · Must-dos` });
  return (
    <Sheet
      {...(onDismiss === undefined ? {} : { onDismiss })}
      closable={false}
      accessibilityLabel={title}
      testID="add-must-do"
    >
      <SheetScrollView keyboardShouldPersistTaps="handled">
        <View style={styles.body}>
          <Row align="center" style={styles.head}>
            <Text variant="eyebrow" accessibilityRole="header">
              {title}
            </Text>
            <Row align="center" style={styles.who}>
              <Avatar name={me.name} joinIndex={me.joinIndex} size="sm" decorative />
              <Text variant="label" color={theme.semantic.text.secondary}>
                {t({ id: 'setup.addMustDo.as', message: `As ${name}` })}
              </Text>
            </Row>
          </Row>
          <GuideLine
            guide={trip.guide}
            name={guide.name}
            line={t({
              id: 'setup.addMustDo.prompt',
              message: `${name}, what’s the one thing ${place} isn’t complete without?`,
            })}
            sticker={<Sticker kind={guide.kind} name={guide.name} size={44} />}
          />
          <TextField
            label={t({ id: 'setup.addMustDo.search', message: 'A place or your own words' })}
            labelHidden
            value={query}
            onChangeText={onQuery}
            leading={<Icon name="food" size={20} decorative />}
            placeholder={t({ id: 'setup.addMustDo.search', message: 'A place or your own words' })}
            autoFocus
            autoCorrect={false}
            maxLength={MUST_DO_TITLE_MAX}
            returnKeyType="done"
            returnKeyLabel={t({ id: 'setup.addMustDo.returnKey', message: 'Add' })}
            onSubmitEditing={typed === '' ? undefined : onKeepText}
            testID="add-must-do-field"
          />
          {rows.length === 0 ? null : (
            <View style={styles.list}>
              {rows.map((row) => {
                switch (row.kind) {
                  case 'keep':
                    return (
                      <ResultRow
                        key="keep"
                        title={`“${typed}”`}
                        line={t({
                          id: 'setup.addMustDo.keep',
                          message: 'Keep it just as you typed it',
                        })}
                        trailing={
                          <Text variant="title" color={theme.semantic.text.secondary}>
                            {I18nManager.isRTL ? '‹' : '›'}
                          </Text>
                        }
                        onPress={onKeepText}
                        label={t({
                          id: 'setup.addMustDo.keepA11y',
                          message: `Add “${typed}” as you typed it`,
                        })}
                        testID="add-must-do-keep"
                      />
                    );
                  case 'loading':
                    return (
                      <Skeleton
                        key="loading"
                        preset="list"
                        repeat={2}
                        label={t({ id: 'setup.addMustDo.loading', message: 'Looking for places' })}
                      />
                    );
                  case 'found':
                    return (
                      <Text key="found" variant="eyebrow">
                        {t({ id: 'setup.addMustDo.found', message: `${guideName} found` })}
                      </Text>
                    );
                  case 'place':
                    return (
                      <PlaceRow
                        key={row.place.id}
                        place={row.place}
                        onPick={() => onPickPlace(row.place)}
                      />
                    );
                  case 'offline':
                    return (
                      <Text key="offline" variant="caption" color={theme.semantic.text.secondary}>
                        {t({
                          id: 'setup.addMustDo.offlineSaved',
                          message:
                            'No signal: these are the places on your phone. Your pick sends when you’re back.',
                        })}
                      </Text>
                    );
                  case 'none':
                    return (
                      <Text
                        key="none"
                        variant="bodySm"
                        color={theme.semantic.text.secondary}
                        testID="add-must-do-none"
                      >
                        {row.offline
                          ? t({
                              id: 'setup.addMustDo.offline',
                              message:
                                'No signal, so no new places. Keep your own words and it sends when you’re back.',
                            })
                          : t({
                              id: 'setup.addMustDo.noResults',
                              message: `No place matches that in ${place}. Keep it in your own words.`,
                            })}
                      </Text>
                    );
                  case 'closed':
                    return (
                      <Text key="closed" variant="eyebrow" testID="add-must-do-closed">
                        {t({ id: 'setup.addMustDo.closed', message: 'Closed on your dates' })}
                      </Text>
                    );
                }
              })}
            </View>
          )}
          {typed === '' ? null : more}
        </View>
      </SheetScrollView>
    </Sheet>
  );
}
