import { PremiumQuestsScene } from '@/features/critters/premium/quests/quests-scene';
import { QuestsScreen } from '@/features/critters/quests/quests-screen';
import { premiumRoute } from '@/lib/premium-ui';

function CurrentQuestsRoute() {
  return <QuestsScreen />;
}

function PremiumQuestsRoute() {
  return <QuestsScreen View={PremiumQuestsScene} />;
}

/** Crew quests (3l-7): the crew's level, today's quests and their shared reward moment. */
export default premiumRoute({ premium: PremiumQuestsRoute, legacy: CurrentQuestsRoute });
