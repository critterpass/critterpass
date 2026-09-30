/**
 * Lab scenes for my own plan on the overview (3e-1 with "just you" days) and a clash with the
 * crew plan, over the Bali week and Winston's personal ops.
 */
import type { ReactNode } from 'react';

import {
  BALI_DAYS,
  BALI_ITEMS,
  BALI_POLLS,
  BALI_WEATHER,
  WINSTON,
} from '../../overview/dev/bali-plan';
import { overviewProps } from '../../overview/dev/overview-scenes';
import { buildDayCards } from '../../overview/model/plan-model';
import { PlanOverviewView } from '../../overview/plan-overview-view';
import { ClashList } from '../clash-card';
import { personalPlan } from '../model/personal-plan';
import { PERSONAL_POI_NAMES, PERSONAL_ROWS } from './personal-ops';

function JustYou({ clashes }: { readonly clashes: boolean }) {
  const plan = personalPlan({
    days: BALI_DAYS,
    items: BALI_ITEMS,
    rows: PERSONAL_ROWS,
    uid: WINSTON,
    poiNames: PERSONAL_POI_NAMES,
  });
  const cards = buildDayCards({
    days: BALI_DAYS,
    items: plan.items,
    polls: BALI_POLLS,
    weather: BALI_WEATHER,
    today: null,
  });
  return (
    <PlanOverviewView
      {...overviewProps({
        cards,
        footer: clashes ? <ClashList clashes={plan.clashes} onResolve={() => undefined} /> : null,
      })}
    />
  );
}

export const OVERLAY_SCENES: Readonly<Record<string, () => ReactNode>> = {
  'overview-just-you': () => <JustYou clashes={false} />,
  'overview-clash': () => <JustYou clashes />,
};
