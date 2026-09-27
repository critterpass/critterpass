/**
 * The CritterPass App Clip (a native SwiftUI target, no React Native): opened from an invite link,
 * it shows the crew ticket and hands the link to the full app through the App Group. Built into
 * development builds only (app.config.ts `APP_CLIP_VARIANTS`); whether invite pages offer it is the
 * server flag `links.app_clip` (docs/decisions/20260928-app-clip-built-behind-a-flag.md).
 *
 * `appclips:` domains mirror plugins/with-links.ts `LINK_HOSTS` (with-links.test.ts pins them).
 */
const LINK_HOSTS = {
  production: ['critterpass.app', 'go.critterpass.app'],
  staging: ['staging.critterpass.app', 'go.staging.critterpass.app'],
  development: ['staging.critterpass.app', 'go.staging.critterpass.app'],
};

function appClipDomains(variant) {
  const mode = variant === 'development' ? '?mode=developer' : '';
  return (LINK_HOSTS[variant] ?? LINK_HOSTS.development).map((host) => `appclips:${host}${mode}`);
}

/** @type {import('@bacons/apple-targets').ConfigFunction} */
module.exports = (config) => ({
  type: 'clip',
  name: 'CritterpassClip',
  displayName: 'CritterPass',
  icon: '../../assets/icon.png',
  deploymentTarget: '26.0',
  // Pure SwiftUI: no JS bundle in the clip.
  exportJs: false,
  frameworks: ['StoreKit'],
  entitlements: {
    'com.apple.security.application-groups': ['group.app.critterpass'],
    'com.apple.developer.associated-domains': appClipDomains(config.extra?.appVariant),
  },
});

module.exports.appClipDomains = appClipDomains;
module.exports.LINK_HOSTS = LINK_HOSTS;
