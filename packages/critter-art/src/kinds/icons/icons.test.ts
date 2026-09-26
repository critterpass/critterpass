import { describe, expect, it } from 'vitest';

import { loadDesignDoodleKit } from '../../core/design-doodle-kit-reference';
import { buildBothOps, fixtureOptions } from '../design-kind-fixture';
import type { KindFn } from '../registry';
import { arrow, circle, squiggle, underline } from './annotations';
import { cal, chat, egg, flame, lock, star } from './badges';
import { bed, bell, boat, pin, ticket, wallet } from './objects';
import { camera, check, food, heart, temple, wave } from './scenes';
import { car, plane, rain, spark, sun, volcano } from './weather';

const ICONS: Readonly<Record<string, KindFn>> = {
  egg,
  star,
  flame,
  lock,
  chat,
  cal,
  pin,
  bed,
  ticket,
  boat,
  wallet,
  bell,
  sun,
  rain,
  spark,
  plane,
  car,
  volcano,
  wave,
  temple,
  camera,
  food,
  check,
  heart,
  underline,
  circle,
  arrow,
  squiggle,
};

describe('icons', () => {
  const { K } = loadDesignDoodleKit();

  it.each(Object.keys(ICONS))('%s matches the design op sequence with defaults', (name) => {
    const designFn = K[name];
    if (!designFn) throw new Error(`design/doodles.js no longer exports K.${name}`);
    const { ours, design } = buildBothOps(ICONS[name]!, designFn, 7, '#221e19', fixtureOptions());
    expect(ours).toEqual(design);
  });

  it.each(Object.keys(ICONS))('%s matches the design op sequence with an accent override', (name) => {
    const designFn = K[name];
    if (!designFn) throw new Error(`design/doodles.js no longer exports K.${name}`);
    const options = fixtureOptions({ accent: '#4f86ff' });
    const { ours, design } = buildBothOps(ICONS[name]!, designFn, 12, '#221e19', options);
    expect(ours).toEqual(design);
  });

  it('egg matches the design op sequence for the crack pose', () => {
    const designEgg = K['egg'];
    if (!designEgg) throw new Error('design/doodles.js no longer exports K.egg');
    const options = fixtureOptions({ pose: 'crack', fill: '#fff1d6', spot: '#ff9a4d' });
    const { ours, design } = buildBothOps(egg, designEgg, 12, '#221e19', options);
    expect(ours).toEqual(design);
  });

  it('every icon is registered under its own name', () => {
    expect(Object.keys(ICONS)).toHaveLength(28);
  });
});
