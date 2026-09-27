/** @type {import('@bacons/apple-targets').Config} */
module.exports = {
  type: 'widget',
  name: 'CritterpassWidgets',
  deploymentTarget: '26.0',
  frameworks: ['AlarmKit'],
  entitlements: {
    'com.apple.security.application-groups': ['group.app.critterpass'],
    'keychain-access-groups': ['$(AppIdentifierPrefix)app.critterpass.shared'],
  },
};
