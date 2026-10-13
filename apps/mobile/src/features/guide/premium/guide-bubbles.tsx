/**
 * The guide thread's bubbles (5.14): a question (the asker's own on the right in ink, a crewmate's
 * on the left with their avatar), the guide's answer beside its disc, and the guide's disc itself
 * (the guide's critter on the Tokek yellow).
 */
import { t } from '@lingui/core/macro';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { guideSticker } from '@/ui/premium/stickers/guides';
import { Avatar, CritterSticker, Text, makePremiumStyles, usePremiumTheme } from '@/ui/premium';

const useStyles = makePremiumStyles((th) => ({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: th.space.gap8 },
  mine: {
    alignSelf: 'flex-end',
    maxWidth: '82%',
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderBottomRightRadius: 6,
    backgroundColor: th.color.ink,
  },
  theirs: {
    flexShrink: 1,
    maxWidth: '82%',
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderBottomLeftRadius: 6,
    backgroundColor: th.color.card,
    boxShadow: th.shadow.card,
  },
  answer: { flex: 1, gap: th.space.gap10 },
}));

export function GuideDisc({
  slug,
  name,
  size,
  pose,
}: {
  readonly slug: string;
  readonly name: string;
  readonly size: number;
  readonly pose?: 'think' | 'sleep';
}) {
  const th = usePremiumTheme();
  const kind = guideSticker(slug).kind;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'flex-end',
        backgroundColor: pose === 'think' ? th.color.status.maybe.bg : th.accent.sun,
      }}
      accessibilityLabel={name}
    >
      <CritterSticker
        kind={kind}
        name={name}
        size={size * 0.94}
        edge={false}
        {...(pose === undefined ? {} : { pose })}
      />
    </View>
  );
}

export function GuideQuestion({
  text,
  author,
  faded = false,
  testID,
}: {
  readonly text: string;
  /** A crewmate's question; null for the asker's own. */
  readonly author: { readonly name: string; readonly color: string } | null;
  readonly faded?: boolean;
  readonly testID?: string;
}) {
  const styles = useStyles();
  if (author === null) {
    return (
      <View style={[styles.mine, faded ? { opacity: 0.6 } : null]} testID={testID}>
        <Text variant="body" tone="onInk">
          {text}
        </Text>
      </View>
    );
  }
  return (
    <View style={styles.row} testID={testID}>
      <Avatar name={author.name} color={author.color} size={28} />
      <View style={styles.theirs}>
        <Text variant="body">{text}</Text>
      </View>
    </View>
  );
}

/** The guide's answer: its disc, then the words in a white bubble and anything under them. */
export function GuideAnswerRow({
  slug,
  guideName,
  text,
  children,
  testID,
}: {
  readonly slug: string;
  readonly guideName: string;
  readonly text: string;
  readonly children?: ReactNode;
  readonly testID?: string;
}) {
  const styles = useStyles();
  return (
    <View style={[styles.row, { alignItems: 'flex-start' }]} testID={testID}>
      <GuideDisc slug={slug} name={guideName} size={28} />
      <View style={styles.answer}>
        {text === '' ? null : (
          <View style={[styles.theirs, { maxWidth: '100%', alignSelf: 'flex-start' }]}>
            <Text variant="body">{text}</Text>
          </View>
        )}
        {children}
      </View>
    </View>
  );
}

/** A small muted line under a message ("✓ Answered", "Read"). */
export function MessageNote({
  text,
  tone = 'muted',
  align = 'right',
}: {
  readonly text: string;
  readonly tone?: 'muted' | 'done';
  readonly align?: 'left' | 'right';
}) {
  const th = usePremiumTheme();
  return (
    <Text
      variant="captionMuted"
      align={align}
      {...(tone === 'done' ? { color: th.color.status.booked.text } : { tone: 'muted' as const })}
    >
      {text}
    </Text>
  );
}

export function answeredNote(): string {
  return t({ id: 'guide.premium.answered', message: '✓ Answered' });
}
