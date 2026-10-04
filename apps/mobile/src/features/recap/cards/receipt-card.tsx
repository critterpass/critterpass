/**
 * Card 5, the receipt (3m-6): on orange, "MONEY, WRAPPED" over how the trip came in against the
 * plan, and a receipt that prints line by line with the printer's buzz, the PAID IN FULL stamp
 * slamming on once everyone is square, and your own share under it.
 */
import { useEffect, useRef } from 'react';
import { View } from 'react-native';

import { impact } from '@/motion/feedback';
import { guideSticker } from '@/ui/avatar/guides';
import { InfoPill } from '@/ui/chips/InfoPill';
import { Receipt, type ReceiptLine } from '@/ui/documents/Receipt';
import { Stamp } from '@/ui/documents/Stamp';
import type { GuideId } from '@/ui/people/GuideLine';
import { Sticker } from '@/ui/sticker/Sticker';
import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';

import { useCardTimeline } from '../story/use-card-timeline';
import { CardShell } from './card-shell';

const LINE_GAP_MS = 260;

export interface ReceiptCardProps {
  readonly guide: GuideId;
  readonly eyebrow: string;
  readonly headline: string;
  readonly title: string;
  readonly subtitle: string;
  readonly sections: readonly (readonly ReceiptLine[])[];
  readonly note: string;
  readonly footer: string;
  readonly paidLabel: {
    readonly top: string;
    readonly title: string;
    readonly bottom: string;
  } | null;
  readonly share: string | null;
}

export function ReceiptCard(props: ReceiptCardProps) {
  const theme = useTheme();
  const art = guideSticker(props.guide);
  const count = props.sections.reduce((n, lines) => n + lines.length, 0);
  const steps = Array.from({ length: count + 1 }, (_, index) => 500 + index * LINE_GAP_MS);
  const printed = useCardTimeline(steps);
  const lastBuzz = useRef(0);
  useEffect(() => {
    if (printed > lastBuzz.current && printed <= count) impact('printer');
    lastBuzz.current = printed;
  }, [printed, count]);

  // Each section shows the lines printed so far.
  const starts = props.sections.map((_, index) =>
    props.sections.slice(0, index).reduce((n, lines) => n + lines.length, 0),
  );
  const sections = props.sections
    .map((lines, index) => lines.slice(0, Math.max(0, printed - (starts[index] ?? 0))))
    .filter((lines) => lines.length > 0);
  const done = printed > count;
  return (
    <CardShell
      ground={theme.color.orange}
      tone="accent"
      halftone
      eyebrow={props.eyebrow}
      eyebrowColor={theme.semantic.text.onAccent}
      headline={props.headline}
      testID="recap-card-receipt"
    >
      <View style={{ marginTop: theme.space['16'] }}>
        <Receipt
          art={
            <View style={{ alignItems: 'center', gap: theme.space['4'] }}>
              <Sticker kind={art.kind} name={art.name} size={40} />
              <Text variant="title" testID="recap-receipt-title">
                {props.title}
              </Text>
              <Text variant="monoData">{props.subtitle}</Text>
            </View>
          }
          sections={sections}
          {...(done ? { note: props.note } : {})}
          footer={props.footer}
          accessibilityLabel={[
            props.headline,
            props.title,
            ...props.sections.flat().map((l) => `${l.label} ${l.amount}`),
          ].join(', ')}
          testID="recap-receipt"
        />
        {done && props.paidLabel !== null ? (
          // Over the receipt's corner, clear of its title, as the render sets it.
          <View style={{ position: 'absolute', top: -theme.space['24'], end: -theme.space['12'] }}>
            <Stamp
              title={props.paidLabel.title}
              top={props.paidLabel.top}
              bottom={props.paidLabel.bottom}
              ink={theme.color.green.deep}
              shape="round"
              size={96}
              tilt={-12}
              slam
              testID="recap-receipt-paid"
            />
          </View>
        ) : null}
      </View>
      {done && props.share !== null ? (
        <InfoPill testID="recap-receipt-share">{props.share}</InfoPill>
      ) : null}
    </CardShell>
  );
}
