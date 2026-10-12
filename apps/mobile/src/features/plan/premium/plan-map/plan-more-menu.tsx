/**
 * The plan's ⋯ menu in the map's top bar: Ideas (with how many wait), all days, the plan check,
 * sharing the plan and the trip's settings.
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths, never copy. */
import { router } from 'expo-router';

import { tripPlanRoutes } from '../../hub/routes';
import { planMapCopy } from './copy';
import { GlassMenu } from './glass-menu';

export function PlanMoreMenu(props: {
  readonly tripId: string;
  readonly anchorY: number;
  readonly ideas: number;
  readonly dayNo: number | null;
  readonly onShare: () => void;
  readonly onClose: () => void;
}) {
  const { tripId } = props;
  return (
    <GlassMenu
      anchor={{ x: 16, y: props.anchorY }}
      alignEnd
      onClose={props.onClose}
      accessibilityLabel={planMapCopy.closeMenu()}
      testID="plan-map-menu"
      items={[
        {
          key: 'ideas',
          label: planMapCopy.menu.ideas(props.ideas),
          icon: 'heart',
          onPress: () => router.push({ pathname: '/[tripId]/ideas', params: { tripId } }),
        },
        {
          key: 'days',
          label: planMapCopy.menu.allDays(),
          icon: 'expand',
          onPress: () => router.push(tripPlanRoutes.days(tripId, props.dayNo ?? undefined)),
        },
        {
          key: 'check',
          label: planMapCopy.menu.check(),
          icon: 'check',
          onPress: () => router.push({ pathname: '/[tripId]/check', params: { tripId } }),
        },
        { key: 'share', label: planMapCopy.menu.share(), icon: 'share', onPress: props.onShare },
        {
          key: 'settings',
          label: planMapCopy.menu.settings(),
          icon: 'edit',
          onPress: () => router.push({ pathname: '/[tripId]/settings', params: { tripId } }),
        },
      ]}
    />
  );
}
