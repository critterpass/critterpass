/**
 * The push for a message to a place that waits for the traveller's yes (`cp.vendor`): the exact
 * text, so APPROVE on the notification approves what was read. The worker renders it in each
 * recipient's language; on a hidden lock screen a sibling without the place or the text is shown.
 */
export const VENDOR_PUSH = {
  draftTitle: /*i18n*/ {
    id: 'notifications.vendor.draft_ready_title',
    message: 'Draft ready — send?',
  },
  draftBody: /*i18n*/ {
    id: 'notifications.vendor.draft_ready_body',
    message: '{vendor}: “{text}”',
  },
} as const;
