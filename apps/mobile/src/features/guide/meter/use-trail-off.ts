/** The guide's last line when today's free answers run out, trailing off into the offer. */
import { useLingui } from '@lingui/react/macro';

export function useTrailOff(guideName: string, limit: number): string {
  const { t } = useLingui();
  return limit === 30
    ? t({
        id: 'guide.limit.trailOff30',
        message: `That’s my thirtieth answer today, and the free ones are used up. I’ll be back at midnight, or…`,
      })
    : t({
        id: 'guide.limit.trailOff',
        message: `That’s all my free answers for today. ${guideName} will be back at midnight, or…`,
      });
}
