/**
 * Sets a boolean (a `<meta-data android:value>` or an element attribute) in a compiled (binary XML)
 * AndroidManifest.xml, in place: same size, no resource recompilation, no apktool.
 *
 *   tsx tools/scripts/ci-device/android-manifest.ts <AndroidManifest.xml> meta-data:<name> <true|false>
 *   tsx tools/scripts/ci-device/android-manifest.ts <AndroidManifest.xml> <element>@<attribute> <true|false>
 *
 * CI uses it to set `expo.modules.updates.ENABLED` to false in a copy of the e2e-test APK, so the app
 * launches the JS swapped into the APK instead of whatever was last published to the e2e-test
 * update channel, and `application@extractNativeLibs` to true, so the installer extracts the
 * arm64-only native libraries where ARM translation on an x86_64 emulator can load them.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const RES_XML_TYPE = 0x0003;
const RES_STRING_POOL_TYPE = 0x0001;
const RES_XML_START_ELEMENT_TYPE = 0x0102;
const UTF8_FLAG = 1 << 8;
const TYPE_STRING = 0x03;
const TYPE_INT_BOOLEAN = 0x12;
const NO_ENTRY = 0xffffffff;

/** Decodes every string of a ResStringPool chunk starting at `start`. */
function readStringPool(buf: Buffer, start: number): string[] {
  const count = buf.readUInt32LE(start + 8);
  const utf8 = (buf.readUInt32LE(start + 16) & UTF8_FLAG) !== 0;
  const stringsStart = start + buf.readUInt32LE(start + 20);
  const headerSize = buf.readUInt16LE(start + 2);
  const strings: string[] = [];
  for (let i = 0; i < count; i++) {
    let at = stringsStart + buf.readUInt32LE(start + headerSize + i * 4);
    if (utf8) {
      // Two lengths (UTF-16 units, then bytes), each one byte or two with the high bit set.
      at += (buf[at] ?? 0) & 0x80 ? 2 : 1;
      const high = buf[at] ?? 0;
      const bytes = high & 0x80 ? ((high & 0x7f) << 8) | (buf[at + 1] ?? 0) : high;
      at += high & 0x80 ? 2 : 1;
      strings.push(buf.toString('utf8', at, at + bytes));
    } else {
      let units = buf.readUInt16LE(at);
      at += 2;
      if (units & 0x8000) {
        units = ((units & 0x7fff) << 16) | buf.readUInt16LE(at);
        at += 2;
      }
      strings.push(buf.toString('utf16le', at, at + units * 2));
    }
  }
  return strings;
}

interface Attribute {
  readonly offset: number;
  readonly name: string;
  readonly raw: string | undefined;
  readonly dataType: number;
}

function readAttributes(buf: Buffer, chunk: number, strings: string[]): Attribute[] {
  const ext = chunk + buf.readUInt16LE(chunk + 2);
  const attrStart = buf.readUInt16LE(ext + 8);
  const attrSize = buf.readUInt16LE(ext + 10);
  const count = buf.readUInt16LE(ext + 12);
  return Array.from({ length: count }, (_, i) => {
    const offset = ext + attrStart + i * attrSize;
    const raw = buf.readUInt32LE(offset + 8);
    return {
      offset,
      name: strings[buf.readUInt32LE(offset + 4)] ?? '',
      raw: raw === NO_ENTRY ? undefined : strings[raw],
      dataType: buf[offset + 15] ?? 0,
    };
  });
}

/**
 * Which boolean to change: `{ metaData: name }` for `<meta-data android:name=name android:value=…>`,
 * or `{ element, attribute }` for an attribute such as `<application android:extractNativeLibs>`.
 */
export type BooleanTarget =
  { readonly metaData: string } | { readonly element: string; readonly attribute: string };

function describe(target: BooleanTarget): string {
  return 'metaData' in target
    ? `<meta-data android:name="${target.metaData}">`
    : `<${target.element} android:${target.attribute}>`;
}

/** The attribute holding the target's value, or undefined when the manifest has none. */
function findSlot(buf: Buffer, target: BooleanTarget): Attribute | undefined {
  if (buf.readUInt16LE(0) !== RES_XML_TYPE) throw new Error('Not a compiled Android XML file');
  const element = 'metaData' in target ? 'meta-data' : target.element;
  let strings: string[] = [];
  for (let at = buf.readUInt16LE(2); at < buf.length; at += buf.readUInt32LE(at + 4)) {
    const type = buf.readUInt16LE(at);
    if (type === RES_STRING_POOL_TYPE) strings = readStringPool(buf, at);
    if (type !== RES_XML_START_ELEMENT_TYPE) continue;
    const ext = at + buf.readUInt16LE(at + 2);
    if (strings[buf.readUInt32LE(ext + 4)] !== element) continue;
    const attrs = readAttributes(buf, at, strings);
    if (!('metaData' in target)) return attrs.find((attr) => attr.name === target.attribute);
    if (!attrs.some((attr) => attr.name === 'name' && attr.raw === target.metaData)) continue;
    return attrs.find((attr) => attr.name === 'value');
  }
  return undefined;
}

/** A copy of `manifest` with the target boolean set to `value`. Throws when it is absent. */
export function setManifestBoolean(
  manifest: Buffer,
  target: BooleanTarget,
  value: boolean,
): Buffer {
  const buf = Buffer.from(manifest);
  const slot = findSlot(buf, target);
  if (!slot) throw new Error(`No ${describe(target)} value in the manifest`);
  if (slot.dataType !== TYPE_INT_BOOLEAN && slot.dataType !== TYPE_STRING) {
    throw new Error(`${describe(target)} is not a boolean (type 0x${slot.dataType.toString(16)})`);
  }
  buf.writeUInt32LE(NO_ENTRY, slot.offset + 8);
  buf.writeUInt16LE(8, slot.offset + 12);
  buf[slot.offset + 14] = 0;
  buf[slot.offset + 15] = TYPE_INT_BOOLEAN;
  buf.writeUInt32LE(value ? 0xffffffff : 0, slot.offset + 16);
  return buf;
}

/** The target's boolean value, or undefined when absent or not a boolean. */
export function readManifestBoolean(manifest: Buffer, target: BooleanTarget): boolean | undefined {
  const slot = findSlot(manifest, target);
  if (slot?.dataType !== TYPE_INT_BOOLEAN) return undefined;
  return manifest.readUInt32LE(slot.offset + 16) !== 0;
}

/** `meta-data:<name>` or `<element>@<attribute>` (e.g. `application@extractNativeLibs`). */
export function parseTarget(spec: string): BooleanTarget | undefined {
  if (spec.startsWith('meta-data:')) return { metaData: spec.slice('meta-data:'.length) };
  const [element, attribute, ...rest] = spec.split('@');
  return element && attribute && rest.length === 0 ? { element, attribute } : undefined;
}

function main(): void {
  const [file, spec = '', value] = process.argv.slice(2).filter((arg) => arg !== '--');
  const target = parseTarget(spec);
  if (!file || !target || (value !== 'true' && value !== 'false')) {
    console.error(
      'Usage: android-manifest <AndroidManifest.xml> <meta-data:NAME | element@attribute> <true|false>',
    );
    process.exitCode = 1;
    return;
  }
  const patched = setManifestBoolean(readFileSync(file), target, value === 'true');
  writeFileSync(file, patched);
  console.log(`${spec} = ${String(readManifestBoolean(patched, target))}`);
}

const isMainModule = import.meta.url === `file://${process.argv[1] ?? ''}`;
if (isMainModule) main();
