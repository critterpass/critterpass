import { type StackMember } from '@/ui/people/AvatarStack';

export interface GapIdeaView {
  readonly key: string;
  readonly title: string;
  readonly body: string;
  readonly tags: readonly IdeaTag[];
}

export interface GapViewProps {
  readonly window: string;
  readonly title: string;
  readonly free: readonly StackMember[];
  readonly context: string;
  readonly eyebrow: string;
  readonly state: 'loading' | 'none' | 'ready';
  readonly empty: string;
  readonly ideas: readonly GapIdeaView[];
  readonly picked: string | null;
  readonly onPick: (key: string) => void;
  readonly add: { readonly label: string; readonly busy: boolean; readonly onPress: () => void };
  readonly elseLabel: string;
  readonly onElse: () => void;
  readonly onDismiss?: () => void;
}

export interface IdeaTag {
  readonly label: string;
  /** The fill; absent draws the quiet tag. */
  readonly color?: string | undefined;
}

export interface IdeaCardProps {
  readonly title: string;
  readonly body: string;
  readonly tags: readonly IdeaTag[];
  readonly selected: boolean;
  readonly onSelect: () => void;
  readonly testID?: string | undefined;
}
