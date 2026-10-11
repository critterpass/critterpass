/**
 * The Find field (4.30, 4.31): a white 48 pill with the magnifier, a 2 pt ink ring while it is
 * focused or holds words, the clear × while editing, and "Cancel" outside it (the way back; it
 * drops what was typed). It focuses on open; Return says "search"; once a question is asked the
 * keyboard goes and the question reads from its start.
 */
import { t } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable, TextInput, View } from 'react-native';

import { Icon, ring, Text, TextButton, usePremiumTheme } from '@/ui/premium';
import { premiumFont } from '@/ui/premium/text/Text';

import { SearchGlyph } from '../components/search-glyph';

export interface FindFieldProps {
  readonly value: string;
  readonly onChangeText: (text: string) => void;
  readonly onSubmit: () => void;
  readonly onCancel: () => void;
  readonly guideName: string;
  /** The text was asked: the keyboard goes and the field shows the question from its start. */
  readonly asked: boolean;
}

const FIELD_HEIGHT = 48;
const GLYPH = 17;

export function FindField(props: FindFieldProps) {
  const theme = usePremiumTheme();
  const { i18n } = useLingui();
  const input = useRef<TextInput | null>(null);
  const [editing, setEditing] = useState(true);
  const placeholder = t({
    id: 'explore.premium.find.placeholder',
    message: `Find anything, or ask ${props.guideName}`,
  });
  const { value, asked } = props;
  useEffect(() => {
    if (asked) Keyboard.dismiss();
  }, [asked, value]);
  const showStart = !editing && value !== '';
  const style = theme.type.field;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.space.gap10,
        paddingHorizontal: theme.space.gap16,
      }}
    >
      <Pressable
        onPress={() => input.current?.focus()}
        accessible={false}
        style={{
          flex: 1,
          height: FIELD_HEIGHT,
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.space.gap8,
          paddingStart: theme.space.rowPadH,
          paddingEnd: value === '' ? theme.space.rowPadH : 0,
          borderRadius: FIELD_HEIGHT / 2,
          backgroundColor: theme.color.card,
          boxShadow:
            editing || value !== ''
              ? `${ring(theme.size.focusRing, theme.color.ink)}, ${theme.shadow.float}`
              : theme.shadow.float,
        }}
      >
        <SearchGlyph size={GLYPH} />
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <TextInput
            ref={input}
            value={value}
            onChangeText={props.onChangeText}
            onSubmitEditing={props.onSubmit}
            placeholder={placeholder}
            placeholderTextColor={theme.color.placeholder}
            selectionColor={theme.color.caret}
            cursorColor={theme.color.caret}
            accessibilityLabel={placeholder}
            returnKeyType="search"
            autoCorrect={false}
            spellCheck={false}
            autoComplete="off"
            textContentType="none"
            autoFocus
            onFocus={() => setEditing(true)}
            onBlur={() => setEditing(false)}
            allowFontScaling
            maxFontSizeMultiplier={style.maxScale}
            style={{
              ...premiumFont(style, i18n.locale, false),
              fontSize: style.size,
              color: theme.color.ink,
              paddingVertical: 0,
              // Hidden but still there for the tap (a transparent colour leaves Android's text).
              opacity: showStart ? 0 : 1,
            }}
            testID="search-field"
          />
          {showStart ? (
            <Text
              variant="field"
              numberOfLines={1}
              ellipsizeMode="tail"
              pointerEvents="none"
              importantForAccessibility="no"
              style={{ position: 'absolute', start: 0, end: 0 }}
              testID="search-field-query"
            >
              {value}
            </Text>
          ) : null}
        </View>
        {value === '' || !editing ? null : (
          <Pressable
            onPress={() => props.onChangeText('')}
            accessibilityRole="button"
            accessibilityLabel={t({ id: 'search.field.clear', message: 'Clear' })}
            hitSlop={theme.space.gap8}
            style={{
              width: theme.size.hit,
              height: FIELD_HEIGHT,
              alignItems: 'center',
              justifyContent: 'center',
            }}
            testID="search-clear"
          >
            <Icon name="close" size={theme.size.glyph - 4} color={theme.color.muted} />
          </Pressable>
        )}
      </Pressable>
      <TextButton
        label={t({ id: 'common.confirm.cancel', message: 'Cancel' })}
        tone="ink"
        onPress={props.onCancel}
        testID="search-back"
      />
    </View>
  );
}
