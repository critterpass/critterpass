/**
 * Add from a link (4.32), a native sheet over Find: the post (its cover, "From a TikTok ·
 * @author", its title and how many places the guide read in it), each place found with its state
 * (a green check and a switch to leave it out, "Pick one" when it could be several, "Search" when
 * it wasn't found), the guide's tip on the day they share, "Save 3 to Ideas", "Or put them on Sat
 * 17", and the way to add a screenshot instead. Every action is the shared `LinkScreen`'s.
 */
import { t } from '@lingui/core/macro';
import { Image, ScrollView, View } from 'react-native';

import { guideSticker } from '@/ui/premium/stickers/guides';
import {
  Button,
  GuideNote,
  Icon,
  ListCard,
  Skeleton,
  Text,
  TextButton,
  Toggle,
  usePremiumTheme,
} from '@/ui/premium';
import { sheetMaterialStyle } from '@/ui/premium/shell';

import { fromWhere, guideReadLine, stopLine } from '../../search/link-copy';
import type { LinkSheetProps } from '../../search/link-screen';
import { couldBe } from '../../search/could-be';

const THUMB_W = 72;
const THUMB_H = 96;
const MARK = 22;
const MAYBE = '?';

export function PremiumLinkSheet(props: LinkSheetProps) {
  const theme = usePremiumTheme();
  const { state } = props;
  const source = state.source;
  const stop = stopLine(state.error);
  const guide = guideSticker(props.guide);
  const chosen = props.chosen;
  const day = props.dayLabel ?? '';
  const author = source?.author ?? null;
  return (
    <ScrollView
      // The native form sheet is see-through: its material is drawn here.
      style={[{ flex: 1 }, sheetMaterialStyle(theme)]}
      contentContainerStyle={{ padding: theme.space.gap16, gap: theme.space.gap12 }}
      testID="search-link-sheet"
    >
      <View style={{ flexDirection: 'row', gap: theme.space.gap12 }}>
        <View
          style={{
            width: THUMB_W,
            height: THUMB_H,
            borderRadius: 14,
            overflow: 'hidden',
            backgroundColor: theme.color.control,
          }}
        >
          {source?.thumb_url == null ? null : (
            <Image
              source={{ uri: source.thumb_url }}
              style={{ width: THUMB_W, height: THUMB_H }}
              resizeMode="cover"
            />
          )}
        </View>
        <View style={{ flex: 1, gap: theme.space.gap4 }}>
          <Text variant="badge" tone="muted">
            {(author === null
              ? fromWhere(source?.platform ?? null)
              : `${fromWhere(source?.platform ?? null)} · ${author}`
            ).toLocaleUpperCase()}
          </Text>
          {source?.title == null ? null : (
            <Text variant="navTitle" numberOfLines={3} testID="search-link-title">
              {source.title}
            </Text>
          )}
          <Text variant="caption" tone="muted">
            {guideReadLine(state)}
          </Text>
        </View>
      </View>
      {state.matches.length === 0 && state.status === 'reading' ? (
        <Skeleton height={120} radius={theme.radius.card} tone="block" />
      ) : null}
      {state.matches.length === 0 ? null : (
        <ListCard>
          {state.matches.map((match, index) => {
            const place =
              match.kind === 'sure'
                ? match.place
                : match.kind === 'ambiguous'
                  ? match.picked
                  : null;
            const title = place?.name ?? `“${match.label}”`;
            const meta =
              place !== null
                ? [props.kindWord(place.category), place.meta]
                    .filter((part) => part !== null && part !== '')
                    .join(' · ')
                : match.kind === 'ambiguous'
                  ? couldBe(match.candidates.length, match.candidates[0]?.meta ?? null)
                  : t({ id: 'search.link.notFound', message: 'Couldn’t find it' });
            return (
              <View
                key={match.label}
                testID={`search-link-row-${String(index)}`}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: theme.space.gap12,
                  paddingVertical: 9,
                  paddingHorizontal: theme.space.rowPadH,
                }}
              >
                <View
                  style={{
                    width: MARK,
                    height: MARK,
                    borderRadius: MARK / 2,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor:
                      place !== null
                        ? theme.color.toggleOn
                        : match.kind === 'ambiguous'
                          ? theme.accent.tangerine
                          : 'transparent',
                    borderWidth: place === null && match.kind !== 'ambiguous' ? 2 : 0,
                    borderStyle: 'dashed',
                    borderColor: theme.color.outlineEmpty,
                  }}
                >
                  {place !== null ? (
                    <Icon name="check" size={12} color={theme.color.onInk} />
                  ) : match.kind === 'ambiguous' ? (
                    <Text variant="badge" color={theme.color.onAccent}>
                      {MAYBE}
                    </Text>
                  ) : null}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    variant="rowTextStrong"
                    tone={place === null && match.kind === 'unknown' ? 'placeholder' : 'ink'}
                    numberOfLines={1}
                  >
                    {title}
                  </Text>
                  <Text variant="captionMuted" tone="muted" numberOfLines={1}>
                    {meta}
                  </Text>
                </View>
                {place !== null ? (
                  <Toggle
                    value={state.selected.has(match.label)}
                    onChange={() => props.onToggle(match.label)}
                    accessibilityLabel={t({ id: 'search.link.saveToggle', message: 'Save' })}
                    testID={`search-link-toggle-${String(index)}`}
                  />
                ) : match.kind === 'ambiguous' ? (
                  <Button
                    alignSelf="auto"
                    size="small"
                    variant="control"
                    label={t({ id: 'search.link.pickOne', message: 'Pick one' })}
                    onPress={() => props.onPick(match.label)}
                  />
                ) : (
                  <TextButton
                    align="center"
                    label={t({ id: 'search.link.search', message: 'Search' })}
                    onPress={() => props.onSearch(match.label)}
                  />
                )}
              </View>
            );
          })}
        </ListCard>
      )}
      {stop === null ? null : (
        <View style={{ gap: theme.space.gap8 }} testID="search-link-stopped">
          <Text variant="body">{stop.text}</Text>
          {stop.retry ? (
            <TextButton
              label={t({ id: 'search.link.retry', message: 'Try again' })}
              onPress={props.onRetry}
            />
          ) : null}
        </View>
      )}
      {props.tip === null ? null : (
        <GuideNote name={guide.name} critter={guide.kind} text={props.tip} showName={false} />
      )}
      <View style={{ gap: theme.space.gap6, alignItems: 'center' }}>
        {chosen === 0 ? null : (
          <View style={{ alignSelf: 'stretch' }}>
            <Button
              label={t({ id: 'search.link.saveToIdeas', message: `Save ${chosen} to Ideas` })}
              onPress={props.onSave}
              loading={props.saving}
              testID="search-link-save-ideas"
            />
          </View>
        )}
        {chosen === 0 || props.dayLabel === null ? null : (
          <TextButton
            align="center"
            label={t({ id: 'search.link.putOnDay', message: `Or put them on ${day}` })}
            onPress={props.onPutOnDay}
            testID="search-link-put-on-day"
          />
        )}
        <TextButton
          align="center"
          label={t({ id: 'search.link.screenshot', message: 'Add a screenshot instead' })}
          onPress={props.onScreenshot}
          testID="search-link-screenshot"
        />
        <Text variant="captionMuted" tone="placeholder" align="center">
          {t({
            id: 'search.link.worksWith',
            message: 'Works with Instagram, Maps, YouTube and screenshots',
          })}
        </Text>
      </View>
    </ScrollView>
  );
}
