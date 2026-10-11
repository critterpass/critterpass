import type { Href } from 'expo-router';

/**
 * Marks the guide sheet as opened from the circle (`from=circle`): the guide screen then shows its
 * grabber and ✕, as a sheet over the tabs rather than a page pushed from elsewhere.
 */
export function fromGuideCircle(href: Href): Href {
  if (typeof href === 'string') {
    // eslint-disable-next-line lingui/no-unlocalized-strings -- a URL query, not copy
    return `${href}${href.includes('?') ? '&' : '?'}from=circle` as Href;
  }
  return { ...href, params: { ...href.params, from: 'circle' } } as Href;
}
