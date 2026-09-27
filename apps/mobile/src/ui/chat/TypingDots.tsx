import Animated from 'react-native-reanimated';

import { useTypingDot } from '@/motion/patterns/typing';

import { Row } from '../layout/Row';
import { makeStyles, useTheme } from '../theme';

const useStyles = makeStyles((th) => ({
  dot: { width: th.space['6'], height: th.space['6'], borderRadius: th.space['6'] },
}));

function Dot({ index, color }: { readonly index: number; readonly color: string }) {
  const styles = useStyles();
  const style = useTypingDot(true, index);
  return <Animated.View style={[styles.dot, { backgroundColor: color }, style]} />;
}

/** Three bouncing dots (`typing` pattern); decorative, the owner labels who is typing. */
export function TypingDots({ color }: { readonly color?: string }) {
  const theme = useTheme();
  return (
    <Row gap="4" align="center" importantForAccessibility="no-hide-descendants">
      {[0, 1, 2].map((index) => (
        <Dot key={index} index={index} color={color ?? theme.semantic.text.secondary} />
      ))}
    </Row>
  );
}
