/**
 * Further down the place page (7e-2): the guide's tip in its voice, KNOW BEFORE YOU GO, NEXT,
 * NEARBY by the drive (a card opens the place), IF YOU LIKE THIS, and, kept from the earlier page below them, the live
 * details with their attribution and the partner offers with the disclosure. Each section is left
 * out while it has nothing to show.
 */
import type { Href } from 'expo-router';
import { router } from 'expo-router';
import { View } from 'react-native';

import { Row } from '@/ui/layout/Row';
import { Sticker } from '@/ui/sticker/Sticker';
import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';

import { PlaceLiveDetails } from '../components/place-live-details';
import { SupplierCard, type SupplierCardProps } from '../components/supplier-card';
import type { GuideFacts } from '../format';
import type { LiveDetails } from '../place-live';
import type { PlaceDetailContext } from './context';
import { IfYouLike } from './if-you-like';
import { KnowBefore } from './know-before';
import { NextNearby } from './next-nearby';

const TIP_STICKER = 40;

export interface PlaceFurtherProps {
  readonly guide: GuideFacts;
  readonly context: PlaceDetailContext | null;
  readonly tip: string | null;
  readonly live: LiveDetails | null;
  readonly offers: SupplierCardProps | null;
  readonly onPlace: (poiId: string) => void;
  /** Add to plan for another place; undefined while that screen is not in the app. */
  readonly addPlace: (poiId: string) => Href | undefined;
}

export function PlaceFurther(props: PlaceFurtherProps) {
  const theme = useTheme();
  const { guide, context } = props;
  const add = (poiId: string) => {
    const href = props.addPlace(poiId);
    if (href !== undefined) router.push(href);
  };
  const canAdd =
    context?.similar[0] === undefined
      ? false
      : props.addPlace(context.similar[0].poi_id) !== undefined;
  return (
    <View style={{ gap: theme.space['16'], marginTop: theme.space['8'] }}>
      {props.tip === null ? null : (
        <Row gap="12" align="center" testID="place-detail-tip">
          <Sticker kind={guide.kind} name={guide.name} size={TIP_STICKER} />
          <View style={{ flex: 1 }}>
            <Text variant="voice" color={guide.colour} singleLine={false}>
              {props.tip}
            </Text>
          </View>
        </Row>
      )}
      <KnowBefore lines={context?.know ?? []} />
      <NextNearby guide={guide} places={context?.nearby ?? []} onPlace={props.onPlace} />
      <IfYouLike
        places={context?.similar ?? []}
        onPlace={props.onPlace}
        onAdd={canAdd ? add : undefined}
      />
      {props.live === null ? null : <PlaceLiveDetails {...props.live} />}
      {props.offers === null ? null : <SupplierCard {...props.offers} />}
    </View>
  );
}
