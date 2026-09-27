/* eslint-disable lingui/no-unlocalized-strings -- dev-gallery state names; fixture files are loaded only by the (dev) gallery and never ship. */
import { registerFixture } from '../gallery/registry';
import { CloseButton } from './CloseButton';
import { Grabber } from './Grabber';

// The sheet and rise themselves are full-screen presentations: the gallery opens them as live
// demos (Shell: sheet / Shell: rise modal) instead of framing them as static fixtures.
registerFixture('CloseButton', 'on dark', () => <CloseButton onPress={() => {}} />);
registerFixture('CloseButton', 'on paper', () => <CloseButton onPress={() => {}} onPaper />);
registerFixture('Grabber', 'default', () => <Grabber />);
