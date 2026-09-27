/** @type {import('@bacons/apple-targets').Config} */
module.exports = {
  type: 'notification-service',
  name: 'CritterpassNotificationService',
  deploymentTarget: '26.0',
  frameworks: ['Intents'],
  entitlements: {
    'com.apple.security.application-groups': ['group.app.critterpass'],
    // Reads the device action key (`read_notification`) for minimal-payload pushes.
    'keychain-access-groups': ['$(AppIdentifierPrefix)app.critterpass.shared'],
  },
};
