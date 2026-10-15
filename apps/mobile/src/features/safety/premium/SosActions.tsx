/** What an SOS asks of whoever is looking at it (6.17): I'm going, call them, I'm OK, send again. */
import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';

import { shortName } from '@/lib/people/member-name';
import { Button } from '@/ui/premium';

import type { SosViewProps } from '../sos/view-types';

export function SosActions({ props }: { readonly props: SosViewProps }) {
  const { t } = useLingui();
  const { model, general } = props;
  // The call button beside "I'm going" names the sender as their crew calls them.
  const name = shortName(model.senderName);
  const ok = (
    <Button
      label={t({ id: 'safety.sos.imOk', message: 'I’m OK' })}
      variant="secondary"
      disabled={props.busy}
      onPress={props.onOk}
      testID="sos-ok"
    />
  );
  if (model.state === 'resolved') {
    return (
      <Button
        label={t({ id: 'safety.sos.close', message: 'Close' })}
        variant="secondary"
        onPress={props.onClose}
        testID="sos-close"
      />
    );
  }
  if (model.state === 'stale') {
    return (
      <View style={styles.pair}>
        <View style={styles.wide}>
          <Button
            label={t({ id: 'safety.sos.sendNow', message: 'Send now' })}
            disabled={props.busy}
            onPress={props.onSendAgain}
            testID="sos-send-now"
          />
        </View>
        <View style={styles.flex}>{ok}</View>
      </View>
    );
  }
  if (model.role === 'sender') {
    const call = (
      <Button
        label={t({ id: 'safety.sos.callGeneral', message: `Call ${general}` })}
        variant={model.reachedNobody ? 'primary' : 'secondary'}
        onPress={props.onCallGeneral}
        testID="sos-call-general"
      />
    );
    return model.reachedNobody ? (
      <View style={styles.pair}>
        <View style={styles.wide}>{call}</View>
        <View style={styles.flex}>{ok}</View>
      </View>
    ) : (
      <View style={styles.pair}>
        <View style={styles.wide}>
          <Button
            label={t({ id: 'safety.sos.imOk', message: 'I’m OK' })}
            disabled={props.busy}
            onPress={props.onOk}
            testID="sos-ok"
          />
        </View>
        <View style={styles.flex}>{call}</View>
      </View>
    );
  }
  const going = model.myResponse === 'coming';
  return (
    <View style={styles.pair}>
      <View style={styles.wide}>
        <Button
          label={
            going
              ? t({ id: 'safety.sos.goingDone', message: 'Going ✓' })
              : t({ id: 'safety.sos.imGoing', message: 'I’m going' })
          }
          disabled={going || props.busy}
          onPress={props.onGoing}
          testID="sos-going"
        />
      </View>
      {props.senderPhone === null ? null : (
        <View style={styles.flex}>
          <Button
            label={t({ id: 'safety.sos.callName', message: `Call ${name}` })}
            variant="secondary"
            onPress={props.onCallSender}
            testID="sos-call-sender"
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  wide: { flex: 1.4 },
  pair: { flexDirection: 'row', gap: 8 },
});
