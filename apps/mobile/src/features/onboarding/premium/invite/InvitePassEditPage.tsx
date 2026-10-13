/**
 * "Change anything" on the premium invited pass (undesigned; built on the 2.05 wizard page and the
 * 2.09 home search): the invitee corrects the name the inviter typed and picks their own home
 * airport from the same bundled airports. A code joiner arrives with neither, so the button reads
 * what is still missing; the picked home stays on show with the keyboard put away.
 */
import { t } from '@lingui/core/macro';
import { useDeferredValue, useMemo, useState } from 'react';
import { Keyboard, View } from 'react-native';

import { givenNameProblem, homeBaseFor } from '@cp/domain';

import { useLocale } from '@/lib/i18n/use-locale';
import {
  Button,
  Icon,
  ListCard,
  PressableScale,
  Text,
  TextField,
  usePremiumTheme,
} from '@/ui/premium';

import { airportDataset, BLOCKED_NAME_WORDS } from '../../content';
import { rowFacts, rowKey, rowTitle } from '../../home/home-rows';
import { homeResults } from '../../home/home-search';
import { missingPassPart, passAskLabel } from '../../invited/pass-missing';
import { PICKED_ROW } from '../components/onboarding-colours';
import { SearchBox } from '../components/SearchBox';
import { WizardHeader } from '../components/WizardHeader';
import { WizardPage } from '../components/WizardPage';

const MAX_ROWS = 6;

export interface InvitePassEditPageProps {
  readonly name: string;
  readonly homeIata: string | null;
  readonly onDone: (next: { readonly name: string; readonly homeIata: string | null }) => void;
  readonly onClose: () => void;
}

export function InvitePassEditPage({ name, homeIata, onDone, onClose }: InvitePassEditPageProps) {
  const theme = usePremiumTheme();
  const locale = useLocale();
  const [draftName, setDraftName] = useState(name);
  const [home, setHome] = useState(homeIata);
  const [query, setQuery] = useState('');
  // The search runs on the deferred query, so a keystroke's render never lags the typed text.
  const searched = useDeferredValue(query);
  const rows = useMemo(
    () => homeResults(airportDataset(), searched, null, MAX_ROWS).rows,
    [searched],
  );
  const problem = givenNameProblem(draftName, BLOCKED_NAME_WORDS);
  const missing = missingPassPart({ given_name: draftName, home_iata: home });
  const picked = home === null ? null : homeBaseFor(airportDataset(), home);
  // The search and the keyboard make way for the pick, so the button under it is in reach.
  const pick = (iata: string) => {
    setHome(iata);
    setQuery('');
    Keyboard.dismiss();
  };
  const backLabel = t({ id: 'onboarding.invite.code.back', message: 'Back' });
  // An empty name is asked for by the button, not marked as a mistake.
  const nameError =
    problem === 'blocked'
      ? t({
          id: 'onboarding.premium.name.blocked',
          message: 'That one can’t go on a pass. Try another name.',
        })
      : problem === 'too_long'
        ? t({
            id: 'onboarding.premium.invite.pass.tooLong',
            message: 'That’s longer than a pass can print. Try a shorter one.',
          })
        : undefined;
  return (
    <WizardPage
      backLabel={backLabel}
      header={<WizardHeader label="" backLabel={backLabel} onBack={onClose} />}
      testID="invite-edit-pass"
      footer={
        <Button
          label={
            missing === null
              ? t({ id: 'onboarding.invite.pass.editDone', message: 'Done' })
              : passAskLabel(missing)
          }
          onPress={() => onDone({ name: draftName.trim(), homeIata: home })}
          disabled={missing !== null || problem !== null}
          testID="invite-edit-done"
        />
      }
    >
      <Text variant="largeTitle" accessibilityRole="header">
        {t({ id: 'onboarding.invite.pass.edit', message: 'Change your name or home' })}
      </Text>
      <View style={{ gap: theme.space.gap8 }}>
        <Text variant="caption" tone="muted">
          {t({ id: 'onboarding.invite.pass.editName', message: 'Given name' })}
        </Text>
        <TextField
          accessibilityLabel={t({ id: 'onboarding.invite.pass.editName', message: 'Given name' })}
          value={draftName}
          onChangeText={setDraftName}
          autoCapitalize="words"
          autoCorrect={false}
          textContentType="givenName"
          returnKeyType="done"
          error={nameError}
          testID="invite-edit-name"
        />
      </View>
      <View style={{ gap: theme.space.gap8 }}>
        <Text variant="caption" tone="muted">
          {t({ id: 'onboarding.invite.pass.editHome', message: 'Home airport' })}
        </Text>
        <SearchBox
          value={query}
          onChangeText={setQuery}
          label={t({ id: 'onboarding.home.search', message: 'City, airport or code' })}
          testID="invite-edit-home"
        />
      </View>
      {query.length > 0 && rows.length > 0 ? (
        <ListCard testID="invite-edit-home-results">
          {rows.map((row) => {
            const iata = rowKey(row);
            const title = rowTitle(row);
            return (
              <PressableScale
                key={`${row.kind}-${iata}`}
                onPress={() => pick(iata)}
                accessibilityRole="radio"
                accessibilityState={{ selected: home === iata }}
                accessibilityLabel={`${iata}, ${title}`}
                pressedScale={0.99}
                testID={`invite-edit-home-${iata}`}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: theme.space.gap14,
                    paddingVertical: theme.space.gap12,
                    paddingHorizontal: theme.space.rowPadH,
                  }}
                >
                  <Text
                    variant="title"
                    style={{ width: 52 }}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    {iata}
                  </Text>
                  <View style={{ flex: 1 }}>
                    <Text variant="rowTitle" numberOfLines={1}>
                      {title}
                    </Text>
                    <Text variant="caption" tone="muted" numberOfLines={1}>
                      {rowFacts(row, locale)}
                    </Text>
                  </View>
                </View>
              </PressableScale>
            );
          })}
        </ListCard>
      ) : null}
      {picked !== null && query.length === 0 ? (
        <View
          accessible
          accessibilityState={{ selected: true }}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.space.gap12,
            paddingVertical: theme.space.gap12,
            paddingHorizontal: theme.space.rowPadH,
            borderRadius: theme.radius.card,
            backgroundColor: theme.scheme === 'light' ? PICKED_ROW : theme.color.card,
            boxShadow: theme.shadow.raised,
          }}
          testID="invite-edit-home-picked"
        >
          <Text variant="rowTitle" style={{ flex: 1 }} numberOfLines={1}>
            {`${picked.city} · ${picked.iata}`}
          </Text>
          <View
            style={{
              width: 24,
              height: 24,
              borderRadius: 12,
              backgroundColor: theme.color.ink,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="check" size={14} color={theme.color.onInk} />
          </View>
        </View>
      ) : null}
    </WizardPage>
  );
}
