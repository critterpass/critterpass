/**
 * One card at a time inside a stack that is itself a sheet or page sheet (iOS): its sheet and
 * modal screens push inside that card with a back `<` instead of rising as a second card over it.
 * A group the root presents as a sheet (the guide thread, a crew sheet) holds its own native stack,
 * so a push there stays inside the sheet. Android rises such a group as a page, where a sheet over
 * it is one card already.
 */
import type { NativeStackNavigationOptions } from 'expo-router/native-stack';
import {
  Children,
  cloneElement,
  createContext,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';
import { Platform } from 'react-native';

type Presentation = NativeStackNavigationOptions['presentation'];

const CARDS: ReadonlySet<Presentation> = new Set<Presentation>(['formSheet', 'modal', 'pageSheet']);

/** True for a presentation that shows as a card over what opened it (a sheet or page sheet). */
export function isCardPresentation(presentation: Presentation | null | undefined): boolean {
  return presentation != null && CARDS.has(presentation);
}

/** True when a stack shown with this presentation pushes its sheets inside itself. */
export function holdsItsSheets(
  groupPresentation: Presentation | null | undefined,
  os: typeof Platform.OS = Platform.OS,
): boolean {
  return os === 'ios' && isCardPresentation(groupPresentation);
}

/** True inside a stack that a sheet holds: a stack nested in it is inside the same card. */
export const InsideCardContext = createContext(false);

/** A sheet's or modal's options as a push inside the card that holds the stack. */
export function pushedInsideCard(
  options: NativeStackNavigationOptions,
): NativeStackNavigationOptions {
  if (!isCardPresentation(options.presentation)) return options;
  const {
    presentation: _presentation,
    sheetAllowedDetents: _detents,
    sheetGrabberVisible: _grabber,
    sheetCornerRadius: _corner,
    contentStyle: _content,
    ...rest
  } = options;
  return { ...rest, presentation: 'card' };
}

interface ScreenElementProps {
  readonly name?: unknown;
  readonly options?: unknown;
}

function screenProps(child: ReactNode): ScreenElementProps | null {
  return isValidElement<ScreenElementProps>(child) ? child.props : null;
}

/** The presentation each `Stack.Screen` child asks for in its own options, by route name. */
export function childPresentations(children: ReactNode): ReadonlyMap<string, Presentation> {
  const found = new Map<string, Presentation>();
  Children.forEach(children, (child) => {
    const props = screenProps(child);
    if (
      typeof props?.name !== 'string' ||
      typeof props.options !== 'object' ||
      props.options === null
    )
      return;
    const { presentation } = props.options as NativeStackNavigationOptions;
    if (presentation !== undefined) found.set(props.name, presentation);
  });
  return found;
}

/** The `Stack.Screen` children with their sheet options turned into pushes inside the card. */
export function childrenInsideCard(children: ReactNode): ReactNode {
  return Children.map(children, (child) => {
    const props = screenProps(child);
    if (props === null || typeof props.options !== 'object' || props.options === null) return child;
    return cloneElement(child as ReactElement<ScreenElementProps>, {
      options: pushedInsideCard(props.options as NativeStackNavigationOptions),
    });
  });
}
