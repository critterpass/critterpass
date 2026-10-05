/**
 * The search field (7d-1…7d-4, 7i-2): the guide beside the input, "Search Bali, or ask Tokek",
 * a back arrow before it and a clear × while there is text. Return asks the text in plain words.
 */
import { t } from '@lingui/core/macro';
import { useEffect, useState } from 'react';
import { Keyboard, TextInput, View } from 'react-native';

import { guideSticker } from '@/ui/avatar/guides';
import { IconButton } from '@/ui/buttons/IconButton';
import { StraightArrow } from '@/ui/icons/StraightArrow';
import type { GuideId } from '@/ui/people/GuideLine';
import { PressScale } from '@/ui/press/PressScale';
import { useBackAffordance } from '@/ui/qa/back-affordance';
import { Sticker } from '@/ui/sticker/Sticker';
import { makeStyles, MIN_TOUCH_TARGET, Text, useTheme } from '@/ui';

import { useFieldFont } from './use-field-font';

const CROSS = '×';

const useStyles = makeStyles((th) => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: th.space['8'] },
  field: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: th.space['8'],
    minHeight: 52,
    paddingStart: th.space['10'],
    borderRadius: 26,
    borderWidth: 2,
    backgroundColor: th.semantic.bg.raised,
  },
  input: { flex: 1, minHeight: 48, paddingVertical: 0 },
  inputBox: { flex: 1, justifyContent: 'center' },
  shown: { position: 'absolute', start: 0, end: 0 },
  clear: { minWidth: MIN_TOUCH_TARGET, minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' },
}));

export interface SearchHeaderProps {
  readonly value: string;
  readonly onChangeText: (text: string) => void;
  readonly onSubmit: () => void;
  readonly onCancel: () => void;
  readonly destination: string;
  readonly guide: GuideId;
  readonly guideName: string;
  readonly autoFocus?: boolean;
  /** The guide greys out with no signal (7i-2). */
  readonly dimmed?: boolean;
  /**
   * The text was asked (Return, or a tapped example): the field lets go of the keyboard, so the
   * question reads from its start instead of scrolled to its tail.
   */
  readonly asked?: boolean;
}

export function SearchHeader(props: SearchHeaderProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { value, destination, guideName } = props;
  const sticker = guideSticker(props.guide);
  const placeholder = t({
    id: 'search.field.placeholder',
    message: `Search ${destination}, or ask ${guideName}`,
  });
  const focused = value === '';
  const font = useFieldFont();
  useBackAffordance();
  const [editing, setEditing] = useState(props.autoFocus ?? true);
  // Not being edited, the query shows from its start with a tail ellipsis (7d-2, 7d-4), drawn over
  // the input, which stays underneath for the tap.
  const showStart = !editing && value !== '';
  const asked = props.asked === true;
  useEffect(() => {
    // Dismissing the keyboard blurs the field.
    if (asked) Keyboard.dismiss();
  }, [asked, value]);
  return (
    <View style={styles.row}>
      <IconButton
        label={t({ id: 'search.field.back', message: 'Back' })}
        glyph={<StraightArrow direction="back" color={theme.semantic.text.primary} />}
        onPress={props.onCancel}
        testID="search-back"
      />
      <View
        style={[
          styles.field,
          {
            borderColor: focused ? theme.semantic.action.primary : 'transparent',
          },
        ]}
      >
        <View style={{ opacity: props.dimmed === true ? 0.4 : 1 }}>
          <Sticker kind={sticker.kind} name={sticker.name} pose="idle" size={30} />
        </View>
        <View style={styles.inputBox}>
          <TextInput
            value={value}
            onChangeText={props.onChangeText}
            onSubmitEditing={props.onSubmit}
            placeholder={placeholder}
            placeholderTextColor={theme.semantic.text.secondary}
            accessibilityLabel={placeholder}
            returnKeyType="search"
            autoCorrect={false}
            spellCheck={false}
            autoComplete="off"
            textContentType="none"
            autoFocus={props.autoFocus ?? true}
            onFocus={() => setEditing(true)}
            onBlur={() => setEditing(false)}
            allowFontScaling={false}
            style={[
              styles.input,
              font,
              // Hidden but still there for the tap (a transparent colour leaves Android's text showing).
              { color: theme.semantic.text.primary, opacity: showStart ? 0 : 1 },
            ]}
            testID="search-field"
          />
          {showStart ? (
            <Text
              variant="bodyLg"
              numberOfLines={1}
              ellipsizeMode="tail"
              style={styles.shown}
              pointerEvents="none"
              importantForAccessibility="no"
              testID="search-field-query"
            >
              {value}
            </Text>
          ) : null}
        </View>
        {value === '' ? null : (
          <PressScale
            widthClass="narrow"
            accessibilityRole="button"
            accessibilityLabel={t({ id: 'search.field.clear', message: 'Clear' })}
            onPress={() => props.onChangeText('')}
            style={styles.clear}
            testID="search-clear"
          >
            <Text
              variant="body"
              color={theme.semantic.text.secondary}
              style={{ textAlign: 'center' }}
            >
              {CROSS}
            </Text>
          </PressScale>
        )}
      </View>
    </View>
  );
}
