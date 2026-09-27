import type { ReactNode } from 'react';
import { View } from 'react-native';

// @shopify/react-native-skia's renderer needs a real JSI/GPU host and ships untranspiled ESM in
// node_modules, neither of which Jest/Node can run — the same class of native-boundary double
// app-group.test.tsx already uses for the cp-app-group module (code-standards.md §17). Canvas/Group
// keep rendering children so RNTL can still query the surrounding UI; Path/Image are leaf drawing
// primitives with nothing meaningful to render under Jest.
export function Canvas({ children }: { children?: ReactNode }) {
  return <View>{children}</View>;
}

export function Group({ children }: { children?: ReactNode }) {
  return <View>{children}</View>;
}

export function Path() {
  return null;
}

export function Image() {
  return null;
}

class MockSkPath {
  addPoly(): this {
    return this;
  }
}

export const Skia = {
  Path: { Make: () => new MockSkPath() },
};

export function drawAsImage(): Promise<Record<string, never>> {
  return Promise.resolve({});
}
