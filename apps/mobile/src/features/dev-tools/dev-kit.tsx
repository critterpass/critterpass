/**
 * The Developer tools screens' building blocks, drawn with the premium kit: a page, a column, text
 * in a handful of sizes, list rows, buttons, cards and a field. Only the `(dev)` routes use these,
 * and those never reach a store build, so this stays a small, plain toolkit rather than a design.
 */
import { useMemo, type ReactNode } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  type AccessibilityRole,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { createMakeStyles } from '@/lib/theme';

import {
  Button,
  Card as PremiumCard,
  Icon,
  PressableScale,
  Text as PremiumText,
  TextField as PremiumTextField,
  usePremiumTheme,
  type PremiumTheme,
} from '@/ui/premium';

/** The theme shape the dev screens style themselves with. */
export interface DevTheme {
  readonly space: Readonly<Record<'4' | '6' | '8' | '10' | '12' | '16' | '24', number>>;
  readonly size: { readonly gutter: number };
  readonly radius: Readonly<Record<'xs' | 'md' | 'lg', number>>;
  readonly semantic: {
    readonly state: { readonly success: string; readonly warning: string; readonly urgent: string };
    readonly text: { readonly onAccent: string; readonly secondary: string };
    readonly border: { readonly decorative: string; readonly control: string };
    readonly bg: { readonly control: string };
    readonly action: { readonly primary: string };
  };
}

function devTheme(p: PremiumTheme): DevTheme {
  return {
    space: { '4': 4, '6': 6, '8': 8, '10': 10, '12': 12, '16': 16, '24': 24 },
    size: { gutter: p.space.gutter },
    radius: { xs: 4, md: 12, lg: 16 },
    semantic: {
      state: {
        success: p.color.status.booked.text,
        warning: p.color.status.tangerine.text,
        urgent: p.color.destructive.text,
      },
      text: { onAccent: p.color.onAccent, secondary: p.color.muted },
      border: { decorative: p.color.hairline, control: p.color.fieldBorder },
      bg: { control: p.color.control },
      action: { primary: p.color.ink },
    },
  };
}

export function useTheme(): DevTheme {
  const premium = usePremiumTheme();
  return useMemo(() => devTheme(premium), [premium]);
}

/** `makeStyles((t) => ({...}))` over the dev theme. */
export const makeStyles = createMakeStyles(useTheme);

export function Scaffold({
  children,
  edges = ['top', 'bottom'],
  testID,
}: {
  readonly children: ReactNode;
  readonly edges?: readonly ('top' | 'bottom')[];
  readonly testID?: string;
}) {
  const p = usePremiumTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      testID={testID}
      style={{
        flex: 1,
        backgroundColor: p.color.ground,
        paddingTop: edges.includes('top') ? insets.top : 0,
        paddingBottom: edges.includes('bottom') ? insets.bottom : 0,
      }}
    >
      {children}
    </View>
  );
}

export function Stack({
  gap = '8',
  children,
  style,
  testID,
}: {
  readonly gap?: string;
  readonly children?: ReactNode;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
}) {
  return (
    <View testID={testID} style={[{ gap: Number(gap) }, style]}>
      {children}
    </View>
  );
}

type DevVariant =
  | 'h1'
  | 'h2'
  | 'h3'
  | 'title'
  | 'eyebrow'
  | 'body'
  | 'bodySm'
  | 'caption'
  | 'monoData'
  | 'label'
  | 'rowTitle';

const VARIANTS = {
  h1: 'largeTitle',
  h2: 'title',
  h3: 'headline',
  title: 'headline',
  eyebrow: 'label',
  body: 'body',
  bodySm: 'rowText',
  caption: 'caption',
  monoData: 'caption',
  label: 'label',
  rowTitle: 'rowTitle',
} as const;

export function Text({
  variant = 'body',
  color,
  children,
  style,
  testID,
  numberOfLines,
  accessibilityRole,
}: {
  readonly variant?: DevVariant;
  readonly color?: string | undefined;
  readonly children?: ReactNode;
  readonly style?: StyleProp<TextStyle>;
  readonly testID?: string;
  readonly numberOfLines?: number;
  readonly singleLine?: boolean;
  readonly accessibilityRole?: AccessibilityRole;
}) {
  return (
    <PremiumText
      variant={VARIANTS[variant]}
      {...(variant === 'eyebrow' ? { tone: 'muted' as const } : {})}
      color={color}
      singleLine={false}
      style={style}
      {...(testID === undefined ? {} : { testID })}
      {...(numberOfLines === undefined ? {} : { numberOfLines })}
      {...(accessibilityRole === undefined ? {} : { accessibilityRole })}
    >
      {children}
    </PremiumText>
  );
}

export function SecondaryText(props: Parameters<typeof Text>[0]) {
  const p = usePremiumTheme();
  return (
    <Text {...props} color={props.color ?? p.color.muted} variant={props.variant ?? 'bodySm'} />
  );
}

export function ListCard({
  title,
  subtitle,
  onPress,
  chevron = true,
  trailing,
  testID,
}: {
  readonly title: string;
  readonly subtitle?: string;
  readonly onPress?: () => void;
  readonly chevron?: boolean;
  readonly trailing?: ReactNode;
  readonly testID?: string;
}) {
  const p = usePremiumTheme();
  return (
    <PressableScale
      {...(onPress === undefined ? { disabled: true } : { onPress })}
      accessibilityRole="button"
      accessibilityLabel={title}
      pressedScale={0.98}
      {...(testID === undefined ? {} : { testID })}
    >
      <View style={[styles.row, { backgroundColor: p.color.card, borderRadius: p.radius.cardRow }]}>
        <View style={styles.grow}>
          <PremiumText variant="rowTitle" singleLine={false}>
            {title}
          </PremiumText>
          {subtitle === undefined ? null : (
            <PremiumText variant="caption" tone="muted" singleLine={false}>
              {subtitle}
            </PremiumText>
          )}
        </View>
        {trailing}
        {chevron && onPress !== undefined ? <Icon name="forward" size={16} /> : null}
      </View>
    </PressableScale>
  );
}

export function PillButton({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  testID,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly variant?: 'primary' | 'secondary' | 'tertiary';
  readonly size?: 'sm' | 'md';
  readonly block?: boolean;
  readonly tone?: string;
  readonly disabled?: boolean;
  readonly loading?: boolean;
  readonly testID?: string;
}) {
  return (
    <Button
      label={label}
      onPress={onPress}
      variant={variant === 'primary' ? 'primary' : 'secondary'}
      disabled={disabled}
      loading={loading}
      {...(testID === undefined ? {} : { testID })}
    />
  );
}

export function Card({
  children,
  testID,
}: {
  readonly children?: ReactNode;
  readonly testID?: string;
}) {
  return (
    <PremiumCard padded style={styles.card} {...(testID === undefined ? {} : { testID })}>
      {children}
    </PremiumCard>
  );
}

export function TextField({
  label,
  ...input
}: { readonly label: string } & Omit<
  Parameters<typeof PremiumTextField>[0],
  'accessibilityLabel'
>) {
  return (
    <View style={styles.field}>
      <Text variant="caption">{label}</Text>
      <PremiumTextField accessibilityLabel={label} {...input} />
    </View>
  );
}

/** A screen of dev content: a scrolling column inside the gutters. */
export function DevPage({
  children,
  testID,
}: {
  readonly children: ReactNode;
  readonly testID?: string;
}) {
  const p = usePremiumTheme();
  return (
    <Scaffold {...(testID === undefined ? {} : { testID })}>
      <ScrollView contentContainerStyle={{ padding: p.space.gutter, gap: 24 }}>
        {children}
      </ScrollView>
    </Scaffold>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  grow: { flex: 1, gap: 2 },
  card: { gap: 8 },
  field: { gap: 6 },
});
