import { describe, expect, it } from 'vitest';

import { emitPremiumKotlin } from '../codegen/premium-kotlin';
import { premiumLeaves, premiumModeLeaves } from '../codegen/premium-leaves';
import { emitPremiumSwift } from '../codegen/premium-swift';
import { boxShadow, compositeOver, premium } from '../src/premium';

const swift = emitPremiumSwift(premium);
const kotlin = emitPremiumKotlin(premium);

describe('premium springs', () => {
  it.each(Object.entries(premium.spring))(
    '%s keeps its physical and SwiftUI forms in step (mass 1)',
    (_name, spring) => {
      const stiffness = (2 * Math.PI) ** 2 / spring.response ** 2;
      const damping = (4 * Math.PI * spring.dampingFraction) / spring.response;
      expect(spring.stiffness).toBeCloseTo(stiffness, 0);
      expect(spring.damping).toBeCloseTo(damping, 1);
      expect(spring.bounce).toBeCloseTo(1 - spring.dampingFraction, 5);
    },
  );

  it('matches the design values', () => {
    expect(premium.spring.snappy).toMatchObject({ stiffness: 438.6, damping: 36.02, mass: 1 });
    expect(premium.spring.smooth).toMatchObject({ stiffness: 195, damping: 27.93, mass: 1 });
    expect(premium.spring.lively).toMatchObject({ stiffness: 157.9, damping: 17.09, mass: 1 });
    expect(premium.motion.reduceMotionFadeMs).toBe(150);
  });
});

describe('premium modes', () => {
  it('declares every light token in dark too, with the same kind', () => {
    expect(() => premiumModeLeaves(premium)).not.toThrow();
  });

  it('holds only parseable colour literals', () => {
    const colours = [
      ...premiumLeaves(premium.modes.light),
      ...premiumLeaves(premium.modes.dark),
      ...premiumLeaves(premium.accent),
      ...premiumLeaves(premium.stamp),
      ...premiumLeaves(premium.signal),
    ].flatMap((leaf) => {
      if (leaf.kind === 'color') return [leaf.value];
      if (leaf.kind === 'shadow') return leaf.value.map((l) => l.color);
      return [];
    });
    expect(colours.length).toBeGreaterThan(100);
    for (const colour of colours) expect(() => compositeOver(colour, '#000000')).not.toThrow();
  });

  it('fills glass without a blur with its tint painted on the ground', () => {
    expect(compositeOver('rgba(255,255,255,.56)', '#f5f5f7')).toBe('#fbfbfb');
    expect(premium.modes.light.material.regular.fill).toBe(
      compositeOver(premium.modes.light.material.regular.tint, premium.modes.light.color.ground),
    );
    expect(premium.modes.dark.material.sheet.fill).toBe(
      compositeOver(premium.modes.dark.material.sheet.tint, premium.modes.dark.color.ground),
    );
  });

  it('writes shadows as CSS box-shadow text', () => {
    expect(boxShadow(premium.modes.light.elevation.ink)).toBe(
      'inset 0px 1px 0px 0px rgba(255,255,255,.18), inset 0px 0px 0px 0.5px rgba(255,255,255,.07), ' +
        '0px 1px 2px 0px rgba(20,22,40,.25), 0px 16px 32px -10px rgba(20,22,40,.5)',
    );
  });
});

describe('premium type', () => {
  it('converts tracking from em to pt', () => {
    expect(premium.type.hero.tracking).toBe(-3.3);
    expect(premium.type.display.tracking).toBe(-1.02);
    expect(premium.type.title.tracking).toBe(-0.44);
    expect(premium.type.mono.tracking).toBe(1.44);
    expect(premium.type.body.tracking).toBe(0);
  });
});

describe('premium native outputs', () => {
  const { light } = premiumModeLeaves(premium);

  it('emits both Swift modes with every field', () => {
    expect(swift.startsWith('// Generated')).toBe(true);
    expect(swift).toContain('public struct CPPremiumMode {');
    expect(swift).toContain('colorInk: cpPremiumColor("#1c1d24")');
    expect(swift).toContain('colorInk: cpPremiumColor("#f2f2f5")');
    for (const leaf of light) {
      expect(swift.split(`\n        ${leaf.name}: `)).toHaveLength(3);
    }
    expect(swift).toContain(
      'public static let snappy = CPPremiumSpring(response: 0.3, dampingFraction: 0.86, bounce: 0.14)',
    );
    expect(swift).toContain(
      'public static let hero = CPPremiumType(family: .system, size: 66, weight: .heavy, tracking: -3.3, maxScale: 1)',
    );
  });

  it('emits both Kotlin modes with every field', () => {
    expect(kotlin).toContain('package app.critterpass.designtokens');
    expect(kotlin).toContain('data class CpPremiumMode(');
    for (const leaf of light) {
      expect(kotlin.split(`\n        ${leaf.name} = `)).toHaveLength(3);
    }
    expect(kotlin).toContain(
      'val lively = CpPremiumSpring(dampingRatio = 0.68f, stiffness = 157.9f)',
    );
    expect(kotlin).toContain('const val REDUCE_MOTION_FADE_MS: Int = 150');
  });
});
