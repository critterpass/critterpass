/**
 * The guide's glass note at the foot of a screen (the design's TokekDock): r22 regular glass, the
 * guide on a 36 tint disc, its bold name then the line, and an optional dark "Ask" pill. Built
 * here for 4.31, 4.33 and 4.49; the plan screens draw the same dock and may want it in the kit.
 */
import { View } from 'react-native';

import { Button, CritterSticker, GlassSurface, Text, usePremiumTheme } from '@/ui/premium';

export interface GuideDockProps {
  readonly guideName: string;
  /** The guide's critter kind (Tokek is the gecko). */
  readonly critter: string;
  readonly text: string;
  readonly action?: {
    readonly label: string;
    readonly onPress: () => void;
    readonly testID?: string;
  };
  readonly testID?: string;
}

const DISC = 36;
const CRITTER = 30;

export function GuideDock({ guideName, critter, text, action, testID }: GuideDockProps) {
  const t = usePremiumTheme();
  return (
    <GlassSurface
      kind="regular"
      testID={testID}
      style={{
        borderRadius: t.radius.card,
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.space.gap10,
        paddingVertical: t.space.rowPadV,
        paddingStart: t.space.gap10,
        paddingEnd: t.space.gap12,
      }}
    >
      <View
        style={{
          width: DISC,
          height: DISC,
          borderRadius: DISC / 2,
          backgroundColor: t.color.banner.guide.bg,
          alignItems: 'center',
          justifyContent: 'flex-end',
          overflow: 'hidden',
        }}
      >
        <CritterSticker kind={critter} name={guideName} size={CRITTER} edge={false} />
      </View>
      <Text variant="note" tone="inkSecondary" style={{ flex: 1 }}>
        <Text variant="bannerAction">{guideName}</Text>
        {`  ${text}`}
      </Text>
      {action === undefined ? null : (
        <Button
          alignSelf="auto"
          label={action.label}
          size="small"
          onPress={action.onPress}
          {...(action.testID === undefined ? {} : { testID: action.testID })}
        />
      )}
    </GlassSurface>
  );
}
