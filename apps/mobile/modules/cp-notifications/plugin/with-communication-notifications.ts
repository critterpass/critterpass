/**
 * Lets the iOS Notification Service Extension present crew and guide pushes as Communication
 * Notifications (docs/api-contracts-async.md §3.1): the app declares the communication
 * notifications capability and that it handles `INSendMessageIntent` activities. Without both the
 * system ignores the donated intent and the extension falls back to a plain alert with an avatar
 * attachment.
 */
import { withEntitlementsPlist, withInfoPlist, type ConfigPlugin } from 'expo/config-plugins';

export const COMMUNICATION_ENTITLEMENT = 'com.apple.developer.usernotifications.communication';
export const SEND_MESSAGE_ACTIVITY_TYPE = 'INSendMessageIntent';

export function withCommunicationEntitlement<T extends object>(entitlements: T): T {
  return { ...entitlements, [COMMUNICATION_ENTITLEMENT]: true };
}

export function withSendMessageActivityType<T extends object>(infoPlist: T): T {
  const existing: unknown = (infoPlist as { NSUserActivityTypes?: unknown }).NSUserActivityTypes;
  const current = Array.isArray(existing)
    ? existing.filter((entry): entry is string => typeof entry === 'string')
    : [];
  return {
    ...infoPlist,
    NSUserActivityTypes: [...new Set([...current, SEND_MESSAGE_ACTIVITY_TYPE])],
  };
}

const withCommunicationNotifications: ConfigPlugin = (config) => {
  const withEntitlement = withEntitlementsPlist(config, (mod) => {
    mod.modResults = withCommunicationEntitlement(mod.modResults);
    return mod;
  });
  return withInfoPlist(withEntitlement, (mod) => {
    mod.modResults = withSendMessageActivityType(mod.modResults);
    return mod;
  });
};

// Expo resolves a string-referenced config plugin through the module's default export.
// eslint-disable-next-line no-restricted-syntax -- config plugin entry, like a tool config
export default withCommunicationNotifications;
