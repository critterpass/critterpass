/**
 * The chosen day's head in the plan sheet: its date and place in the trip in the day's ink
 * colour, its title, and at peek who is on it and how the day reads ("5 stops · 2 h 40 in the
 * car"), at half the one problem worth a tap ("Rain at 1 · fix").
 */
import { View } from 'react-native';

import {
  CrewStack,
  makePremiumStyles,
  PressableScale,
  StatusTag,
  Text,
  usePremiumTheme,
  type CrewMember,
} from '@/ui/premium';

import { dayInk } from '../map';

export interface DayHeadProps {
  readonly dayNo: number;
  readonly eyebrow: string;
  readonly title: string;
  readonly size: 'peek' | 'half';
  readonly line?: string | null;
  readonly crew?: readonly CrewMember[];
  readonly crewLabel?: string;
  readonly problem?: { readonly label: string; readonly onPress: () => void } | null;
}

const useStyles = makePremiumStyles((t) => ({
  head: { flexDirection: 'row', alignItems: 'flex-end', gap: t.space.gap12 },
  text: { flex: 1, gap: 2 },
  eyebrow: { textTransform: 'uppercase', letterSpacing: 0.7 },
}));

export function DayHead(props: DayHeadProps) {
  const styles = useStyles();
  const ink = dayInk(props.dayNo, usePremiumTheme().scheme);
  return (
    <View style={styles.head}>
      <View style={styles.text}>
        <Text variant="statLabel" color={ink} style={styles.eyebrow} numberOfLines={1}>
          {props.eyebrow}
        </Text>
        <Text
          variant={props.size === 'peek' ? 'stat' : 'title'}
          numberOfLines={1}
          accessibilityRole="header"
        >
          {props.title}
        </Text>
        {props.line == null ? null : (
          <Text variant="label" tone="muted" numberOfLines={1}>
            {props.line}
          </Text>
        )}
      </View>
      {props.crew !== undefined && props.crew.length > 0 ? (
        <CrewStack
          members={props.crew}
          size={24}
          max={4}
          accessibilityLabel={props.crewLabel ?? ''}
        />
      ) : null}
      {props.problem == null ? null : (
        <PressableScale onPress={props.problem.onPress} accessibilityRole="button">
          <StatusTag label={props.problem.label} tone="rain" />
        </PressableScale>
      )}
    </View>
  );
}
