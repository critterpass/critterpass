/**
 * The Google credentials app.config.ts embeds come only from EAS environment variables; a build
 * without them (local dev, CI) must still resolve, just without the Google URL scheme or
 * Firebase file.
 */
import { afterEach, describe, expect, it } from '@jest/globals';
import type { ConfigContext } from 'expo/config';

import appConfig, {
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

function resolve() {
  return appConfig({ config: {} } as ConfigContext);
}

function googlePlugin(plugins: unknown[] | undefined) {
  return plugins?.find((entry) => Array.isArray(entry) && entry[0] === GOOGLE_SIGN_IN);
}

afterEach(() => {
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
    process.env['GOOGLE_SERVICES_JSON'] = '/home/expo/workingdir/google-services.json';
    expect(resolve().android?.googleServicesFile).toBe(
      '/home/expo/workingdir/google-services.json',
    );
  });

  it('leaves googleServicesFile unset when the file variable is absent or blank', () => {
    delete process.env['GOOGLE_SERVICES_JSON'];
    expect(resolve().android).not.toHaveProperty('googleServicesFile');
    expect(androidGoogleServices({ GOOGLE_SERVICES_JSON: '' })).toEqual({});
  });
});
