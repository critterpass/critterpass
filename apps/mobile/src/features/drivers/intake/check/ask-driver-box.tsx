/** What his message leaves out (6c-2): Tokek offers the question, opened in the user's WhatsApp. */
import { useLingui } from '@lingui/react/macro';
import { Linking, View } from 'react-native';

import { guideSticker } from '@/ui/avatar/guides';
import { PillButton } from '@/ui/buttons/PillButton';
import { Row } from '@/ui/layout/Row';
import { Sticker } from '@/ui/sticker/Sticker';
import { Text } from '@/ui/text/Text';
import { makeStyles } from '@/ui/theme';

const useStyles = makeStyles((t) => ({
  ask: {
    borderRadius: t.radius.lg,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: t.semantic.border.control,
    padding: t.space['14'],
  },
}));

export function AskDriverBox(props: {
  readonly guide: string;
  readonly name: string;
  readonly count: number;
  readonly url: string | null;
}) {
  const styles = useStyles();
  const { t } = useLingui();
  const sticker = guideSticker(props.guide);
  const { name, count, url } = props;
  return (
    <View style={styles.ask} testID="drivers-check-ask">
      <Row gap="12" align="center">
        <Sticker kind={sticker.kind} name={sticker.name} pose="point" size={40} />
        <Text variant="bodySm" style={{ flex: 1 }}>
          {t({
            id: 'drivers.check.missing',
            message: `${count} things aren't in his message. Want me to write the question?`,
          })}
        </Text>
        <PillButton
          label={t({ id: 'drivers.check.ask', message: `Ask ${name}` })}
          tone="yellow"
          size="sm"
          disabled={url === null}
          onPress={() => {
            if (url !== null) void Linking.openURL(url);
          }}
          testID="drivers-check-ask-button"
        />
      </Row>
    </View>
  );
}
