/**
 * The frame every setup step sits in (3c-3…3c-7): "← {PLACE} SETUP" with the header tag, the four
 * step chips, the step's h1 and line, the step's content (scrolls) and its bottom actions above
 * the home indicator. Offline, a "No signal" pill and when the step's rows last synced sit under
 * the line; everything still renders from local rows. Pure view: the step screens pass it facts.
 */
import { t } from '@lingui/core/macro';
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { patterns } from '@/motion';
import { Row } from '@/ui/layout/Row';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { OfflinePill } from '@/ui/states/OfflinePill';
import { StaleCaption } from '@/ui/states/StaleCaption';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { Stepper } from './stepper';
import type { WizardStep } from './steps';

export interface SetupSync {
  readonly offline: boolean;
  readonly lastSyncedAt: Date | null;
  readonly now: Date;
}

export interface SetupShellProps {
  readonly destination: string;
  readonly viewing: WizardStep;
  readonly doneSteps: ReadonlySet<WizardStep>;
  readonly openable: ReadonlySet<WizardStep>;
  readonly onSelectStep: (step: WizardStep) => void;
  readonly onBack?: (() => void) | undefined;
  readonly tag?: ReactNode;
  readonly title: string;
  readonly line?: string | undefined;
  /** A member's view: who is running setup and what is theirs to do. */
  readonly status?: ReactNode;
  readonly sync: SetupSync;
  readonly children?: ReactNode;
  /** The bottom actions (primary CTA, a text link under it). */
  readonly footer?: ReactNode;
  readonly testID?: string;
}

const useStyles = makeStyles((th) => ({
  header: { paddingHorizontal: th.space['20'], gap: th.space['8'] },
  topRow: { minHeight: th.space['32'] + th.space['12'] },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: th.space['20'],
    paddingTop: th.space['16'],
    paddingBottom: th.space['24'],
    gap: th.space['12'],
  },
  body: { gap: th.space['12'] },
  offline: { gap: th.space['8'] },
  footer: {
    paddingHorizontal: th.space['20'],
    paddingTop: th.space['8'],
    paddingBottom: th.space['8'],
    gap: th.space['8'],
    alignItems: 'center',
  },
}));

/** A step's content deals in as the step changes (reduced motion: a fade). */
function StepBody({ children }: { readonly children: ReactNode }) {
  const styles = useStyles();
  const deal = patterns.useDeal({ active: true });
  return <Animated.View style={[styles.body, deal]}>{children}</Animated.View>;
}

export function SetupShell({
  destination,
  viewing,
  doneSteps,
  openable,
  onSelectStep,
  onBack,
  tag,
  title,
  line,
  status,
  sync,
  children,
  footer,
  testID,
}: SetupShellProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <Scaffold variant="dark" edges={['top', 'bottom']} testID={testID}>
      <View style={styles.header}>
        <Row justify="space-between" align="center" style={styles.topRow}>
          <BackEyebrow
            label={t({ id: 'setup.shell.back', message: `${destination} setup` })}
            onPress={onBack}
            testID="setup-back"
          />
          {tag ?? null}
        </Row>
        <Stepper
          viewing={viewing}
          doneSteps={doneSteps}
          openable={openable}
          onSelect={onSelectStep}
        />
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        testID="setup-scroll"
      >
        <StepBody key={viewing}>
          <Text variant="h1" accessibilityRole="header" testID="setup-title">
            {title}
          </Text>
          {line === undefined ? null : (
            <Text variant="body" color={theme.semantic.text.secondary}>
              {line}
            </Text>
          )}
          {sync.offline ? (
            <Row align="center" style={styles.offline}>
              <OfflinePill />
              {sync.lastSyncedAt === null ? null : (
                <StaleCaption updatedAt={sync.lastSyncedAt} now={sync.now} />
              )}
            </Row>
          ) : null}
          {status ?? null}
          {children}
        </StepBody>
      </ScrollView>
      {footer === undefined ? null : <View style={styles.footer}>{footer}</View>}
    </Scaffold>
  );
}
