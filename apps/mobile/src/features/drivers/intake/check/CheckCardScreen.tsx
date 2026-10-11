/**
 * Is this right? (6c-2): the card read from what was shared, every line unconfirmed. Tapping a line
 * confirms it and shows the words it came from in the peek bar; the pencil fixes it. Nothing
 * reaches the crew until every line with a value is confirmed (CONFIRM n MORE). What the price
 * does not say (tolls, entry, overtime) becomes a question opened in the traveller's WhatsApp.
 * Couldn't read it (6c-3): what could be read, why not, and TYPE THE REST IN.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { ScrollView, View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { PillButton } from '@/ui/buttons/PillButton';
import { TextField } from '@/ui/inputs/TextField';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { Avatar } from '@/ui/people/Avatar';
import { PressScale } from '@/ui/press/PressScale';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { SaidPill } from '../../shared/said-pill';
import { AskDriverBox } from './ask-driver-box';
import { CARD_LINES, editText } from './card-lines';
import { CheckDot } from './check-dot';
import { CouldntReadView } from './couldnt-read';
import { IncludesLine } from './includes-line';
import { PriceNotes } from './price-notes';
import { SourcePeek } from './source-peek';
import { useCheckCard, type CheckCardInput } from './use-check-card';

/** The fix mark of a card line: the icon set has no pencil, so the text one is drawn. */
const PENCIL = '✎';

const useStyles = makeStyles((t) => ({
  content: { paddingHorizontal: t.size.gutter, gap: t.space['16'], paddingTop: t.space['8'] },
  card: {
    backgroundColor: t.semantic.bg.raised,
    borderRadius: t.radius.lg,
    padding: t.space['16'],
  },
}));

export function CheckCardScreen(props: CheckCardInput) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const check = useCheckCard(props);
  const { plan, source, current, checked, editing, setEditing, toggle, required, left, name } =
    check;
  const { lineText, label, includeLabel, priceAsk, asked, span } = check;
  const back = (
    <BackEyebrow
      label={upper(t({ id: 'drivers.back.add', message: 'Add a driver' }), locale)}
      onPress={() => router.back()}
    />
  );

  if (check.readNothing) {
    return (
      <CouldntReadView
        guide={plan.guide.id}
        source={source}
        parsed={check.parsed}
        back={back}
        onType={check.startTyping}
      />
    );
  }

  return (
    <Scaffold variant="dark" testID="drivers-check">
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: theme.space['32'] }]}
        keyboardShouldPersistTaps="handled"
      >
        {back}
        <Text variant="h1" designSize={52} accessibilityRole="header" singleLine={false}>
          {upper(t({ id: 'drivers.check.title', message: 'Is this\nright?' }), locale)}
        </Text>
        <Text variant="body" color={theme.semantic.text.secondary}>
          {t({
            id: 'drivers.check.intro',
            message: 'Tap each line to confirm or fix it. Nothing reaches the crew until you do.',
          })}
        </Text>
        {span === undefined || source === '' ? null : <SourcePeek source={source} span={span} />}
        <View style={styles.card}>
          <Stack gap="14">
            <Row gap="12" align="center">
              <Avatar name={name === '' ? '?' : name} joinIndex={2} size="lg" />
              <PressScale
                accessibilityLabel={label.name}
                onPress={() => toggle('name')}
                style={{ flex: 1 }}
                testID="drivers-check-line-name"
              >
                <Text variant="h3">{upper(name, locale)}</Text>
                {current.area === null ? null : (
                  <Text variant="bodySm" color={theme.semantic.text.secondary}>
                    {t({ id: 'drivers.check.area', message: `Driver · ${current.area}` })}
                  </Text>
                )}
              </PressScale>
              <SaidPill tone="quiet">
                {upper(
                  t({
                    id: 'drivers.check.count',
                    message: `${required.length - left.length} of ${required.length} checked`,
                  }),
                  locale,
                )}
              </SaidPill>
            </Row>
            {CARD_LINES.map((field) => {
              const value = lineText(field);
              if (field === 'includes') {
                return (
                  <IncludesLine
                    key={field}
                    card={current}
                    checked={checked.has(field)}
                    label={label.includes}
                    includeLabel={includeLabel}
                    onCheck={() => toggle(field)}
                    onChange={check.setCard}
                  />
                );
              }
              const asking = field === 'price' && priceAsk !== null;
              if (value === null && editing !== field && !check.typing && !asking) return null;
              return (
                <Row key={field} gap="12" align="flex-start">
                  <CheckDot
                    on={checked.has(field)}
                    onPress={asking && editing !== field ? undefined : () => toggle(field)}
                  />
                  <Stack gap="2" style={{ flex: 1 }}>
                    <Text variant="eyebrow" color={theme.semantic.text.secondary}>
                      {upper(label[field], locale)}
                    </Text>
                    {editing === field ? (
                      <TextField
                        label={label[field]}
                        labelHidden
                        value={editText(current, field)}
                        onChangeText={(text) => check.edit(field, text)}
                        onSubmitEditing={() => setEditing(null)}
                        autoFocus
                        testID={`drivers-check-edit-${field}`}
                      />
                    ) : (
                      <Text variant="rowTitle" onPress={asking ? undefined : () => toggle(field)}>
                        {value ??
                          (asking
                            ? t({ id: 'drivers.check.priceAsk', message: 'Ask the driver' })
                            : '—')}
                      </Text>
                    )}
                    {field === 'price' ? <PriceNotes card={current} /> : null}
                  </Stack>
                  <PressScale
                    accessibilityLabel={t({ id: 'drivers.check.fix', message: 'Fix' })}
                    onPress={() => setEditing(editing === field ? null : field)}
                    style={{ minHeight: 24, minWidth: 24, alignItems: 'center', marginTop: 6 }}
                    testID={`drivers-check-fix-${field}`}
                  >
                    <Text variant="body" color={theme.semantic.text.secondary}>
                      {PENCIL}
                    </Text>
                  </PressScale>
                </Row>
              );
            })}
            {editing === 'name' ? (
              <TextField
                label={label.name}
                value={current.name ?? ''}
                onChangeText={(text) => check.edit('name', text)}
                testID="drivers-check-edit-name"
              />
            ) : null}
          </Stack>
        </View>
        {asked === 0 || current.phone === null ? null : (
          <AskDriverBox guide={plan.guide.id} name={name} count={asked} url={check.askUrl} />
        )}
        {check.error ? (
          <Text variant="bodySm" color={theme.semantic.state.urgent}>
            {t({
              id: 'drivers.check.error',
              message: 'That didn’t save. Check you’re online and try again.',
            })}
          </Text>
        ) : null}
        <PillButton
          label={
            left.length > 0
              ? t({ id: 'drivers.check.confirmMore', message: `Confirm ${left.length} more` })
              : t({ id: 'drivers.check.confirm', message: 'Add to the shortlist' })
          }
          tone={left.length > 0 ? 'ink' : 'yellow'}
          block
          disabled={left.length > 0 || name === '' || check.pending}
          loading={check.pending}
          onPress={() => void check.save()}
          testID="drivers-check-confirm"
        />
      </ScrollView>
    </Scaffold>
  );
}
