/**
 * 2.04's saved card: the pasted link kept for the first trip ("SAVED FOR LATER", its address, a
 * green check). Tapping the check takes it back out (the check empties); tapping again keeps it.
 */
import { t } from '@lingui/core/macro';
import { useState } from 'react';
import { View } from 'react-native';

import { Card, Icon, PressableScale, Text, usePremiumTheme } from '@/ui/premium';

import type { PasteSource } from '../../paste-classify';
import { clearFirstTripLink, saveFirstTripLink, type SavedLink } from '../../saved-link';

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./u, '');
  } catch {
    return url;
  }
}

export function SavedLinkCard({
  link,
  source,
}: {
  readonly link: SavedLink;
  readonly source: PasteSource | null;
}) {
  const theme = usePremiumTheme();
  const [kept, setKept] = useState(true);
  const toggle = () => {
    if (kept) clearFirstTripLink();
    else saveFirstTripLink(link.url, source);
    setKept(!kept);
  };
  return (
    <Card radius={22} style={{ alignSelf: 'stretch' }} testID="paste-saved-link">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 }}>
        <View
          style={{
            width: 52,
            height: 52,
            borderRadius: 12,
            backgroundColor: theme.color.control,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="share" size={20} color={theme.color.muted} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="badge" tone="muted">
            {kept
              ? t({ id: 'onboarding.premium.paste.savedLabel', message: 'SAVED FOR LATER' })
              : t({ id: 'onboarding.premium.paste.removedLabel', message: 'NOT SAVED' })}
          </Text>
          <Text variant="rowTitle" numberOfLines={1}>
            {hostOf(link.url)}
          </Text>
        </View>
        <PressableScale
          accessibilityRole="checkbox"
          accessibilityState={{ checked: kept }}
          accessibilityLabel={t({
            id: 'onboarding.premium.paste.keep',
            message: 'Keep this link for your first trip',
          })}
          onPress={toggle}
          testID="paste-saved-link-toggle"
        >
          <View
            style={{
              width: 22,
              height: 22,
              borderRadius: 11,
              backgroundColor: kept ? theme.color.toggleOn : 'transparent',
              borderWidth: kept ? 0 : 1.5,
              borderColor: theme.color.outlineEmpty,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {kept ? <Icon name="check" size={12} color={theme.color.onInk} /> : null}
          </View>
        </PressableScale>
      </View>
    </Card>
  );
}
