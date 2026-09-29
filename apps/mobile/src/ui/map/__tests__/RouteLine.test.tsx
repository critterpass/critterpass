import { tokens } from '@cp/design-tokens';
import { render } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';

// `@maplibre/maplibre-react-native`'s components register real native views; RNTL has no native
// map engine to render into, so this only needs to prove `RouteLine` builds a correct GeoJSON
// LineString and hands the right paint props to the native layer — plain `View` stand-ins with the
// same prop shape do exactly that without booting any native module. `require`d inside the
// factory: jest hoists `jest.mock()` above imports, so an outer-scope `View` import is not visible
// here (and the factory must stay a synchronous inline function, not a reference to one).
jest.mock('@maplibre/maplibre-react-native', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment
  const { View } = require('react-native');
  return {
    GeoJSONSource: ({ id, data, children }: { id: string; data: unknown; children: unknown }) => (
      <View testID={`geojson-source-${id}`} accessibilityValue={{ text: JSON.stringify(data) }}>
        {children}
      </View>
    ),
    Layer: ({ id, paint }: { id: string; paint: unknown }) => (
      <View testID={`layer-${id}`} accessibilityValue={{ text: JSON.stringify(paint) }} />
    ),
  };
});

import { RouteLine } from '../RouteLine';

describe('RouteLine', () => {
  it('renders nothing for fewer than 2 coordinates', async () => {
    const { toJSON } = await render(
      <RouteLine id="empty" coordinates={[[135.76, 35.01]]} color={tokens.color.paper.base} />,
    );
    expect(toJSON()).toBeNull();
  });
});
