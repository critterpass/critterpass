/**
 * A member's chosen face (a photo, a critter, a guide) by their user id, for every avatar. The
 * component library only defines the question; the profile area answers it once at the app root,
 * so an `Avatar` given a `uid` draws that member's face without its caller reading anything.
 * Outside the provider (a lab scene, a test) everyone keeps their initial.
 */
import { createContext, useContext, type ReactNode } from 'react';
import type { ImageSourcePropType } from 'react-native';

/** What an avatar draws in its circle instead of the initial; empty for the initial. */
export interface MemberFace {
  readonly photo?: ImageSourcePropType;
  /** A sticker sized for a circle of the asked diameter. */
  readonly critter?: ReactNode;
}

/** The face `uid` wears, for a circle `diameter` points across. */
export type MemberFaceResolver = (uid: string, diameter: number) => MemberFace;

const NO_FACE: MemberFace = {};

const MemberFaceContext = createContext<MemberFaceResolver | null>(null);

export interface MemberFaceProviderProps {
  readonly resolve: MemberFaceResolver;
  readonly children: ReactNode;
}

/** Mounted once above the screens; a new `resolve` redraws the avatars that carry a `uid`. */
export function MemberFaceProvider({ resolve, children }: MemberFaceProviderProps) {
  return <MemberFaceContext.Provider value={resolve}>{children}</MemberFaceContext.Provider>;
}

/** The face of `uid`, or no face without a `uid` or a provider. */
export function useMemberFace(uid: string | null | undefined, diameter: number): MemberFace {
  const resolve = useContext(MemberFaceContext);
  if (resolve === null || uid === null || uid === undefined) return NO_FACE;
  return resolve(uid, diameter);
}
