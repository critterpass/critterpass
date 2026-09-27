import { i18n } from '@lingui/core';
import type { Messages } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render } from '@testing-library/react-native';
import type { RenderResult } from '@testing-library/react-native';
import type { ReactElement } from 'react';

export interface RenderWithI18nOptions {
  readonly locale?: string;
  readonly messages?: Messages;
}

/**
 * Activates a locale on the shared `i18n` singleton and renders `ui` inside an `I18nProvider`, for
 * component tests that use `<Trans>`/`useLingui()` — both throw when rendered without a provider,
 * and `i18n._`/the `t` macro throw when no locale has been activated at all.
 */
export async function renderWithI18n(
  ui: ReactElement,
  { locale = 'en', messages = {} }: RenderWithI18nOptions = {},
): Promise<RenderResult> {
  i18n.loadAndActivate({ locale, messages });
  return render(<I18nProvider i18n={i18n}>{ui}</I18nProvider>);
}
