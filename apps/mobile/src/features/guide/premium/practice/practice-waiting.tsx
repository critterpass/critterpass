/** Practice before its phrases are on the phone: the loading critter. */
import { t } from '@lingui/core/macro';

import { LoadingCritter } from '@/ui/premium';

export function PremiumPracticeWaiting() {
  return (
    <LoadingCritter
      label={t({ id: 'guide.premium.practice.opening', message: 'Opening your phrases…' })}
      testID="guide-practice-waiting"
    />
  );
}
