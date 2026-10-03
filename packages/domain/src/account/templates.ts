/**
 * Account copy the worker renders into pushes and emails (catalog id + source message; rendered
 * in each recipient's language).
 */
export const ACCOUNT_PUSH = {
  exportReadyTitle: /*i18n*/ {
    id: 'notifications.account.export_ready_title',
    message: 'Your data is ready',
  },
  exportReadyBody: /*i18n*/ {
    id: 'notifications.account.export_ready_body',
    message:
      'Your CritterPass export is ready to download for 7 days. Open Settings › Download my data.',
  },
} as const;
