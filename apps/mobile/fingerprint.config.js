// Expo's fingerprint loads this file with Node's CommonJS loader, so it uses require()/module.exports
// regardless of the repo's ESM convention (same as metro.config.js).
const { readFileSync } = require('node:fs');
const path = require('node:path');

// op-sqlite's podspec resolves its real path inside the pnpm store and walks up to the first
// package.json it finds, which is the workspace root's, not this app's. The root's `op-sqlite`
// block is what turns SQLCipher on for iOS, so it has to count as native source: a change to it
// needs a new build, never an update onto an old one.
const rootPackage = JSON.parse(readFileSync(path.join(__dirname, '../../package.json'), 'utf8'));

// The workspace patch to op-sqlite's podspec (SQLCipher on CommonCrypto instead of OpenSSL) lives
// outside node_modules' hashed sources, so it is counted here: editing it needs a new build.
const opSqlitePatch = readFileSync(
  path.join(__dirname, '../../patches/@op-engineering__op-sqlite.patch'),
  'utf8',
);

/** @type {import('expo/fingerprint').Config} */
const config = {
  extraSources: [
    {
      type: 'contents',
      id: 'op-sqlite-ios-config',
      contents: JSON.stringify(rootPackage['op-sqlite'] ?? null),
      reasons: ['op-sqlite iOS build flags'],
    },
    {
      type: 'contents',
      id: 'op-sqlite-podspec-patch',
      contents: opSqlitePatch,
      reasons: ['op-sqlite podspec patch'],
    },
  ],
};

module.exports = config;
