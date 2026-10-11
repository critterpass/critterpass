// Jest test double for `@maplibre/maplibre-react-native`, mapped in this package's `jest.config.js`
// (`moduleNameMapper`). The real package needs its native map view, and its CommonJS build is not
// plain CommonJS, so any suite that reaches a map through a feature index (the plan's premium map
// is part of the plan feature's public surface) could not load at all. The map renders its
// children in a plain `View`; the camera, sources and layers draw nothing. A suite that asserts on
// the map still replaces this with its own `jest.mock` factory.
import { forwardRef, useImperativeHandle, type ReactNode } from 'react';
import { View } from 'react-native';

interface Children {
  readonly children?: ReactNode;
}

const noop = (): void => undefined;

const MapView = forwardRef<unknown, Children>(function MapView({ children }, ref) {
  useImperativeHandle(ref, () => ({
    getCenter: () => Promise.resolve([0, 0]),
    getZoom: () => Promise.resolve(0),
    getBounds: () => Promise.resolve([0, 0, 0, 0]),
    queryRenderedFeatures: () => Promise.resolve([]),
  }));
  return <View testID="maplibre-map">{children}</View>;
});

export { MapView as Map };

export const Camera = forwardRef<unknown, object>(function Camera(_props, ref) {
  useImperativeHandle(ref, () => ({
    jumpTo: noop,
    easeTo: noop,
    flyTo: noop,
    fitBounds: noop,
    zoomTo: noop,
    setStop: noop,
  }));
  return null;
});

export function Marker({ children }: Children) {
  return <View>{children}</View>;
}

export function ViewAnnotation({ children }: Children) {
  return <View>{children}</View>;
}

export function GeoJSONSource({ children }: Children) {
  return <View>{children}</View>;
}

export function Layer(): null {
  return null;
}
