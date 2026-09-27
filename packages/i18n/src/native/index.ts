export type { NativeMessage, NativeSegment, PlainNativeMessage, PluralNativeMessage } from './message-shape.js';
export { UnsupportedNativeMessageError, argOrderOf, parseForNative } from './message-shape.js';
export type { XcstringsOptions } from './xcstrings.js';
export { generateXcstrings } from './xcstrings.js';
export type { StringsXmlOptions } from './strings-xml.js';
export { androidLocaleQualifier, generateStringsXml } from './strings-xml.js';
export { cfBundleLocalizations, generateAndroidLocalesConfig } from './locales-config.js';
