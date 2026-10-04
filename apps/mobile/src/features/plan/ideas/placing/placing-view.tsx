/**
 * Tokek is placing them (7h-6) as drawn: IDEAS and "Keep browsing" over the little map, PLACING
 * {n} IDEAS, the four step lines (ticked green when done, yellow while running, an empty ring
 * before), and the line that says leaving doesn't stop it. A finished run with nothing placed or a
 * failed run shows its own line and a way on (undesigned: the same layout, one action).
 */
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { View } from 'react-native';

import { PillButton } from '@/ui/buttons/PillButton';
import { Icon } from '@/ui/icons/Icon';
import { PressScale } from '@/ui/press/PressScale';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { PlacingMap, type MapPin } from './placing-map';
import type { StepStatus } from './progress';

const DOT = 22;

const useStyles = makeStyles((t) => ({
  body: { flex: 1, paddingHorizontal: t.size.gutter, gap: t.space['20'] },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  lines: { gap: t.space['12'] },
  line: { flexDirection: 'row', alignItems: 'center', gap: t.space['12'] },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  foot: { paddingHorizontal: t.size.gutter, paddingBottom: t.space['24'], gap: t.space['12'] },
}));

export interface PlacingLine {
  readonly key: string;
  readonly text: string;
  readonly status: StepStatus;
}

export interface PlacingViewProps {
  readonly title: string;
  readonly pins: readonly MapPin[];
  readonly lines: readonly PlacingLine[];
  readonly foot: string;
  /** A finished run with nothing to review, or a failed one: what happened and a way on. */
  readonly outcome: { readonly action: string; readonly onAction: () => void } | null;
  readonly onLeave: () => void;
}

function StepDot({ status }: { readonly status: StepStatus }) {
  const styles = useStyles();
  const theme = useTheme();
  const fill =
    status === 'done'
      ? theme.semantic.state.success
      : status === 'running'
        ? theme.semantic.action.primary
        : status === 'failed'
          ? theme.semantic.state.urgent
          : 'transparent';
  return (
    <View
      style={[
        styles.dot,
        {
          backgroundColor: fill,
          borderColor: status === 'pending' ? theme.semantic.border.decorative : fill,
        },
      ]}
    >
      {status === 'done' ? (
        <Icon name="check" size={14} color={theme.color.paper.ink} decorative />
      ) : null}
    </View>
  );
}

export function PlacingView(props: PlacingViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { t } = useLingui();
  const [width, setWidth] = useState(0);
  return (
    <Scaffold testID="plan-placing">
      <View style={styles.body}>
        <View style={styles.top}>
          <Text variant="eyebrow" color={theme.semantic.text.secondary}>
            {t({ id: 'plan.placing.eyebrow', message: 'IDEAS' })}
          </Text>
          <PressScale
            widthClass="narrow"
            accessibilityRole="button"
            accessibilityLabel={t({ id: 'plan.placing.leave', message: 'Keep browsing' })}
            onPress={props.onLeave}
            testID="plan-placing-leave"
          >
            <Text variant="body" color={theme.semantic.text.secondary}>
              {t({ id: 'plan.placing.leave', message: 'Keep browsing' })}
            </Text>
          </PressScale>
        </View>
        <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
          <PlacingMap pins={props.pins} width={width} />
        </View>
        <Text variant="displayXl" singleLine={false} testID="plan-placing-title">
          {props.title}
        </Text>
        <View style={styles.lines} accessibilityLiveRegion="polite">
          {props.lines.map((line) => (
            <View
              key={line.key}
              style={styles.line}
              accessible
              accessibilityLabel={line.text}
              accessibilityState={{
                checked: line.status === 'done',
                busy: line.status === 'running',
              }}
              testID={`plan-placing-step-${line.key}-${line.status}`}
            >
              <StepDot status={line.status} />
              <Text
                variant="body"
                color={
                  line.status === 'pending'
                    ? theme.semantic.text.secondary
                    : theme.semantic.text.primary
                }
              >
                {line.text}
              </Text>
            </View>
          ))}
        </View>
      </View>
      <View style={styles.foot}>
        {props.outcome === null ? null : (
          <PillButton
            label={props.outcome.action}
            onPress={props.outcome.onAction}
            block
            testID="plan-placing-action"
          />
        )}
        <Text
          variant="bodySm"
          color={theme.semantic.text.secondary}
          style={{ textAlign: 'center' }}
        >
          {props.foot}
        </Text>
      </View>
    </Scaffold>
  );
}
