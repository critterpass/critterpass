/**
 * The premium design tokens the native surfaces compile: packages/design-tokens emits them
 * (git-ignored `generated/`), and the extension targets and Android modules build without running
 * that codegen, so a copy is committed where each one compiles. The test beside this file fails
 * when a copy drifts from the tokens; this script rewrites them:
 *   pnpm --filter @cp/mobile exec tsx plugins/premium-native-tokens.ts --write
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { emitPremiumKotlin } from '../../../packages/design-tokens/codegen/premium-kotlin';
import { emitPremiumSwift } from '../../../packages/design-tokens/codegen/premium-swift';
import { premium } from '../../../packages/design-tokens/src/premium';

const APP_ROOT = join(__dirname, '..');
const KOTLIN_PACKAGE = 'package app.critterpass.designtokens';

export interface TokenCopy {
  /** Relative to apps/mobile. */
  readonly path: string;
  readonly source: string;
}

/** Every committed copy and what it must hold. */
export function premiumTokenCopies(): TokenCopy[] {
  const kotlin = emitPremiumKotlin(premium);
  if (!kotlin.includes(KOTLIN_PACKAGE)) throw new Error('premium Kotlin tokens changed package');
  return [
    // `_shared` compiles into every Apple target (widgets, notification extensions, App Clip).
    { path: 'targets/_shared/Tokens/CPPremium.swift', source: emitPremiumSwift(premium) },
    // One Android copy: the surfaces and the alarm modules reach it through cp-notifications.
    {
      path: 'modules/cp-notifications/android/src/main/java/app/critterpass/notifications/tokens/CpPremium.kt',
      source: kotlin.replace(KOTLIN_PACKAGE, 'package app.critterpass.notifications.tokens'),
    },
  ];
}

export function readCopy(copy: TokenCopy): string {
  return readFileSync(join(APP_ROOT, copy.path), 'utf8');
}

if (process.argv.includes('--write')) {
  for (const copy of premiumTokenCopies()) {
    writeFileSync(join(APP_ROOT, copy.path), copy.source);
    console.log(`wrote ${copy.path}`);
  }
}
