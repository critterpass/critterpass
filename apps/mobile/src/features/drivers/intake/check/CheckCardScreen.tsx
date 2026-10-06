/**
 * Is this right? (6c-2): the card read from what was shared, every line unconfirmed. Tapping a line
 * confirms it and shows the words it came from in the peek bar; the pencil fixes it. Nothing
 * reaches the crew until every line with a value is confirmed (CONFIRM n MORE). What the price
 * does not say (tolls, entry, overtime) becomes a question opened in the traveller's WhatsApp.
 * Couldn't read it (6c-3): what could be read, why not, and TYPE THE REST IN.
 */
import { EMPTY_DRIVER_CARD, generateUuidV7, type DriverCard, type DriverField } from '@cp/domain';
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { useCommand } from '@/data/commands/use-command';
import { useLocale } from '@/lib/i18n/use-locale';
import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { InfoPill } from '@/ui/chips/InfoPill';
import { TextField } from '@/ui/inputs/TextField';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { Avatar } from '@/ui/people/Avatar';
import { PressScale } from '@/ui/press/PressScale';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { confirmFieldsCommand } from '../../shared/commands';
import { driversRoute } from '../../shared/routes';
import { useDriverDays } from '../../shared/use-driver-days';
import { useDrivers } from '../../shared/use-drivers';
import { askMessage, whatsappAsk } from '../../shared/whatsapp-copy';
import { recalledIntake } from '../intake-store';
import { useCardCopy } from './card-copy';
import { AskDriverBox } from './ask-driver-box';
import { CheckDot } from './check-dot';
import { IncludesLine } from './includes-line';
import { CouldntReadView } from './couldnt-read';
import { applyEdit, CARD_LINES, editText, filledLines, unsaidIncludes } from './card-lines';

const useStyles = makeStyles((t) => ({
  content: { paddingHorizontal: t.size.gutter, gap: t.space['16'], paddingTop: t.space['8'] },
  card: {
    backgroundColor: t.semantic.bg.raised,
    borderRadius: t.radius.lg,
    padding: t.space['16'],
  },
  peek: { backgroundColor: t.color.paper.base, borderRadius: t.radius.md, padding: t.space['12'] },
}));

export function CheckCardScreen(props: {
  tripId: string;
  intakeId?: string;
  unread?: boolean;
  days?: string;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const plan = useDriverDays(props.tripId);
  const { state } = useDrivers(props.tripId);
  const confirm = useCommand(confirmFieldsCommand);
  const listed =
    state.kind === 'ready' || state.kind === 'offline'
      ? (state.data?.intake ?? []).find((item) => item.id === props.intakeId)
      : undefined;
  const recalled = props.intakeId === undefined ? null : recalledIntake(props.intakeId);
  const parsed = recalled?.parsed ?? listed?.parsed ?? null;
  const source = recalled?.text ?? listed?.text ?? '';
  const readNothing =
    props.unread === true ||
    parsed === null ||
    (parsed.card.name === null && filledLines(parsed.card).length === 0);
  const [typing, setTyping] = useState(false);
  const [card, setCard] = useState<DriverCard | null>(parsed?.card ?? null);
  const [checked, setChecked] = useState<ReadonlySet<DriverField>>(new Set());
  const [focus, setFocus] = useState<DriverField | null>(null);
  const [editing, setEditing] = useState<DriverField | null>(null);
  const [error, setError] = useState(false);
  const current: DriverCard = card ?? parsed?.card ?? EMPTY_DRIVER_CARD;
  const back = (
    <BackEyebrow
      label={upper(t({ id: 'drivers.back.add', message: 'Add a driver' }), locale)}
      onPress={() => router.back()}
    />
  );

  if (readNothing && !typing) {
    return (
      <CouldntReadView
        guide={plan.guide.id}
        source={source}
        parsed={parsed}
        back={back}
        onType={() => {
          setTyping(true);
          setEditing(current.name === null ? 'name' : 'phone');
        }}
      />
    );
  }

  const required: DriverField[] = ['name', ...filledLines(current)];
  const left = required.filter((field) => !checked.has(field));
  const unsaid = unsaidIncludes(current);
  const name = current.name ?? '';
  const toggle = (field: DriverField) => {
    setFocus(field);
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return next;
    });
  };
  const { lineText, label, includeLabel } = useCardCopy(current);
  const span = focus === null ? undefined : parsed?.spans[focus];
  const save = async () => {
    const providerId = generateUuidV7();
    const result = await confirm.send({
      provider_id: providerId,
      trip_id: props.tripId,
      ...(props.intakeId === undefined ? {} : { intake_id: props.intakeId }),
      card: { ...current, name },
      confirmed: required,
    });
    if (result.kind === 'applied') {
      router.dismissTo(driversRoute(props.tripId, 'index', props.days ? { days: props.days } : {}));
    } else {
      setError(true);
    }
  };
  const askText = askMessage(
    t,
    name,
    unsaid.map((key) => includeLabel[key]),
    current.overtime_minor === null,
  );
  return (
    <Scaffold variant="dark" testID="drivers-check">
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: theme.space['32'] }]}
        keyboardShouldPersistTaps="handled"
      >
        {back}
        <Text variant="h1" designSize={52} accessibilityRole="header">
          {upper(t({ id: 'drivers.check.title', message: 'Is this right?' }), locale)}
        </Text>
        <Text variant="body" color={theme.semantic.text.secondary}>
          {t({
            id: 'drivers.check.intro',
            message: 'Tap each line to confirm or fix it. Nothing reaches the crew until you do.',
          })}
        </Text>
        {span === undefined || source === '' ? null : (
          <View style={styles.peek} testID="drivers-check-peek">
            <Text variant="bodySm" color={theme.color.paper.ink}>
              {source.slice(Math.max(0, span[0] - 40), span[0])}
              <Text
                variant="bodySm"
                color={theme.color.paper.ink}
                style={{ backgroundColor: theme.color.yellow }}
              >
                {source.slice(span[0], span[1])}
              </Text>
              {source.slice(span[1], span[1] + 40)}
            </Text>
          </View>
        )}
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
              <InfoPill variant="outline">
                {upper(
                  t({
                    id: 'drivers.check.count',
                    message: `${required.length - left.length} of ${required.length} checked`,
                  }),
                  locale,
                )}
              </InfoPill>
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
                    onChange={setCard}
                  />
                );
              }
              if (value === null && editing !== field && !typing) return null;
              return (
                <Row key={field} gap="12" align="flex-start">
                  <CheckDot on={checked.has(field)} onPress={() => toggle(field)} />
                  <Stack gap="2" style={{ flex: 1 }}>
                    <Text variant="eyebrow" color={theme.semantic.text.secondary}>
                      {upper(label[field], locale)}
                    </Text>
                    {editing === field ? (
                      <TextField
                        label={label[field]}
                        labelHidden
                        value={editText(current, field)}
                        onChangeText={(text) =>
                          setCard(applyEdit(current, field, text, plan.currency ?? 'USD'))
                        }
                        onSubmitEditing={() => setEditing(null)}
                        autoFocus
                        testID={`drivers-check-edit-${field}`}
                      />
                    ) : (
                      <Text variant="rowTitle" onPress={() => toggle(field)}>
                        {value ?? '—'}
                      </Text>
                    )}
                  </Stack>
                  <TextLink
                    label={t({ id: 'drivers.check.fix', message: 'Fix' })}
                    onPress={() => setEditing(editing === field ? null : field)}
                    testID={`drivers-check-fix-${field}`}
                  />
                </Row>
              );
            })}
            {editing === 'name' ? (
              <TextField
                label={label.name}
                value={current.name ?? ''}
                onChangeText={(text) => setCard(applyEdit(current, 'name', text, 'USD'))}
                testID="drivers-check-edit-name"
              />
            ) : null}
          </Stack>
        </View>
        {unsaid.length === 0 || current.phone === null ? null : (
          <AskDriverBox
            guide={plan.guide.id}
            name={name}
            count={unsaid.length}
            url={whatsappAsk(current.phone, askText)}
          />
        )}
        {error ? (
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
          tone="yellow"
          block
          disabled={left.length > 0 || name === '' || confirm.pending}
          loading={confirm.pending}
          onPress={() => void save()}
          testID="drivers-check-confirm"
        />
      </ScrollView>
    </Scaffold>
  );
}
