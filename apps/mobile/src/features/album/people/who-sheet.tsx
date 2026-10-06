/**
 * Long-press on a photo: who's in it (travellers tagged by themselves, by hand or by their own
 * phone's match), and "I'm in this" for the caller. Nobody tags anyone else, and no face data is
 * involved: a tag is just a traveller saying they are in the photo.
 */
import { useLingui } from '@lingui/react/macro';

import { SecondaryText } from '@/ui/cards/SecondaryText';
import { Toggle } from '@/ui/inputs/Toggle';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { Avatar } from '@/ui/people/Avatar';
import { Sheet } from '@/ui/sheet/Sheet';
import { Text } from '@/ui/text/Text';

import type { AlbumPerson } from '../data/album-model';

export interface WhoSheetProps {
  readonly inPhoto: readonly AlbumPerson[];
  readonly indexOf: (uid: string) => number;
  readonly meIn: boolean;
  readonly onMeIn: (on: boolean) => void;
  readonly onClose: () => void;
}

export function WhoSheet({ inPhoto, indexOf, meIn, onMeIn, onClose }: WhoSheetProps) {
  const { t } = useLingui();
  const title = t({ id: 'album.who.title', message: "Who's in it" });
  return (
    <Sheet detents={['fit']} onDismiss={onClose} accessibilityLabel={title} testID="album-who">
      <Stack gap="12" padding="16">
        <Text variant="h3" accessibilityRole="header">
          {title}
        </Text>
        {inPhoto.length === 0 ? (
          <SecondaryText variant="body">
            {t({ id: 'album.who.nobody', message: "Nobody's said they're in this one yet." })}
          </SecondaryText>
        ) : (
          inPhoto.map((person) => (
            <Row key={person.id} gap="10" align="center">
              <Avatar name={person.name} joinIndex={indexOf(person.id)} size="sm" decorative />
              <Text variant="body">{person.name}</Text>
            </Row>
          ))
        )}
        <Toggle
          label={t({ id: 'album.who.me', message: "I'm in this" })}
          value={meIn}
          onValueChange={onMeIn}
          testID="album-who-me"
        />
      </Stack>
    </Sheet>
  );
}
