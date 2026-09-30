/**
 * Change review pushes, in the guide's voice: an affected member's yes is needed (with Approve and
 * Reject right on the notification), and how the vote came out. Templates carry a catalog id and
 * the source message; the worker renders them in each recipient's language.
 */
export interface PlanCopy {
  readonly id: string;
  readonly message: string;
}

export const CHANGESET_NEEDS_YES_TITLE: PlanCopy = /*i18n*/ {
  id: 'notifications.changeset.needs_yes.title',
  message: '{asker} wants to change the plan',
};

export const CHANGESET_NEEDS_YES_BODY: PlanCopy = /*i18n*/ {
  id: 'notifications.changeset.needs_yes.body',
  message: '{count, plural, one {# change} other {# changes}} for {crew}. Approve or reject?',
};

export const CHANGESET_APPLIED_TITLE: PlanCopy = /*i18n*/ {
  id: 'notifications.changeset.applied.title',
  message: 'The plan changed',
};

export const CHANGESET_APPLIED_BODY: PlanCopy = /*i18n*/ {
  id: 'notifications.changeset.applied.body',
  message: '{crew} said yes, so I updated the plan.',
};

export const CHANGESET_KEPT_TITLE: PlanCopy = /*i18n*/ {
  id: 'notifications.changeset.kept.title',
  message: 'The plan stays as it was',
};

export const CHANGESET_KEPT_BODY: PlanCopy = /*i18n*/ {
  id: 'notifications.changeset.kept.body',
  message: 'Not enough yeses from {crew}, so nothing changed.',
};
