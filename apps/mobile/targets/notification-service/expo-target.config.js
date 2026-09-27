/** @type {import('@bacons/apple-targets').Config} */
module.exports = {
  type: 'notification-service',
  name: 'CritterpassNotificationService',
  deploymentTarget: '26.0',
  frameworks: ['Intents'],
  entitlements: {
    'com.apple.security.application-groups': ['group.app.critterpass'],
  },
};
