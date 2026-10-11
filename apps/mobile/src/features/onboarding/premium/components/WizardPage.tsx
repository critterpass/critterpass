/**
 * A pass-wizard page frame: the ground, the wizard header, a scroll that keeps the focused field
 * above the keyboard, and a footer that rides the keyboard (the page's primary action docks on
 * top of the keys while typing and sits at the bottom otherwise).
 */
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePremiumTheme } from '@/ui/premium';
import { KeyboardAwareScroll, KeyboardStickyFooter } from '@/ui/premium/shell';

import { WizardHeader } from './WizardHeader';

export interface WizardPageProps {
  readonly step?: { readonly current: number; readonly total: number };
  readonly header?: ReactNode;
  readonly onBack?: () => void;
  readonly backLabel: string;
  readonly footer?: ReactNode;
  readonly children: ReactNode;
  readonly testID?: string;
}

export function WizardPage({
  step,
  header,
  onBack,
  backLabel,
  footer,
  children,
  testID,
}: WizardPageProps) {
  const theme = usePremiumTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: theme.color.ground }} testID={testID}>
      {header ??
        (step === undefined ? null : (
          <WizardHeader
            current={step.current}
            total={step.total}
            backLabel={backLabel}
            {...(onBack === undefined ? {} : { onBack })}
          />
        ))}
      <KeyboardAwareScroll
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingHorizontal: theme.space.titleGutter,
          paddingTop: theme.space.gap16,
          paddingBottom: theme.space.gap16,
          gap: theme.space.gap16,
        }}
      >
        {children}
      </KeyboardAwareScroll>
      {footer === undefined ? null : (
        <KeyboardStickyFooter openedOffset={theme.space.gap8}>
          <View
            style={{
              paddingHorizontal: theme.space.titleGutter,
              paddingTop: theme.space.gap8,
              paddingBottom: Math.max(insets.bottom, theme.space.gap16),
              gap: theme.space.gap8,
              backgroundColor: theme.color.ground,
            }}
          >
            {footer}
          </View>
        </KeyboardStickyFooter>
      )}
    </View>
  );
}
