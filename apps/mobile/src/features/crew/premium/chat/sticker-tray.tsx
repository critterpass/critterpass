/**
 * The sticker tray (5.08): your Critterdex one tap from the keyboard, at the keyboard's height.
 * Tabs: Recent, then each critter you have met; "N of M" across the dex. A tab shows its set
 * ("TOKEK · BALI"), the critter in every sticker pose, then the set's critters you have not met as
 * locked tiles (tapping one says where to meet it) and "Meet more in …". Tapping a sticker sends it.
 */
import type { StickerPose } from '@cp/domain';
import { t } from '@lingui/core/macro';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import {
  CritterSticker,
  PressableScale,
  Text,
  makePremiumStyles,
  usePremiumTheme,
} from '@/ui/premium';

import { stickerCaption } from '../../chat/cards/sticker-caption';
import type {
  StickerTray as TrayData,
  TrayForm,
  TrayLocked,
  TraySticker,
} from '../../chat/data/use-sticker-tray';
import { plainFormSpec, stickerArtKind } from '../../chat/data/use-sticker-form';

const TILE = 76;
const ART = 68;

const useStyles = makePremiumStyles((th) => ({
  // The tray sits in the page under the composer: the page's ground, cut off from the chat by the
  // composer's hairline, so it never reads as a white slab ending short of the screen's corners.
  tray: {
    backgroundColor: th.color.ground,
    paddingTop: th.space.gap12,
  },
  tabs: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: th.space.gap14,
    gap: th.space.gap6,
  },
  recent: {
    height: th.size.pillSmall,
    paddingHorizontal: th.space.gap12,
    borderRadius: th.radius.pillSmall,
    justifyContent: 'center',
  },
  tab: {
    width: 40,
    height: th.size.pillSmall,
    borderRadius: th.radius.pillSmall,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  setLabel: { paddingHorizontal: 18, paddingTop: th.space.gap12 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: th.space.gap8,
    paddingTop: th.space.gap6,
    rowGap: th.space.gap4,
  },
  cell: { width: '25%', alignItems: 'center' },
  tile: {
    width: TILE,
    height: TILE,
    borderRadius: th.radius.banner,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locked: {
    width: ART - 12,
    height: ART - 12,
    borderRadius: (ART - 12) / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: th.color.controlDisabled,
  },
}));

function StickerTile({
  form,
  pose,
  pressed,
  onSend,
}: {
  readonly form: TrayForm;
  readonly pose: StickerPose;
  readonly pressed: boolean;
  readonly onSend: () => void;
}) {
  const th = usePremiumTheme();
  const styles = useStyles();
  const spec = plainFormSpec(form.rarity as Parameters<typeof plainFormSpec>[0], form.palette);
  const caption = stickerCaption(pose);
  return (
    <View style={styles.cell}>
      <PressableScale
        style={[styles.tile, pressed ? { backgroundColor: th.color.status.maybe.bg } : null]}
        onPress={onSend}
        accessibilityRole="button"
        accessibilityLabel={t({
          id: 'chat.premium.tray.send',
          message: `Send ${form.name}: ${caption}`,
        })}
        testID={`chat-tray-sticker-${pose}`}
      >
        <CritterSticker
          kind={stickerArtKind(form.critterKey)}
          name={form.name}
          size={ART}
          pose={pose}
          {...(form.seed === null ? {} : { seed: form.seed })}
          {...(spec === null ? {} : { form: spec })}
        />
      </PressableScale>
      <Text variant="tier" tone="inkSecondary">
        {caption}
      </Text>
    </View>
  );
}

function LockedTile({
  critter,
  onPress,
}: {
  readonly critter: TrayLocked;
  readonly onPress: () => void;
}) {
  const th = usePremiumTheme();
  const styles = useStyles();
  return (
    <View style={styles.cell}>
      <PressableScale
        style={styles.tile}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={t({
          id: 'chat.premium.tray.locked',
          message: 'Not met yet: where to find it',
        })}
      >
        <View style={styles.locked}>
          <Text variant="stat" color={th.color.tier.lockedMark}>
            ?
          </Text>
        </View>
      </PressableScale>
      <Text variant="tier" tone="placeholder">
        {`#${critter.no}`}
      </Text>
    </View>
  );
}

export interface StickerTrayProps {
  readonly tray: TrayData;
  readonly height: number;
  readonly bottomInset: number;
  readonly onSend: (sticker: TraySticker) => void;
  readonly onLocked: (critterId: string) => void;
}

export function StickerTray({ tray, height, bottomInset, onSend, onLocked }: StickerTrayProps) {
  const th = usePremiumTheme();
  const styles = useStyles();
  const [tab, setTab] = useState<string>(
    tray.recent.length > 0 ? 'recent' : (tray.tabs[0]?.form.critterId ?? 'recent'),
  );
  const [last, setLast] = useState<string | null>(null);
  const current = tray.tabs.find((candidate) => candidate.form.critterId === tab);
  const stickers = tab === 'recent' ? tray.recent : (current?.stickers ?? []);
  const send = (sticker: TraySticker) => {
    setLast(`${sticker.form.formId}:${sticker.pose}`);
    onSend(sticker);
  };
  const setName = current?.form.setName ?? null;
  return (
    <View style={[styles.tray, { height }]} testID="chat-sticker-tray">
      <View style={styles.tabs}>
        <PressableScale
          style={[
            styles.recent,
            { backgroundColor: tab === 'recent' ? th.color.inkSurface : th.color.card },
          ]}
          onPress={() => setTab('recent')}
          accessibilityRole="tab"
          accessibilityState={{ selected: tab === 'recent' }}
        >
          <Text variant="label" color={tab === 'recent' ? th.color.onInkSurface : th.color.ink}>
            {t({ id: 'chat.premium.tray.recent', message: 'Recent' })}
          </Text>
        </PressableScale>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: th.space.gap6 }}
          style={{ flex: 1 }}
        >
          {tray.tabs.map((candidate) => {
            const active = candidate.form.critterId === tab;
            return (
              <PressableScale
                key={candidate.form.critterId}
                style={[
                  styles.tab,
                  { backgroundColor: active ? th.color.inkSurface : th.color.card },
                ]}
                onPress={() => setTab(candidate.form.critterId)}
                accessibilityRole="tab"
                accessibilityLabel={candidate.form.name}
                accessibilityState={{ selected: active }}
              >
                <CritterSticker
                  kind={stickerArtKind(candidate.form.critterKey)}
                  name={candidate.form.name}
                  size={32}
                  edge={false}
                />
              </PressableScale>
            );
          })}
        </ScrollView>
        <Text variant="helper" tone="muted">
          {t({ id: 'chat.premium.tray.count', message: `${tray.met} of ${tray.total}` })}
        </Text>
      </View>
      {setName === null || current === undefined ? null : (
        <Text
          variant="tier"
          color={th.color.guideName}
          style={[styles.setLabel, { letterSpacing: 0.7 }]}
        >
          {`${current.form.name} · ${setName}`.toLocaleUpperCase()}
        </Text>
      )}
      <ScrollView contentContainerStyle={[styles.grid, { paddingBottom: bottomInset }]}>
        {stickers.length === 0 ? (
          <Text variant="caption" tone="muted" style={{ padding: th.space.gap16 }}>
            {tray.tabs.length === 0
              ? t({
                  id: 'chat.premium.tray.none',
                  message: 'Meet a critter on a trip and its stickers land here.',
                })
              : t({ id: 'chat.premium.tray.noRecent', message: 'Stickers you send show up here.' })}
          </Text>
        ) : (
          stickers.map((sticker) => (
            <StickerTile
              key={`${sticker.form.formId}:${sticker.pose}`}
              form={sticker.form}
              pose={sticker.pose}
              pressed={last === `${sticker.form.formId}:${sticker.pose}`}
              onSend={() => send(sticker)}
            />
          ))
        )}
        {tab === 'recent' || current === undefined
          ? null
          : current.locked.map((critter) => (
              <LockedTile
                key={critter.critterId}
                critter={critter}
                onPress={() => onLocked(critter.critterId)}
              />
            ))}
        {tab !== 'recent' && current?.form.country != null ? (
          <View style={[styles.cell, { justifyContent: 'center', height: TILE }]}>
            <Text variant="tier" tone="muted" align="center">
              {t({
                id: 'chat.premium.tray.meetMore',
                message: `Meet more in ${current.form.setName ?? ''}`,
              })}
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
