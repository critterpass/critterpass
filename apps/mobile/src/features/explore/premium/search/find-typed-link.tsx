/**
 * A link typed (or pasted) into Find: "That's a link", what the guide does with it, and Add from it,
 * which opens the link sheet (4.32). A link is never searched by name.
 */
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { Button, Card, Text, usePremiumTheme } from '@/ui/premium';

import { Eyebrow } from '../components/labels';

export function FindTypedLink(props: { readonly guideName: string; readonly onAdd: () => void }) {
  const theme = usePremiumTheme();
  const guideName = props.guideName;
  return (
    <Card
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.space.gap12,
        padding: theme.space.gap12,
      }}
      testID="search-typed-link"
    >
      <View style={{ flex: 1, gap: theme.space.gap4 / 2 }}>
        <Eyebrow text={t({ id: 'search.typedLink.eyebrow', message: 'That’s a link' })} />
        <Text variant="caption" tone="muted">
          {t({
            id: 'search.typedLink.line',
            message: `${guideName} reads it and finds the places in it.`,
          })}
        </Text>
      </View>
      <Button
        alignSelf="auto"
        label={t({ id: 'search.clipboard.add', message: 'Add from it' })}
        size="small"
        onPress={props.onAdd}
        testID="search-typed-link-add"
      />
    </Card>
  );
}
