/* eslint-disable lingui/no-unlocalized-strings -- Maestro flow text for the dev gallery, never rendered. */
import type { StateGroup } from './state-groups';

/** Locales the screenshot sweep captures: English and the densest-diacritic launch locale. */
export const SWEEP_LOCALES = ['en', 'vi'] as const;

const HEADER = `appId: app.critterpass.dev
---`;

const lines = (...rows: readonly string[]) => rows.join('\n');

function openGallery(locale: string): string {
  return lines(
    '- runFlow: ../screens/subflows/open-gallery.yaml',
    '- tapOn:',
    "    id: 'gallery-freeze-on'",
    '- tapOn:',
    `    id: 'gallery-locale-${locale}'`,
  );
}

function waitFor(id: string): string {
  return lines(
    '- extendedWaitUntil:',
    '    visible:',
    `      id: '${id}'`,
    '    timeout: 15000',
    '- waitForAnimationToEnd:',
    '    timeout: 2000',
  );
}

/**
 * `e2e/gallery/sweep.yaml`: one screenshot per gallery component page in every sweep locale, loops
 * frozen at rest. The first page is opened from the index, the rest by the page's Next control, so a
 * locale pass is a single app launch.
 */
export function sweepFlow(components: readonly string[]): string {
  const passes = SWEEP_LOCALES.map((locale) => {
    const [first, ...rest] = components;
    if (first === undefined) return '';
    return lines(
      `# ${locale}`,
      openGallery(locale),
      '- scrollUntilVisible:',
      '    element:',
      `      id: 'gallery-component-${first}'`,
      '    direction: DOWN',
      '    timeout: 90000',
      '- tapOn:',
      `    id: 'gallery-component-${first}'`,
      waitFor(`gallery-detail-${first}`),
      `- takeScreenshot: sweep-${locale}-${first}`,
      ...rest.map((component) =>
        lines(
          '- tapOn:',
          "    id: 'gallery-next'",
          waitFor(`gallery-detail-${component}`),
          `- takeScreenshot: sweep-${locale}-${component}`,
        ),
      ),
    );
  });
  return lines(
    HEADER,
    '# Generated from the gallery registry by src/ui/__tests__/gallery-sweep.test.ts',
    '# (`CP_WRITE_SWEEP=1 pnpm --filter @cp/mobile test -- gallery-sweep`); do not edit by hand.',
    '# Every component page, reached through "Developer tools" (never `openLink`).',
    ...passes,
    '',
  );
}

/** `e2e/gallery/states.yaml`: one screenshot per state of every prototype state group. */
export function statesFlow(groups: readonly StateGroup[]): string {
  const states = groups.flatMap((group) => group.states);
  return lines(
    HEADER,
    '# Generated from src/ui/gallery/state-groups.ts by src/ui/__tests__/gallery-sweep.test.ts',
    '# (`CP_WRITE_SWEEP=1 pnpm --filter @cp/mobile test -- gallery-sweep`); do not edit by hand.',
    openGallery('en'),
    '- scrollUntilVisible:',
    '    element:',
    "      id: 'gallery-states'",
    '    direction: DOWN',
    '    timeout: 20000',
    '- tapOn:',
    "    id: 'gallery-states'",
    waitFor('gallery-states-page'),
    ...states.map((state, index) =>
      lines(
        ...(index === 0 ? [] : ['- tapOn:', "    id: 'state-next'"]),
        waitFor(`state-view-${state.screen}`),
        `- takeScreenshot: state-${state.screen}`,
      ),
    ),
    '',
  );
}
