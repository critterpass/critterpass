/**
 * The critters area's public surface for other areas: the guide's look (an owned form of the
 * guide's own critter), for every place the guide's sticker is drawn, and the session's encounter
 * engine, whose snapshot the critter-nearby Live Activity follows.
 */
export { useGuideSkin } from './detail/guide-skin';
export { encounterEngine } from './engine/session';
