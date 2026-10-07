/**
 * The purge reminder e-mail: short, plain, in the account's language (English unless the account
 * reads Vietnamese). It says when the account goes and how to keep it, and nothing else.
 */
export interface ReminderCopy {
  readonly subject: string;
  readonly text: string;
}

type CopyLocale = 'en' | 'vi';

const COPY: Readonly<Record<CopyLocale, (date: string) => ReminderCopy>> = {
  en: (date) => ({
    subject: `Your CritterPass account will be deleted on ${date}`,
    text: [
      'Hi,',
      `You asked us to delete your CritterPass account. It will be deleted for good on ${date}.`,
      'If you changed your mind, open CritterPass and sign in before then to keep your account. If you still want it deleted, you don’t need to do anything.',
      'CritterPass',
    ].join('\n\n'),
  }),
  vi: (date) => ({
    subject: `Tài khoản CritterPass của bạn sẽ bị xoá vào ${date}`,
    text: [
      'Chào bạn,',
      `Bạn đã yêu cầu xoá tài khoản CritterPass. Tài khoản sẽ bị xoá vĩnh viễn vào ${date}.`,
      'Nếu bạn đổi ý, hãy mở CritterPass và đăng nhập trước ngày đó để giữ lại tài khoản. Nếu bạn vẫn muốn xoá, bạn không cần làm gì thêm.',
      'CritterPass',
    ].join('\n\n'),
  }),
};

const copyLocale = (locale: string | null): CopyLocale =>
  locale?.toLowerCase().startsWith('vi') === true ? 'vi' : 'en';

/** The reminder for an account purged at `purgeAt`, the date written out in the account's language. */
export function purgeReminderCopy(locale: string | null, purgeAt: Date): ReminderCopy {
  const language = copyLocale(locale);
  const date = new Intl.DateTimeFormat(language === 'vi' ? 'vi-VN' : 'en-GB', {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(purgeAt);
  return COPY[language](date);
}
