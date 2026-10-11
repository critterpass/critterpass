/**
 * One payment (its data and actions are `usePayment`). "It didn't arrive" asks first in a sheet,
 * since it tells a crewmate their payment is disputed.
 */
import { useState } from 'react';

import { MoneyNoTripScreen, MoneyScreenLoading, PaymentGone } from '../components/screen-states';
import { DisputeSheet } from './DisputeSheet';
import { PaymentDetail } from './PaymentDetail';
import { usePayment } from './use-payment';

export function PaymentScreen({
  id,
  tripId: routeTripId = null,
}: {
  readonly id: string;
  readonly tripId?: string | null;
}) {
  const payment = usePayment(id, routeTripId);
  const [disputing, setDisputing] = useState(false);
  if (payment.kind === 'loading') return <MoneyScreenLoading />;
  if (payment.kind === 'no-trip') return <MoneyNoTripScreen crew={payment.crew} />;
  if (payment.kind === 'gone') return <PaymentGone />;
  return (
    <>
      <PaymentDetail
        row={payment.row}
        fromName={payment.fromName}
        toName={payment.toName}
        reveal={payment.reveal}
        method={payment.method}
        amountDigits={payment.amountDigits}
        amountValid={payment.amountValid}
        busy={payment.busy}
        onMethod={payment.onMethod}
        onAmount={payment.onAmount}
        onMarkPaid={payment.onMarkPaid}
        onRequest={payment.onRequest}
        onNudge={payment.onNudge}
        onConfirm={payment.onConfirm}
        onDispute={() => setDisputing(true)}
        onCopy={payment.onCopy}
        onOpen={payment.onOpen}
      />
      {disputing ? (
        <DisputeSheet
          payerName={payment.fromName}
          onCancel={() => setDisputing(false)}
          onConfirm={(note) => {
            setDisputing(false);
            payment.onDispute(note);
          }}
        />
      ) : null}
    </>
  );
}
