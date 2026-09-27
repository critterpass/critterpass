import { tokens } from '@cp/design-tokens';
import { render, screen } from '@testing-library/react-native';
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

function accessibilityValueText(element: {
  props: { accessibilityValue?: { text?: string } };
}): string {
  return element.props.accessibilityValue?.text ?? '';
}

describe('RouteLine', () => {
  it('renders a GeoJSON LineString source with the requested colour and width', async () => {
    await render(
      <RouteLine
        id="day-route"
        coordinates={[
          [135.76, 35.01],
          [135.77, 35.02],
        ]}
        color={tokens.color.yellow}
        width={4}
      />,
    );
    const source = screen.getByTestId('geojson-source-day-route-source');
    const data = JSON.parse(accessibilityValueText(source)) as {
      geometry: { type: string; coordinates: number[][] };
    };
    expect(data.geometry.type).toBe('LineString');
    expect(data.geometry.coordinates).toEqual([
      [135.76, 35.01],
      [135.77, 35.02],
    ]);

    const layer = screen.getByTestId('layer-day-route-layer');
    const paint = JSON.parse(accessibilityValueText(layer)) as Record<string, unknown>;
    expect(paint['line-color']).toBe(tokens.color.yellow);
    expect(paint['line-width']).toBe(4);
    expect(paint['line-dasharray']).toBeUndefined();
  });

  it('adds a dash pattern for a dotted line to a selected pin', async () => {
    await render(
      <RouteLine
        id="to-selected"
        coordinates={[
          [135.76, 35.01],
          [135.77, 35.02],
        ]}
        color={tokens.color.blue}
        dashed
      />,
    );
    const layer = screen.getByTestId('layer-to-selected-layer');
    const paint = JSON.parse(accessibilityValueText(layer)) as Record<string, unknown>;
    expect(paint['line-dasharray']).toEqual([2, 2]);
  });

  it('renders nothing for fewer than 2 coordinates', async () => {
    const { toJSON } = await render(
      <RouteLine id="empty" coordinates={[[135.76, 35.01]]} color={tokens.color.paper.base} />,
    );
    expect(toJSON()).toBeNull();
  });
});
