/** @type {import('@bacons/apple-targets').Config} */
module.exports = {
  type: 'notification-content',
  name: 'CritterpassNotificationContent',
  deploymentTarget: '26.0',
  entitlements: {
    'com.apple.security.application-groups': ['group.app.critterpass'],
    'keychain-access-groups': ['$(AppIdentifierPrefix)app.critterpass.shared'],
  },
};
