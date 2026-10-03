/**
 * Card 7, the stamp (3m-8): the passport page with older stamps faded, the trip's stamp slamming
 * down in the guide's ink, and the crew's signatures writing themselves around it in their own
 * colours, one after another, and live as each traveller opens the recap on their phone.
 */
import { View } from 'react-native';

import { Stamp } from '@/ui/documents/Stamp';
import { StampSpread } from '@/ui/recap/StampSpread';
import { useTheme } from '@/ui/theme';

import { WrittenSignature } from '../signature/written-signature';
import { fetchStroke, useStroke, type StrokeFetch } from '../signature/stroke-store';
import { useCardTimeline } from '../story/use-card-timeline';
import { CardShell } from './card-shell';

const SLAM_MS = 500;
const SIGN_GAP_MS = 700;

export interface StampSigner {
  readonly userId: string;
  readonly name: string;
  readonly color: string;
  readonly strokeKey: string | null;
}

export interface StampCardProps {
  readonly chrome: string;
  readonly page: string | null;
  readonly place: string;
  readonly top: string;
  readonly bottom: string;
  readonly ink: string;
  readonly older: readonly { readonly id: string; readonly title: string; readonly ink: string }[];
  readonly signers: readonly StampSigner[];
  readonly caption: string;
  readonly detail: string;
  readonly loadStroke?: StrokeFetch;
}

function Signer({
  signer,
  written,
  load,
}: {
  readonly signer: StampSigner;
  readonly written: boolean;
  readonly load: StrokeFetch;
}) {
  const stroke = useStroke(signer.strokeKey, load);
  return (
    <WrittenSignature
      name={signer.name}
      color={signer.color}
      stroke={stroke}
      written={written}
      testID={`recap-signature-${signer.userId}`}
    />
  );
}

export function StampCard(props: StampCardProps) {
  const theme = useTheme();
  const load = props.loadStroke ?? fetchStroke;
  const steps = [SLAM_MS, ...props.signers.map((_, index) => SLAM_MS + 600 + index * SIGN_GAP_MS)];
  const reached = useCardTimeline(steps);
  return (
    <CardShell ground={theme.color.paper.base} tone="paper" testID="recap-card-stamp">
      <StampSpread
        chrome={props.chrome}
        {...(props.page === null ? {} : { page: props.page })}
        older={
          props.older.length === 0 ? undefined : (
            <View style={{ flexDirection: 'row', gap: theme.space['8'] }}>
              {props.older.map((stamp) => (
                <Stamp key={stamp.id} title={stamp.title} ink={stamp.ink} size={96} tilt={-8} />
              ))}
            </View>
          )
        }
        stamp={
          reached > 0 ? (
            <Stamp
              title={props.place}
              top={props.top}
              bottom={props.bottom}
              ink={props.ink}
              size={190}
              tilt={-6}
              slam
              testID="recap-stamp"
            />
          ) : (
            <View style={{ height: 190 }} />
          )
        }
        signatures={
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: theme.space['8'],
            }}
            testID="recap-signatures"
          >
            {props.signers.map((signer, index) => (
              <Signer
                key={signer.userId}
                signer={signer}
                written={reached > index + 1}
                load={load}
              />
            ))}
          </View>
        }
        caption={props.caption}
        detail={props.detail}
      />
    </CardShell>
  );
}
