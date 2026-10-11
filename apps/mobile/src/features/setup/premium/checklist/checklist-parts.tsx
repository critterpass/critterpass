/**
 * The pieces setup together is drawn from (4.08, 4.09): the guide's draft strip (the days sketched
 * so far, in their day colours), a checklist row (status disc, title, one line, a trailing tag,
 * pill, faces or chevron) and the crew's readiness bars.
 */
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { resolveMemberStyle } from '@cp/design-tokens';

import {
  Card,
  CritterSticker,
  CrewStack,
  Icon,
  PressableScale,
  Text,
  type CrewMember,
  usePremiumTheme,
} from '@/ui/premium';

import { dayColours } from '@/features/plan';
import type { SetupMember } from '../../data/setup-trip';

export function crewFaces(
  members: readonly SetupMember[],
  ids: readonly string[],
): readonly CrewMember[] {
  return ids.flatMap((id) => {
    const member = members.find((entry) => entry.uid === id);
    return member === undefined
      ? []
      : [
          {
            id,
            name: member.name,
            color: resolveMemberStyle(Math.max(0, member.joinIndex)).color,
          },
        ];
  });
}

const DISC = 26;
const TILE_HEIGHT = 34;

export function DraftStrip(props: {
  readonly eyebrow: string;
  readonly title: string;
  readonly caption: string | null;
  readonly peek: string | null;
  readonly guide: { readonly kind: string; readonly name: string };
  readonly tiles: readonly { readonly dayNo: number; readonly sketched: boolean }[];
  readonly onPeek: () => void;
}) {
  const t = usePremiumTheme();
  return (
    <Card padded testID="setup-draft-strip">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space.gap12 }}>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: t.color.status.maybe.bg,
            alignItems: 'center',
            justifyContent: 'flex-end',
            overflow: 'hidden',
          }}
        >
          <CritterSticker kind={props.guide.kind} name={props.guide.name} size={36} edge={false} />
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="badge" color={t.color.guideName} numberOfLines={1}>
            {props.eyebrow.toLocaleUpperCase()}
          </Text>
          <Text variant="headline" numberOfLines={1}>
            {props.title}
          </Text>
        </View>
        {props.peek === null ? null : (
          <PressableScale
            onPress={props.onPeek}
            accessibilityRole="button"
            accessibilityLabel={props.peek}
            testID="setup-draft-peek"
          >
            <Text variant="bannerAction">{props.peek}</Text>
          </PressableScale>
        )}
      </View>
      {props.tiles.length === 0 ? null : (
        <View style={{ flexDirection: 'row', gap: t.space.gap4, marginTop: t.space.gap12 }}>
          {props.tiles.map((tile) => (
            <View
              key={tile.dayNo}
              style={{
                flex: 1,
                height: TILE_HEIGHT,
                borderRadius: 9,
                backgroundColor: tile.sketched ? dayColours(tile.dayNo).fill : t.color.control,
                alignItems: 'center',
                justifyContent: 'flex-end',
                paddingBottom: t.space.gap4,
              }}
            >
              <Text variant="badge" color={tile.sketched ? t.color.onAccent : t.color.placeholder}>
                {String(tile.dayNo)}
              </Text>
            </View>
          ))}
        </View>
      )}
      {props.caption === null ? null : (
        <Text variant="captionMuted" tone="muted" style={{ marginTop: t.space.gap8 }}>
          {props.caption}
        </Text>
      )}
    </Card>
  );
}

export type DiscState = 'done' | 'open' | 'mine';

export function StatusDisc({ state }: { readonly state: DiscState }) {
  const t = usePremiumTheme();
  if (state === 'done') {
    return (
      <View
        style={{
          width: DISC,
          height: DISC,
          borderRadius: DISC / 2,
          backgroundColor: t.color.toggleOn,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name="check" size={15} color={t.color.onInk} stroke={3} />
      </View>
    );
  }
  return (
    <View
      style={{
        width: DISC,
        height: DISC,
        borderRadius: DISC / 2,
        borderWidth: 2,
        borderColor: state === 'mine' ? t.color.ink : t.color.progressTodo,
      }}
    />
  );
}

export function ChecklistRowView(props: {
  readonly disc: DiscState;
  readonly title: string;
  readonly line: string;
  readonly trailing?: ReactNode;
  readonly disabled?: boolean;
  readonly onPress: (() => void) | undefined;
  readonly testID: string;
}) {
  const t = usePremiumTheme();
  return (
    <PressableScale
      onPress={props.onPress}
      disabled={props.disabled === true || props.onPress === undefined}
      accessibilityRole="button"
      accessibilityLabel={`${props.title}. ${props.line}`}
      accessibilityState={{ disabled: props.disabled === true }}
      testID={props.testID}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.space.gap12,
        paddingVertical: t.space.gap8 + 1,
        paddingHorizontal: t.space.rowPadH,
        opacity: props.disabled === true ? 0.5 : 1,
      }}
    >
      <StatusDisc state={props.disc} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="rowTitle" numberOfLines={1}>
          {props.title}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {props.line}
        </Text>
      </View>
      {props.trailing ??
        (props.onPress === undefined ? null : (
          <Icon name="forward" size={16} color={t.color.placeholder} />
        ))}
    </PressableScale>
  );
}

export function Faces({
  members,
  label,
}: {
  readonly members: readonly CrewMember[];
  readonly label: string;
}) {
  if (members.length === 0) return null;
  return <CrewStack members={members} size={20} max={5} accessibilityLabel={label} />;
}

export function ReadyBars(props: { readonly ready: number; readonly total: number }) {
  const t = usePremiumTheme();
  return (
    <View style={{ flexDirection: 'row', gap: t.space.gap4 }}>
      {Array.from({ length: props.total }, (_, index) => (
        <View
          key={index}
          style={{
            flex: 1,
            height: 6,
            borderRadius: 3,
            backgroundColor: index < props.ready ? t.color.toggleOn : t.color.fieldBorder,
          }}
        />
      ))}
    </View>
  );
}
