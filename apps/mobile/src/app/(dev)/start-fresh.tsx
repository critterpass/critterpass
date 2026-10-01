import { Directory, Paths } from 'expo-file-system';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import * as Updates from 'expo-updates';
import { useState } from 'react';
import { DevSettings, View } from 'react-native';
import { createMMKV } from 'react-native-mmkv';

import { getAlarmPort } from '../../../modules/cp-alarm';

import { createDevSlots } from '@/data/auth/dev-slots';
import { runOnSignOutHooks } from '@/data/auth/sign-out-hooks';
import { secureActionKeyStorage } from '@/data/push/expo-native';
import { resolveApiBaseUrl } from '@/data/places/apiBaseUrl';
import { eraseAccount } from '@/lib/dev-tools/erase-account';
import {
  startFresh,
  type EraseOutcome,
  type FileTarget,
  type StartFreshPorts,
} from '@/lib/dev-tools/start-fresh';
import { useLocale } from '@/lib/i18n/use-locale';
import { makeStyles, Stack, Text, useTheme } from '@/ui';
import { SecondaryText } from '@/ui/cards/SecondaryText';
import { Sheet } from '@/ui/sheet/Sheet';
import { ConfirmSheet } from '@/ui/states/ConfirmSheet';

// Read by tools/scripts/check-release-bundle.ts: a production export must never contain this
// marker, which proves metro.config.js excluded this (dev) route group from the bundle.
export const __CP_DEV_ROUTE__ = true;

async function eraseThisAccount(): Promise<EraseOutcome> {
  const { sessionHeaders } = await import('@/data/app-session/device-session');
  return eraseAccount({ baseUrl: resolveApiBaseUrl(), sessionHeaders, fetch });
}

/**
 * Lets go of the account on this phone. While its session is still live on the server it is signed
 * out there first; an erased account's sessions are already ended, and no call is made on them.
 */
async function signOutHere(sessionStillOnServer: boolean): Promise<void> {
  if (sessionStillOnServer) {
    const { deviceAuth } = await import('@/data/app-session/device-session');
    const signedOut = await deviceAuth()
      .signOut()
      .then((result) => result.signedOut)
      .catch(() => false);
    // A confirmed sign-out has already run the cleanup.
    if (signedOut) return;
  }
  await runOnSignOutHooks();
}

async function forgetSessions(): Promise<void> {
  // The sign-out cleanup already ran: only the stored sessions are left to remove.
  const slots = createDevSlots(SecureStore, () => Promise.resolve());
  await slots.clear();
  await slots.switchTo(null);
  await secureActionKeyStorage.remove();
}

async function cancelNotificationsAndAlarms(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  await Notifications.dismissAllNotificationsAsync();
  await Notifications.setBadgeCountAsync(0);
  const alarms = getAlarmPort();
  if (alarms === null) return;
  for (const alarm of await alarms.list()) await alarms.cancel(alarm.leaveById);
}

function deleteFiles(target: FileTarget): Promise<void> {
  const root = target.root === 'document' ? Paths.document : Paths.cache;
  if (target.match === 'directory') {
    const directory = new Directory(root, target.name);
    if (directory.exists) directory.delete();
    return Promise.resolve();
  }
  for (const entry of new Directory(root).list()) {
    if (entry.name.startsWith(target.name)) entry.delete();
  }
  return Promise.resolve();
}

/** Restarts the JS: the app comes up at the splash as a first launch. */
async function reload(): Promise<void> {
  if (__DEV__) {
    DevSettings.reload();
    return;
  }
  await Updates.reloadAsync();
}

const devicePorts: StartFreshPorts = {
  eraseAccount: eraseThisAccount,
  signOut: signOutHere,
  forgetSessions,
  deleteSecureItem: (item) => SecureStore.deleteItemAsync(item.key),
  cancelNotificationsAndAlarms,
  deleteFiles,
  openStore: (id) => (id === null ? createMMKV() : createMMKV({ id })),
  reload,
};

const COPY = {
  en: {
    title: 'Start fresh?',
    lines: [
      'This phone forgets the account: the session, trips, crews, chat, drafts, settings, saved files, reminders and alarms.',
      'The account is erased on the server: its phone number, Google and Apple sign-ins are free again.',
      'Crews and trips you share stay with the others. Ones only you were in stay on the server, out of reach.',
      'The app restarts at the welcome screen as a brand-new person. Permissions and Live Activity tokens stay with the phone.',
    ],
    confirm: 'Start fresh',
    stays: {
      unavailable: 'This server cannot erase accounts yet',
      signed_out: 'This phone has no valid session to erase the account with',
    },
    staysLines: [
      'Your old account stays on the server until account deletion ships.',
      'Signing in with the same phone number, Google or Apple account would bring it back.',
      'This phone still forgets everything and restarts as a brand-new person.',
    ],
    anyway: 'Start fresh anyway',
    busy: 'Clearing this phone…',
    serverFailed: 'The server did not erase the account, so nothing on this phone was changed.',
    incomplete: 'Some of this phone could not be cleared. Try again.',
    restartFailed: 'This phone is cleared. Close the app and open it again.',
  },
  vi: {
    title: 'Bắt đầu lại từ đầu?',
    lines: [
      'Điện thoại này quên tài khoản: phiên đăng nhập, chuyến đi, nhóm, tin nhắn, bản nháp, cài đặt, tệp đã lưu, lời nhắc và báo thức.',
      'Tài khoản bị xoá trên máy chủ: số điện thoại, đăng nhập Google và Apple dùng lại được.',
      'Nhóm và chuyến đi chung vẫn còn cho những người khác. Nhóm và chuyến đi chỉ có mình bạn vẫn nằm trên máy chủ nhưng không ai vào được.',
      'Ứng dụng khởi động lại ở màn hình chào như một người hoàn toàn mới. Các quyền đã cấp và mã Live Activity vẫn ở lại với điện thoại.',
    ],
    confirm: 'Bắt đầu lại',
    stays: {
      unavailable: 'Máy chủ này chưa xoá được tài khoản',
      signed_out: 'Điện thoại này không còn phiên đăng nhập hợp lệ để xoá tài khoản',
    },
    staysLines: [
      'Tài khoản cũ vẫn nằm trên máy chủ cho đến khi có tính năng xoá tài khoản.',
      'Đăng nhập lại bằng cùng số điện thoại, Google hoặc Apple sẽ đưa tài khoản cũ trở lại.',
      'Điện thoại này vẫn quên mọi thứ và khởi động lại như một người hoàn toàn mới.',
    ],
    anyway: 'Vẫn bắt đầu lại',
    busy: 'Đang xoá dữ liệu trên điện thoại…',
    serverFailed: 'Máy chủ chưa xoá được tài khoản nên điện thoại này chưa bị thay đổi gì.',
    incomplete: 'Một phần dữ liệu trên điện thoại chưa xoá được. Hãy thử lại.',
    restartFailed: 'Điện thoại đã được xoá sạch. Hãy đóng ứng dụng rồi mở lại.',
  },
} as const;

type Problem = { readonly headline: string; readonly details: readonly string[] };
type Stays = 'unavailable' | 'signed_out';

/**
 * Start fresh (Developer tools): a confirm sheet over the list. Confirming erases the account on
 * the server, clears what it left on this phone (lib/dev-tools/start-fresh.ts lists every store)
 * and restarts the app as a first launch. When the server cannot erase the account nothing is
 * touched yet: the sheet says the account would stay and asks again.
 */
export default function DevStartFreshSheet() {
  const styles = useStyles();
  const theme = useTheme();
  const copy = COPY[useLocale().startsWith('vi') ? 'vi' : 'en'];
  const [busy, setBusy] = useState(false);
  const [stays, setStays] = useState<Stays | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);

  const run = async (leaveAccountOnServer: boolean) => {
    setBusy(true);
    setProblem(null);
    const result = await startFresh(devicePorts, { leaveAccountOnServer });
    if (result.kind === 'restarting') return;
    if (result.kind === 'account_would_stay') setStays(result.why);
    else if (result.kind === 'server_failed') {
      setProblem({ headline: copy.serverFailed, details: [result.message] });
    } else if (result.kind === 'restart_failed') {
      setProblem({ headline: copy.restartFailed, details: [result.message] });
    } else setProblem({ headline: copy.incomplete, details: result.failed });
    setBusy(false);
  };

  return (
    <Sheet detents={['fit']} accessibilityLabel={copy.title} testID="dev-start-fresh">
      <View style={styles.body}>
        {busy ? (
          <Text variant="body" testID="dev-start-fresh-busy">
            {copy.busy}
          </Text>
        ) : stays === null ? (
          <ConfirmSheet
            title={copy.title}
            consequences={copy.lines}
            confirmLabel={copy.confirm}
            onConfirm={() => void run(false)}
            onCancel={() => router.back()}
            testID="dev-start-fresh-confirm"
          />
        ) : (
          <ConfirmSheet
            title={copy.stays[stays]}
            consequences={copy.staysLines}
            confirmLabel={copy.anyway}
            onConfirm={() => void run(true)}
            onCancel={() => router.back()}
            testID="dev-start-fresh-account-stays"
          />
        )}
        {problem === null ? null : (
          <Stack gap="4" testID="dev-start-fresh-failed">
            <Text color={theme.semantic.state.urgent}>{problem.headline}</Text>
            {problem.details.map((line) => (
              <SecondaryText key={line} variant="caption">
                {line}
              </SecondaryText>
            ))}
          </Stack>
        )}
      </View>
    </Sheet>
  );
}

const useStyles = makeStyles((t) => ({
  body: { padding: t.space['16'], gap: t.space['16'] },
}));
