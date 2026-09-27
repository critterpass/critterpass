import { GoogleSignin, isSuccessResponse } from '@react-native-google-signin/google-signin';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useCallback, useEffect, useState } from 'react';
import { Button, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { authClient } from './auth-client';

// Read by tools/scripts/check-release-bundle.ts: a production export must never contain this
// marker, which proves metro.config.js excluded this (dev) route group from the bundle.
export const __CP_DEV_ROUTE__ = true;

const SPIKE_AUTH_BASE_URL = 'https://spike-auth-staging.up.railway.app';

/**
 * A fixed test number would collide with whatever anonymous session last claimed it on a prior
 * run of this screen — Better Auth's anonymous plugin resolves that as a real account merge onto
 * the *other* (earlier) user, per T2's ADR finding 3, so the phone would appear to "verify" (200
 * OK) while this session's own uid never actually changes. A number salted with the current
 * session's uid keeps repeated runs on the same device from merging into each other.
 */
function testPhoneNumberFor(uid: string): string {
  let hash = 0;
  for (let i = 0; i < uid.length; i += 1) hash = (hash * 31 + uid.charCodeAt(i)) >>> 0;
  return `+1555${(hash % 10000000).toString().padStart(7, '0')}`;
}

interface SessionUser {
  id: string;
  isAnonymous: boolean;
  phoneNumber: string | null;
}

function extractUser(session: unknown): SessionUser | null {
  if (
    session === null ||
    typeof session !== 'object' ||
    !('user' in session) ||
    session.user === null ||
    typeof session.user !== 'object'
  ) {
    return null;
  }
  const user = session.user as Record<string, unknown>;
  return {
    id: typeof user['id'] === 'string' ? user['id'] : '',
    isAnonymous: user['isAnonymous'] === true,
    phoneNumber: typeof user['phoneNumber'] === 'string' ? user['phoneNumber'] : null,
  };
}

export default function AuthSpikeScreen() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [uidBefore, setUidBefore] = useState<string | null>(null);
  const [phoneCode, setPhoneCode] = useState('');
  const [siwaRevoked, setSiwaRevoked] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const testPhoneNumber = user ? testPhoneNumberFor(user.id) : null;

  const appendLog = useCallback((line: string) => {
    setLog((current) => [...current.slice(-9), line]);
  }, []);

  const refreshSession = useCallback(async () => {
    // `disableCookieCache` bypasses Better Auth's short-lived cookie-cache optimization — needed
    // here because `isAnonymous`/`phoneNumber` visibly stayed stale on this exact device flow
    // otherwise (a real repro this pass found; see the ADR).
    const { data } = await authClient.getSession({ query: { disableCookieCache: true } });
    setUser(extractUser(data));
  }, []);

  useEffect(() => {
    authClient
      .getSession()
      .then(({ data }) => setUser(extractUser(data)))
      .catch((cause: unknown) => appendLog(`getSession failed: ${String(cause)}`));
    // Real Sign in with Apple revoke listener (apps/mobile only fires this if the OS delivers a
    // revoke notification, e.g. the user removes the app's SIWA grant from Settings > Apple ID >
    // Sign in with Apple). Never triggered in this pass — no Apple ID signed into this simulator
    // — recorded as a founder follow-up in the ADR.
    const subscription = AppleAuthentication.addRevokeListener(() => setSiwaRevoked(true));
    return () => subscription.remove();
  }, [appendLog]);

  const signInAnonymously = useCallback(() => {
    setUidBefore(user?.id ?? null);
    authClient.signIn
      .anonymous()
      .then(() => refreshSession())
      .then(() => appendLog('anonymous sign-in ok'))
      .catch((cause: unknown) => appendLog(`anonymous sign-in failed: ${String(cause)}`));
  }, [appendLog, refreshSession, user]);

  const signInWithApple = useCallback(() => {
    setUidBefore(user?.id ?? null);
    AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    })
      .then((credential) => {
        if (!credential.identityToken) throw new Error('Apple returned no identityToken');
        return authClient.signIn.social({
          provider: 'apple',
          idToken: { token: credential.identityToken },
        });
      })
      .then(() => refreshSession())
      .then(() => appendLog('Apple upgrade ok'))
      .catch((cause: unknown) => appendLog(`Apple sign-in failed: ${String(cause)}`));
  }, [appendLog, refreshSession, user]);

  const signInWithGoogle = useCallback(() => {
    setUidBefore(user?.id ?? null);
    // No Firebase/Google Cloud project is provisioned yet (a recorded founder account gap — see
    // the ADR), so this has no real `webClientId`/`iosClientId` to configure with. Left wired for
    // real so the actual failure mode is what gets recorded, not a guess.
    GoogleSignin.configure({ offlineAccess: false });
    GoogleSignin.signIn()
      .then((result) => {
        if (!isSuccessResponse(result)) throw new Error('Google sign-in was cancelled');
        const idToken = result.data.idToken;
        if (!idToken) throw new Error('Google returned no idToken');
        return authClient.signIn.social({ provider: 'google', idToken: { token: idToken } });
      })
      .then(() => refreshSession())
      .then(() => appendLog('Google upgrade ok'))
      .catch((cause: unknown) => appendLog(`Google sign-in failed: ${String(cause)}`));
  }, [appendLog, refreshSession, user]);

  const sendPhoneOtp = useCallback(() => {
    if (!testPhoneNumber) {
      appendLog('sign in anonymously first');
      return;
    }
    authClient.phoneNumber
      .sendOtp({ phoneNumber: testPhoneNumber })
      .then(() =>
        fetch(
          `${SPIKE_AUTH_BASE_URL}/internal/spike/otp?identifier=${encodeURIComponent(testPhoneNumber)}`,
        ),
      )
      .then((response) => response.json() as Promise<{ code?: string; error?: string }>)
      .then((body) => {
        if (body.code) {
          setPhoneCode(body.code);
          appendLog(`OTP captured from server: ${body.code}`);
        } else {
          appendLog(`OTP read failed: ${body.error ?? 'unknown'}`);
        }
      })
      .catch((cause: unknown) => appendLog(`send OTP failed: ${String(cause)}`));
  }, [appendLog, testPhoneNumber]);

  const verifyPhoneOtp = useCallback(() => {
    if (!testPhoneNumber) {
      appendLog('sign in anonymously first');
      return;
    }
    setUidBefore(user?.id ?? null);
    authClient.phoneNumber
      .verify({ phoneNumber: testPhoneNumber, code: phoneCode, updatePhoneNumber: true })
      .then(() => refreshSession())
      .then(() => appendLog('phone verify ok'))
      .catch((cause: unknown) => appendLog(`phone verify failed: ${String(cause)}`));
  }, [appendLog, phoneCode, refreshSession, testPhoneNumber, user]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text accessibilityRole="header" style={styles.title}>
        S-AUTH on device spike
      </Text>
      <Text style={styles.body}>server: {SPIKE_AUTH_BASE_URL}</Text>

      <View style={styles.resultBox}>
        <Text style={styles.resultLabel}>current session</Text>
        <Text style={styles.body}>uid: {user?.id ?? '(none)'}</Text>
        <Text style={styles.body}>isAnonymous: {String(user?.isAnonymous ?? 'n/a')}</Text>
        <Text style={styles.body}>phoneNumber: {user?.phoneNumber ?? '(none)'}</Text>
        {uidBefore !== null ? (
          <Text style={styles.body}>
            uid before last action: {uidBefore} ({uidBefore === user?.id ? 'unchanged' : 'CHANGED'})
          </Text>
        ) : null}
      </View>

      <View style={styles.buttonRow}>
        <Button title="Sign in anonymously" onPress={signInAnonymously} />
      </View>
      <View style={styles.buttonRow}>
        <Button title="Upgrade: Sign in with Apple" onPress={signInWithApple} />
      </View>
      <View style={styles.buttonRow}>
        <Button title="Upgrade: Sign in with Google" onPress={signInWithGoogle} />
      </View>

      <View style={styles.resultBox}>
        <Text style={styles.resultLabel}>
          phone upgrade (test number {testPhoneNumber ?? '(sign in first)'})
        </Text>
        <View style={styles.buttonRow}>
          <Button title="Send code" onPress={sendPhoneOtp} />
        </View>
        <TextInput
          style={styles.input}
          value={phoneCode}
          onChangeText={setPhoneCode}
          placeholder="OTP code"
          keyboardType="number-pad"
        />
        <View style={styles.buttonRow}>
          <Button title="Verify code" onPress={verifyPhoneOtp} disabled={phoneCode.length === 0} />
        </View>
      </View>

      {siwaRevoked ? <Text style={styles.body}>SIWA revoke event received</Text> : null}

      <View style={styles.resultBox}>
        <Text style={styles.resultLabel}>log</Text>
        {log.map((line, index) => (
          <Text key={index} style={styles.body}>
            {line}
          </Text>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, gap: 10, padding: 16 },
  title: { fontSize: 18, fontWeight: '600' },
  body: { fontSize: 13 },
  buttonRow: { alignSelf: 'flex-start' },
  resultBox: {
    gap: 4,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    alignSelf: 'stretch',
  },
  resultLabel: { fontSize: 12, textTransform: 'uppercase', opacity: 0.6 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    padding: 8,
    alignSelf: 'stretch',
  },
});
