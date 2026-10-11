/** What each report reason reads as, for every view of the report choice. */
import type { ReportReason } from '@cp/domain';
import { t } from '@lingui/core/macro';

export function reasonLabel(reason: ReportReason): string {
  switch (reason) {
    case 'spam':
      return t({ id: 'chat.report.spam', message: 'Spam' });
    case 'harassment':
      return t({ id: 'chat.report.harassment', message: 'Bullying or harassment' });
    case 'hate':
      return t({ id: 'chat.report.hate', message: 'Hate' });
    case 'sexual':
      return t({ id: 'chat.report.sexual', message: 'Sexual content' });
    case 'violence':
      return t({ id: 'chat.report.violence', message: 'Violence or threats' });
    case 'impersonation':
      return t({ id: 'chat.report.impersonation', message: 'Pretending to be someone' });
    case 'personal_info':
      return t({ id: 'chat.report.personalInfo', message: 'Sharing private information' });
    case 'other':
      return t({ id: 'chat.report.other', message: 'Something else' });
  }
}
