/**
 * Home's step card (3.01): r32 white card with a sun wash at the top right and a pink one at the
 * bottom left, a sticker over the corner, a tracked eyebrow, a 30/800 title, a body line and the
 * screen's ink action. First run and "crew ready, nothing planned" both use it.
 */
/* eslint-disable lingui/no-unlocalized-strings -- CSS gradients, never copy. */
import { View } from 'react-native';

import {
  Button,
  CritterSticker,
  Text,
  TextButton,
  makePremiumStyles,
  usePremiumTheme,
} from '@/ui/premium';

const useStyles = makePremiumStyles((t) => ({
  card: {
    borderRadius: 32,
    backgroundColor: t.color.card,
    boxShadow: t.shadow.card,
    padding: t.space.gutter,
    paddingTop: 22,
    minHeight: 300,
    overflow: 'hidden',
    gap: t.space.gap10,
    backgroundImage: `radial-gradient(circle at 80% 10%, rgba(255,216,74,.55) 0%, transparent 55%), radial-gradient(circle at 0% 100%, rgba(255,95,168,.28) 0%, transparent 55%)`,
  },
  sticker: { position: 'absolute', top: 16, end: 14, transform: [{ rotate: '8deg' }] },
  eyebrow: { letterSpacing: 1.2, textTransform: 'uppercase' },
  title: {
    fontWeight: '800',
    letterSpacing: -1.05,
    lineHeight: 31.5,
    marginEnd: 100,
  },
  body: { lineHeight: 20.6 },
  grow: { flex: 1 },
  actions: { gap: t.space.gap4 },
}));

export interface StepCardProps {
  readonly eyebrow: string;
  readonly title: string;
  readonly body: string;
  readonly action: {
    readonly label: string;
    readonly onPress: () => void;
    readonly testID?: string;
  };
  readonly secondary?: {
    readonly label: string;
    readonly onPress: () => void;
    readonly testID?: string;
  };
  readonly critter?: string;
  readonly testID?: string;
}

export function StepCard({
  eyebrow,
  title,
  body,
  action,
  secondary,
  critter = 'gecko',
  testID,
}: StepCardProps) {
  const styles = useStyles();
  const t = usePremiumTheme();
  return (
    <View style={styles.card} testID={testID}>
      <View style={styles.sticker} pointerEvents="none">
        <CritterSticker kind={critter} name={critter} size={92} pose="wave" />
      </View>
      <Text variant="label" color={t.color.status.maybe.text} style={styles.eyebrow}>
        {eyebrow}
      </Text>
      <Text variant="largeTitle" accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      <Text variant="rowText" tone="inkSecondary" style={styles.body}>
        {body}
      </Text>
      <View style={styles.grow} />
      <View style={styles.actions}>
        <Button
          label={action.label}
          onPress={action.onPress}
          {...(action.testID === undefined ? {} : { testID: action.testID })}
        />
        {secondary === undefined ? null : (
          <TextButton
            label={secondary.label}
            onPress={secondary.onPress}
            {...(secondary.testID === undefined ? {} : { testID: secondary.testID })}
          />
        )}
      </View>
    </View>
  );
}
