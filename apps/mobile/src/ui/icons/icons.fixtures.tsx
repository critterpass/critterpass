/* eslint-disable lingui/no-unlocalized-strings -- dev-gallery sample copy; fixture files are loaded only by the (dev) gallery and never ship. */
import { registerFixture } from '../gallery/registry';
import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { SurfaceToneProvider } from '../surface/Scaffold';
import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';
import { DOODLES } from './generated';
import type { DoodleName } from './generated';
import { Icon } from './Icon';

const NAMES = Object.keys(DOODLES) as DoodleName[];

const useStyles = makeStyles((t) => ({
  cell: { width: 72, alignItems: 'center', gap: t.space['4'] },
  paper: { backgroundColor: t.color.paper.base, borderRadius: t.radius.md },
}));

function Grid({ accent }: { readonly accent?: string }) {
  const styles = useStyles();
  return (
    <Row wrap gap="12">
      {NAMES.map((name) => (
        <Stack key={name} style={styles.cell}>
          <Icon name={name} size={40} {...(accent ? { accent } : {})} />
          <Text variant="caption">{name}</Text>
        </Stack>
      ))}
    </Row>
  );
}

function Accented() {
  const theme = useTheme();
  return <Grid accent={theme.color.pink} />;
}

function OnPaper() {
  const styles = useStyles();
  return (
    <SurfaceToneProvider value="paper">
      <Stack padding="12" style={styles.paper}>
        <Grid />
      </Stack>
    </SurfaceToneProvider>
  );
}

registerFixture('Icon', 'all doodles', () => <Grid />);
registerFixture('Icon', 'accent washes', () => <Accented />);
registerFixture('Icon', 'on paper', () => <OnPaper />);
registerFixture('Icon', 'sizes', () => (
  <Row gap="12" align="flex-end">
    {[16, 24, 32, 48, 64].map((size) => (
      <Icon key={size} name="pin" size={size} />
    ))}
  </Row>
));
