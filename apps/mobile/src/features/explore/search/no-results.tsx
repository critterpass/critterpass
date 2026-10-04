/**
 * Nothing found (7d-4): the guide floats, thinking; "NOTHING LIKE THAT NEAR UBUD"; one line from
 * what the server learned (the closest match and how far); then each way out with what it gives
 * before it is tapped (a wider time, a related kind, a dropped pin), and ASK to take the question
 * to the guide's chat.
 */
import { tokens } from '@cp/design-tokens';
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { makeStyles, Text, useTheme } from '@/ui';
import { GUIDE_STICKERS } from '@/ui/avatar/guides';
import { PillButton } from '@/ui/buttons/PillButton';
import { GuideLine, type GuideId } from '@/ui/people/GuideLine';
import { PressScale } from '@/ui/press/PressScale';
import { Sticker } from '@/ui/sticker/Sticker';

import { GuideSticker } from './guide-sticker';
import type { PlainAnswer, WayOut } from './plain-filters';

const CHEVRON = '›';

const useStyles = makeStyles((th) => ({
  root: { gap: th.space['16'] },
  hero: { alignItems: 'center', paddingVertical: th.space['10'] },
  card: { borderRadius: th.radius.lg, backgroundColor: th.semantic.bg.raised, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: th.space['12'],
    minHeight: 60,
    paddingHorizontal: th.space['14'],
    paddingVertical: th.space['10'],
  },
  rowBody: { flex: 1, minWidth: 0, gap: th.space['2'] },
  ask: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: th.space['12'],
    padding: th.space['12'],
    borderRadius: th.radius.lg,
    backgroundColor: th.semantic.bg.raised,
  },
}));

function hoursAndMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return t({ id: 'search.none.minutes', message: `${m} min` });
  const mm = String(m).padStart(2, '0');
  return m === 0 ? `${String(h)}h` : `${String(h)}h${mm}`;
}

function areasLine(areas: readonly string[]): string {
  return areas.join(t({ id: 'search.none.or', message: ' or ' }));
}

/** The way out's two lines: what it is, and what it gives. */
export function wayOutWords(way: WayOut, guideName: string): { title: string; line: string } {
  const count = way.count;
  if (way.kind === 'widen') {
    const span = hoursAndMinutes(
      typeof way.params['minutes'] === 'number' ? way.params['minutes'] : 0,
    );
    const areas = areasLine(way.areas);
    return {
      title: t({ id: 'search.none.widen', message: `Widen to ${span}` }),
      line:
        areas === ''
          ? t({ id: 'search.none.widenCount', message: `${count} places` })
          : t({ id: 'search.none.widenAreas', message: `${count} places, all in ${areas}` }),
    };
  }
  if (way.kind === 'related') {
    const term = typeof way.params['term'] === 'string' ? way.params['term'] : '';
    const area = way.areas[0] ?? '';
    const late = way.openLate ?? 0;
    return {
      title: t({ id: 'search.none.related', message: `Try ${term} instead` }),
      line:
        late > 0
          ? t({
              id: 'search.none.relatedLate',
              message: `${count} places in ${area}, ${late} open late`,
            })
          : t({ id: 'search.none.relatedCount', message: `${count} places in ${area}` }),
    };
  }
  return {
    title: t({ id: 'search.none.pin', message: 'Drop a pin' }),
    line: t({ id: 'search.none.pinLine', message: `Add a place ${guideName} doesn’t know yet` }),
  };
}

export interface NoResultsProps {
  readonly answer: PlainAnswer;
  /** "Ubud": where the search looked. */
  readonly area: string;
  readonly limitMinutes: number | null;
  readonly guide: GuideId;
  readonly guideName: string;
  readonly onWayOut: (way: WayOut) => void;
  readonly onAsk: () => void;
}

export function NoResults(props: NoResultsProps) {
  const styles = useStyles();
  const theme = useTheme();
  const sticker = GUIDE_STICKERS[props.guide];
  const area = props.area;
  const nearest = props.answer.nearest;
  const limit = props.limitMinutes;
  const lead =
    limit === null
      ? t({ id: 'search.none.leadPlain', message: 'Nothing here matches all of that yet.' })
      : t({ id: 'search.none.leadMinutes', message: `Nothing like it within ${limit} minutes.` });
  const closest =
    nearest === null || nearest.minutes === null
      ? ''
      : nearestLine(nearest.name, nearest.area, hoursAndMinutes(nearest.minutes));
  const ways = props.answer.waysOut.some((way) => way.kind === 'pin')
    ? props.answer.waysOut
    : [
        ...props.answer.waysOut,
        { kind: 'pin' as const, params: {}, count: 0, areas: [], openLate: null },
      ];
  return (
    <View style={styles.root} testID="search-no-results">
      <View style={styles.hero}>
        <Sticker kind={sticker.kind} name={sticker.name} pose="think" size={110} />
      </View>
      <Text variant="h1" testID="search-no-results-title">
        {area === ''
          ? t({ id: 'search.none.titleHere', message: 'Nothing like that here' })
          : t({ id: 'search.none.title', message: `Nothing like that near ${area}` })}
      </Text>
      <Text variant="body" color={theme.semantic.text.secondary}>
        {closest === '' ? lead : `${lead} ${closest}`}
      </Text>
      <View style={styles.card}>
        {ways.map((way, index) => {
          const words = wayOutWords(way, props.guideName);
          return (
            <PressScale
              key={way.kind}
              accessibilityRole="button"
              accessibilityLabel={`${words.title}. ${words.line}`}
              onPress={() => props.onWayOut(way)}
              testID={`search-way-out-${way.kind}`}
            >
              <View
                style={[
                  styles.row,
                  index === 0 ? null : { borderTopWidth: 1, borderTopColor: tokens.color.divider },
                ]}
              >
                <View style={styles.rowBody}>
                  <Text variant="title">{words.title}</Text>
                  <Text variant="bodySm" color={theme.semantic.text.secondary}>
                    {words.line}
                  </Text>
                </View>
                <Text variant="body" color={theme.semantic.text.secondary}>
                  {CHEVRON}
                </Text>
              </View>
            </PressScale>
          );
        })}
      </View>
      <View style={styles.ask}>
        <View style={{ flex: 1 }}>
          <GuideLine
            guide={props.guide}
            name={props.guideName}
            line={t({
              id: 'search.none.askLine',
              message: 'Or ask me. I’ll dig into it with you.',
            })}
            sticker={<GuideSticker guide={props.guide} />}
          />
        </View>
        <PillButton
          label={t({ id: 'search.none.ask', message: 'Ask' })}
          size="sm"
          onPress={props.onAsk}
          testID="search-ask-guide"
        />
      </View>
    </View>
  );
}

function nearestLine(name: string, area: string | null, away: string): string {
  return area === null
    ? t({ id: 'search.none.nearestPlace', message: `The closest is ${name}, ${away} away.` })
    : t({ id: 'search.none.nearest', message: `The closest is ${name} in ${area}, ${away} away.` });
}
