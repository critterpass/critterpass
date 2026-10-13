/**
 * Signing the crew stamp in the premium look (undesigned): asked once, on the stamp card. A
 * finger signature on the pad signs every stamp shared with the crew; or keep the name instead.
 * The pad is the app's one signature engine.
 */
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { PremiumSheet } from '@/features/album';
import { SignatureLayer } from '@/ui/documents/SignatureLayer';
import { Button, Text } from '@/ui/premium';

import { PAD_HEIGHT, useSignatureForm } from '../../signature/signature-form';
import { type SignatureSheetProps } from '../../story/story-look';

export function PremiumSignatureSheet(props: SignatureSheetProps) {
  const form = useSignatureForm(props);
  return (
    <PremiumSheet
      title={t({ id: 'recap.signature.title', message: 'Sign the crew stamp' })}
      onClose={props.onClose}
      scroll={false}
      testID="recap-signature"
    >
      <Text variant="body" tone="muted">
        {t({
          id: 'recap.signature.line',
          message: 'Once, and it signs every stamp you share with the crew, in your colour.',
        })}
      </Text>
      <View onLayout={(event) => form.setWidth(event.nativeEvent.layout.width)}>
        <SignatureLayer
          name={props.name}
          value={form.value}
          onChange={form.setValue}
          height={PAD_HEIGHT}
        />
      </View>
      <Button
        label={
          form.value?.kind === 'drawn'
            ? t({ id: 'recap.signature.save', message: 'Sign it' })
            : t({ id: 'recap.signature.later', message: 'Keep my name' })
        }
        loading={form.saving}
        onPress={form.save}
        testID="recap-signature-save"
      />
    </PremiumSheet>
  );
}
