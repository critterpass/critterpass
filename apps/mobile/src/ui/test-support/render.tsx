import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render } from '@testing-library/react-native';
import type { RenderResult } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

export interface RenderUiOptions {
  readonly locale?: string;
}

/**
 * Renders a component-library element the way the app root does: inside the Lingui provider (with
 * `locale` activated, source-language messages) and a `GestureHandlerRootView`, which every
 * `GestureDetector`-based control requires. `rerender` keeps the same wrappers.
 */
export async function renderUi(
  ui: ReactElement,
  { locale = 'en' }: RenderUiOptions = {},
): Promise<RenderResult> {
  i18n.loadAndActivate({ locale, messages: {} });
  const wrap = (node: ReactElement) => (
    <I18nProvider i18n={i18n}>
      <GestureHandlerRootView>{node}</GestureHandlerRootView>
    </I18nProvider>
  );
  const result = await render(wrap(ui));
  return { ...result, rerender: (next: ReactElement) => result.rerender(wrap(next)) };
}
