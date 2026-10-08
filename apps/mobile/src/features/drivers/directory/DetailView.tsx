/**
 * A listed driver (6e-2): RUNS HIS OWN LISTING, his initials (his photo when he adds one), the
 * crews' answers, trips and listed year, car, languages, areas, the price in his own words (never
 * ours), one recent tip shown with crew size and month only, MESSAGE ON WHATSAPP, Add to shortlist
 * and a quiet Report.
 */
import { format, upper } from '@cp/i18n';
import type { DriverDirectoryDetail } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { ScrollView, View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { initialsColour, useVehicleLine } from './DriverCard';

const useStyles = makeStyles((t) => ({
  photo: {
    height: 160,
    borderRadius: t.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stat: { flex: 1, backgroundColor: t.semantic.bg.raised, borderRadius: t.radius.md, padding: 12 },
  tip: { backgroundColor: t.semantic.bg.raised, borderRadius: t.radius.lg, padding: 16, gap: 8 },
}));

export interface DetailViewProps {
  readonly driver: DriverDirectoryDetail;
  readonly shortlisting: boolean;
  readonly shortlisted: boolean;
  readonly onBack: () => void;
  readonly onMessage: () => void;
  readonly onShortlist: () => void;
  readonly onReport: () => void;
  readonly onReportTip: () => void;
}

export function DetailView(props: DetailViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const { driver } = props;
  const car = useVehicleLine(driver);
  const listedYear = driver.listed_at.slice(0, 4);
  const month = (iso: string) =>
    format.date(locale, new Date(iso), { month: 'long', year: 'numeric' });
  const loved = driver.crews_loved ?? 0;
  const rated = driver.crews_rated ?? 0;
  const crewSize = driver.tip?.crew_size ?? 0;
  const tipMonth = driver.tip === null ? '' : month(driver.tip.month);
  const stats: { value: string; label: string }[] = [
    ...(driver.crews_rated !== null && driver.crews_rated > 0
      ? [
          {
            value: t({
              id: 'drivers.detail.lovedValue',
              message: `${loved} of ${rated}`,
            }),
            label: t({ id: 'drivers.detail.loved', message: 'Crews loved it' }),
          },
        ]
      : []),
    {
      value: String(driver.trips),
      label: t({ id: 'drivers.detail.trips', message: 'Trips with crews' }),
    },
    { value: listedYear, label: t({ id: 'drivers.detail.since', message: 'Listed since' }) },
  ];
  const lines = [car, driver.languages.join(', '), driver.areas.join(', ')].filter(
    (line): line is string => line !== null && line !== '',
  );
  return (
    <Scaffold testID="drivers-detail">
      <ScrollView
        contentContainerStyle={{
          padding: theme.space['20'],
          gap: theme.space['16'],
          paddingBottom: theme.space['32'] + theme.space['16'],
        }}
      >
        <BackEyebrow
          label={t({ id: 'drivers.detail.back', message: "Crews' drivers" })}
          onPress={props.onBack}
        />
        <Text variant="eyebrow" color={theme.semantic.text.secondary}>
          {upper(t({ id: 'drivers.detail.own', message: 'Runs his own listing' }), locale)}
        </Text>
        <View style={[styles.photo, { backgroundColor: initialsColour(theme, driver.id) }]}>
          <Text variant="displayHero" color={theme.semantic.text.onAccent}>
            {driver.display_name.slice(0, 1).toUpperCase()}
          </Text>
        </View>
        <Text variant="displayXl">{upper(driver.display_name, locale)}</Text>
        <Text variant="body" color={theme.semantic.text.secondary}>
          {`${t({ id: 'drivers.card.role', message: 'Driver' })} · ${driver.areas[0] ?? ''}`}
        </Text>
        <Row gap="8">
          {stats.map((stat) => (
            <Stack key={stat.label} gap="2" style={styles.stat}>
              <Text variant="title">{stat.value}</Text>
              <Text variant="caption" color={theme.semantic.text.secondary}>
                {upper(stat.label, locale)}
              </Text>
            </Stack>
          ))}
        </Row>
        <Stack gap="6">
          {lines.map((line) => (
            <Text key={line} variant="body">
              {line}
            </Text>
          ))}
        </Stack>
        {driver.price_text === null ? null : (
          <Stack gap="2">
            <Text variant="bodyLg">{driver.price_text}</Text>
            <Text variant="caption" color={theme.semantic.text.secondary}>
              {t({
                id: 'drivers.detail.priceNote',
                message: 'What he tells crews. Not a CritterPass price.',
              })}
            </Text>
          </Stack>
        )}
        {driver.tip === null ? null : (
          <Stack style={styles.tip} testID="drivers-detail-tip">
            <Text variant="eyebrow" color={theme.semantic.text.secondary}>
              {upper(t({ id: 'drivers.detail.tip', message: 'One tip from a crew' }), locale)}
            </Text>
            <Text variant="bodyLg">{`“${driver.tip.text}”`}</Text>
            <Text variant="caption" color={theme.semantic.text.secondary}>
              {t({
                id: 'drivers.detail.tipBy',
                message: `A crew of ${crewSize} · ${tipMonth}`,
              })}
            </Text>
            <TextLink
              label={t({ id: 'drivers.detail.reportTip', message: 'Report this tip' })}
              onPress={props.onReportTip}
              testID="drivers-report-tip"
            />
          </Stack>
        )}
        <PillButton
          label={t({ id: 'drivers.detail.message', message: 'Message on WhatsApp' })}
          onPress={props.onMessage}
          testID="drivers-message"
        />
        <PillButton
          variant="secondary"
          label={
            props.shortlisted
              ? t({ id: 'drivers.detail.shortlisted', message: 'On your trip' })
              : t({ id: 'drivers.detail.shortlist', message: 'Add to shortlist' })
          }
          onPress={props.onShortlist}
          loading={props.shortlisting}
          disabled={props.shortlisted}
          testID="drivers-shortlist"
        />
        <TextLink
          label={t({ id: 'drivers.detail.report', message: 'Report this listing' })}
          onPress={props.onReport}
          testID="drivers-report"
        />
      </ScrollView>
    </Scaffold>
  );
}
