/**
 * The search field (4.30, 4.31): a 48-high round pill with the magnifier, nav glass at rest and
 * white with the 2 pt ink ring while typing, and a grey ✕ disc that clears it once it holds words.
 * Placeholder words are regular, typed ones medium.
 */
import { useLingui } from '@lingui/react/macro';
import { forwardRef, useState, type ComponentRef } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import type { TextInputProps } from 'react-native';

import { GlassSurface } from '../glass/GlassSurface';
import { Icon } from '../icons/Icon';
import { PressableScale } from '../motion/PressableScale';
import { usePremiumTheme } from '../theme/PremiumThemeProvider';
import { ring } from '../theme/theme';

export interface SearchFieldProps extends Omit<
  TextInputProps,
  'style' | 'placeholderTextColor' | 'selectionColor' | 'value' | 'onChangeText'
> {
  readonly value: string;
  readonly onChangeText: (next: string) => void;
  /** What the search finds, read by assistive tech and shown as the placeholder by default. */
  readonly accessibilityLabel: string;
  /** The clear disc's label. @default "Clear" */
  readonly clearLabel?: string;
  /** `glass` over the page (the default), `white` on a card or sheet. */
  readonly surface?: 'glass' | 'white';
}

const HEIGHT = 48;
const CLEAR = 22;

export const SearchField = forwardRef<ComponentRef<typeof TextInput>, SearchFieldProps>(
  function SearchField(
    {
      value,
      onChangeText,
      accessibilityLabel,
      clearLabel,
      surface = 'glass',
      placeholder,
      onFocus,
      onBlur,
      testID,
      ...input
    },
    ref,
  ) {
    const th = usePremiumTheme();
    const { t } = useLingui();
    const [focused, setFocused] = useState(false);
    const filled = value !== '';
    const shape = {
      height: HEIGHT,
      borderRadius: HEIGHT / 2,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: th.space.gap10,
      paddingStart: th.space.gap16,
      paddingEnd: filled ? th.space.gap12 : th.space.gap16,
    };
    const body = (
      <>
        <Icon name="search" size={17} stroke={2.4} color={th.color.muted} />
        <TextInput
          ref={ref}
          {...input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder ?? accessibilityLabel}
          accessibilityLabel={accessibilityLabel}
          allowFontScaling
          maxFontSizeMultiplier={th.type.field.maxScale}
          placeholderTextColor={th.color.placeholder}
          selectionColor={th.color.caret}
          cursorColor={th.color.caret}
          returnKeyType={input.returnKeyType ?? 'search'}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          style={{
            flex: 1,
            fontSize: th.type.body.size,
            fontWeight: filled ? th.type.field.weight : '400',
            color: th.color.ink,
            paddingVertical: 0,
          }}
          {...(testID === undefined ? {} : { testID })}
        />
        {filled ? (
          <PressableScale
            onPress={() => onChangeText('')}
            accessibilityLabel={
              clearLabel ?? t({ id: 'common.premium.search.clear', message: 'Clear' })
            }
            hitSlop={{ top: 11, bottom: 11, left: 11, right: 11 }}
            {...(testID === undefined ? {} : { testID: `${testID}-clear` })}
          >
            <View
              style={{
                width: CLEAR,
                height: CLEAR,
                borderRadius: CLEAR / 2,
                backgroundColor: th.color.placeholder,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="close" size={12} stroke={3} color={th.color.card} />
            </View>
          </PressableScale>
        ) : null}
      </>
    );
    // One tree whatever the state, so the input keeps its focus: the glass is a backdrop behind it.
    const white = focused || surface === 'white';
    return (
      <View
        style={[
          shape,
          white
            ? {
                backgroundColor: th.color.card,
                boxShadow: focused
                  ? `${ring(th.size.focusRing, th.color.ink)}, ${th.shadow.float}`
                  : th.shadow.raised,
              }
            : null,
        ]}
      >
        {white ? null : (
          <GlassSurface
            kind="nav"
            style={[StyleSheet.absoluteFill, { borderRadius: HEIGHT / 2 }]}
          />
        )}
        {body}
      </View>
    );
  },
);
