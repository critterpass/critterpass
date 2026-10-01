import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { getAlarmPort } from '../../../modules/cp-alarm';

import { resolveApiBaseUrl } from '@/data/places/apiBaseUrl';
import { eraseAccount } from '@/lib/dev-tools/erase-account';
import { deviceWipePorts, provideAlarmCanceller } from '@/features/you/account/device-wipe';
import { startFresh, type EraseOutcome, type StartFreshPorts } from '@/lib/dev-tools/start-fresh';
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

// The same wiring signing out and deleting an account use, so the three never clear different things.
provideAlarmCanceller(getAlarmPort());
const devicePorts: StartFreshPorts = { ...deviceWipePorts, eraseAccount: eraseThisAccount };

const COPY = {
  en: {
    title: 'Start fresh?',
    lines: [
      'This phone forgets the account: the session, trips, crews, chat, drafts, settings, saved files, reminders and alarms.',
      'The account is erased on the server: its phone number, Google and Apple sign-ins are free again.',
      'Crews and trips you share stay with the others. Ones only you were in stay on the server, out of reach.',
      'The app restarts at the welcome screen as a brand-new person. Permissions and Live Activity tokens stay with the phone; widgets catch up after you set up again.',
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
      'Ứng dụng khởi động lại ở màn hình chào như một người hoàn toàn mới. Các quyền đã cấp và mã Live Activity vẫn ở lại với điện thoại; tiện ích màn hình sẽ cập nhật sau khi bạn thiết lập lại.',
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
