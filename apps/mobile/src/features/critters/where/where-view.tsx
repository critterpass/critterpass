/**
 * Where to find a form (an undesigned screen, logged in docs/undesigned-states.md), built from the
 * critter page's parts: its tier and silhouette (never its name until found), what it takes, its
 * places on the map, nearest first, the steps that meet it, and DIRECTIONS to the nearest place in
 * the phone's maps app.
 */
import { tokens } from '@cp/design-tokens';
import { upper } from '@cp/i18n';
import { ScrollView, View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { PillButton } from '@/ui/buttons/PillButton';
import { tierWord, type Tier } from '@/ui/critters/tier';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { SilhouetteSlot } from '@/ui/sticker/SilhouetteSlot';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { artKind } from '../art-kind';
import { backToDex } from '../dex/dex-copy';
import { SpotMap } from './spot-map';
import {
  allFound,
  directions,
  nearestSpot,
  noSpots,
  stepsLabel,
  stepText,
  whereEyebrow,
  whereTitle,
} from './where-copy';
import type { FormWhere } from './where-model';

const ART = 96;
const MAP_HEIGHT = 280;

export interface WhereViewProps {
  readonly where: FormWhere | null;
  readonly tier: Tier;
  readonly requirement: string | null;
  readonly critter: { readonly key: string; readonly seed: number; readonly city: string } | null;
  readonly slug: string | null;
  readonly position: { readonly lat: number; readonly lng: number } | null;
  /** The nearest place's distance, already formatted in the reader's unit. */
  readonly away: string | null;
  readonly onDirections: () => void;
}

const useStyles = makeStyles((th) => ({
  body: { paddingHorizontal: th.size.gutter, gap: th.space['14'], paddingBottom: th.space['24'] },
  footer: { paddingHorizontal: th.size.gutter, paddingVertical: th.space['12'] },
  stepNo: { width: th.space['24'] },
}));

export function WhereView(props: WhereViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const { where, tier } = props;
  const nearest = where?.nearest ?? null;
  return (
    <Scaffold variant="dark" edges={['top', 'bottom']} testID="critters-where">
      <ScrollView contentContainerStyle={{ paddingTop: theme.space['8'] }} style={{ flex: 1 }}>
        <View style={styles.body}>
          <BackEyebrow label={upper(backToDex(), locale)} testID="critters-where-back" />
          <Row gap="14" align="center">
            {props.critter === null ? null : (
              <SilhouetteSlot
                kind={artKind(props.critter.key)}
                city={props.critter.city}
                size={ART}
                seed={props.critter.seed}
                maskColor={
                  tier === 'legendary'
                    ? tokens.tier.locked.legendary.silhouette
                    : tokens.tier.locked.default
                }
                glyphColor={tokens.tier[tier].color}
              />
            )}
            <Stack gap="4" style={{ flex: 1 }}>
              <Text variant="eyebrow" color={tokens.tier[tier].color}>
                {upper(whereEyebrow(tierWord(tier)), locale)}
              </Text>
              <Text variant="h2" singleLine={false}>
                {upper(whereTitle(), locale)}
              </Text>
            </Stack>
          </Row>
          {props.requirement === null ? null : (
            <Text variant="bodyLg" testID="critters-where-requirement">
              {props.requirement}
            </Text>
          )}
          {where === null || where.spots.length === 0 ? (
            <Text variant="body" color={theme.semantic.text.secondary} testID="critters-where-none">
              {noSpots()}
            </Text>
          ) : (
            <>
              <SpotMap
                spots={where.spots.map((spot) => ({ ...spot, tier }))}
                position={props.position}
                slug={props.slug}
                foundLabel={allFound()}
                height={MAP_HEIGHT}
                testID="critters-where-map"
              />
              {nearest === null ? null : (
                <Text variant="body" testID="critters-where-nearest">
                  {nearestSpot(nearest.name, props.away)}
                </Text>
              )}
            </>
          )}
          {where === null || where.steps.length === 0 ? null : (
            <Stack gap="10" testID="critters-where-steps">
              <Text variant="label">{upper(stepsLabel(), locale)}</Text>
              {where.steps.map((step, index) => (
                <Row key={step.kind} gap="8" align="flex-start">
                  <Text variant="monoData" style={styles.stepNo}>
                    {String(index + 1)}
                  </Text>
                  <Text variant="body" style={{ flex: 1 }} singleLine={false}>
                    {stepText(step, nearest?.name ?? null)}
                  </Text>
                </Row>
              ))}
            </Stack>
          )}
        </View>
      </ScrollView>
      {nearest === null ? null : (
        <View style={styles.footer}>
          <PillButton
            label={directions()}
            tone="yellow"
            onPress={props.onDirections}
            testID="critters-where-directions"
          />
        </View>
      )}
    </Scaffold>
  );
}
