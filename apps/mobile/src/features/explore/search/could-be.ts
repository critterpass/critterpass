import { t } from '@lingui/core/macro';

export function couldBe(count: number, area: string | null): string {
  return area === null
    ? t({ id: 'search.link.couldBe', message: `Could be one of ${count} places` })
    : t({ id: 'search.link.couldBeNear', message: `Could be one of ${count} places near ${area}` });
}
