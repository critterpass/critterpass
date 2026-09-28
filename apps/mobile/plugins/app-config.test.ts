/**
 * The Google credentials app.config.ts embeds come from EAS environment variables, with a local
 * git-ignored Firebase file as the fallback; a build without them (local dev, CI) must still
 * resolve, just without the Google URL scheme or Firebase file.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import type { ConfigContext } from 'expo/config';

import appConfig, {
  LOCAL_GOOGLE_SERVICES_FILE,
  androidGoogleServices,
  googleIosUrlScheme,
  googleSignInPlugins,
} from '../app.config';

const GOOGLE_SIGN_IN = '@react-native-google-signin/google-signin';
const IOS_CLIENT_ID = '963482787869-abc123def.apps.googleusercontent.com';
const saved = {
  ios: process.env['EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID'],
  file: process.env['GOOGLE_SERVICES_JSON'],
};

function restore(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

let projectRoot = '';
let easDir = '';

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), 'cp-app-config-'));
  easDir = mkdtempSync(join(tmpdir(), 'cp-eas-secrets-'));
});

function resolve() {
  return appConfig({ config: {}, projectRoot } as ConfigContext);
}

function writeFirebaseFile(path: string): string {
  writeFileSync(path, '{"project_info":{}}');
  return path;
}

function googlePlugin(plugins: unknown[] | undefined) {
  return plugins?.find((entry) => Array.isArray(entry) && entry[0] === GOOGLE_SIGN_IN);
}

afterEach(() => {
  rmSync(projectRoot, { recursive: true, force: true });
  rmSync(easDir, { recursive: true, force: true });
  restore('EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID', saved.ios);
  restore('GOOGLE_SERVICES_JSON', saved.file);
});

describe('Google credentials in the app config', () => {
  it('reverses the iOS client id into the URL scheme Google Sign-In calls back on', () => {
    expect(googleIosUrlScheme(IOS_CLIENT_ID)).toBe(
      'com.googleusercontent.apps.963482787869-abc123def',
    );
    expect(() => googleIosUrlScheme('963482787869-abc123def')).toThrow(
      /EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID/,
    );
  });

  it('adds the Google Sign-In plugin with the URL scheme when the iOS client id is set', () => {
    process.env['EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID'] = IOS_CLIENT_ID;
    expect(googlePlugin(resolve().plugins)).toEqual([
      GOOGLE_SIGN_IN,
      { iosUrlScheme: 'com.googleusercontent.apps.963482787869-abc123def' },
    ]);
  });

  it('builds without the Google Sign-In plugin when the iOS client id is absent or blank', () => {
    delete process.env['EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID'];
    expect(googlePlugin(resolve().plugins)).toBeUndefined();
    expect(googleSignInPlugins({ EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: '  ' })).toEqual([]);
  });

  it('points Android at the google-services.json EAS wrote when the file variable is set', () => {
    const easFile = writeFirebaseFile(join(easDir, 'secret'));
    writeFirebaseFile(join(projectRoot, LOCAL_GOOGLE_SERVICES_FILE));
    process.env['GOOGLE_SERVICES_JSON'] = easFile;
    expect(resolve().android?.googleServicesFile).toBe(easFile);
  });

  it('falls back to the local google-services.json so a Mac computes the same fingerprint', () => {
    delete process.env['GOOGLE_SERVICES_JSON'];
    writeFirebaseFile(join(projectRoot, LOCAL_GOOGLE_SERVICES_FILE));
    expect(resolve().android?.googleServicesFile).toBe('./google-services.json');

    process.env['GOOGLE_SERVICES_JSON'] = join(easDir, 'missing');
    expect(resolve().android?.googleServicesFile).toBe('./google-services.json');
  });

  it('leaves googleServicesFile unset when neither file exists', () => {
    delete process.env['GOOGLE_SERVICES_JSON'];
    expect(resolve().android).not.toHaveProperty('googleServicesFile');
    process.env['GOOGLE_SERVICES_JSON'] = join(easDir, 'missing');
    expect(resolve().android).not.toHaveProperty('googleServicesFile');
    expect(androidGoogleServices({ GOOGLE_SERVICES_JSON: '' }, projectRoot)).toEqual({});
  });
});
