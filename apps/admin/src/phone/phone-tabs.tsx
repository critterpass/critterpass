/**
 * Phone check-ins (≤ 480 px, same SPA): bottom tabs HOME / MY WORK / QUEUES / MORE with their
 * `/counts` badges. MORE opens the full grouped navigation as a sheet. Hidden on wider screens.
 */
import { canOpenAdminArea } from '@cp/domain';
import { Link } from '@tanstack/react-router';

import { CountBadge, useCounts } from '../app/nav';
import { useOperator } from '../lib/session';

export function PhoneTabs({ moreOpen, onMore }: { moreOpen: boolean; onMore: () => void }) {
  const me = useOperator();
  const counts = useCounts();
  const queues = canOpenAdminArea(me.roles, 'moderation').ok ? '/moderation' : '/work';
  return (
    <nav className="phone-tabs" aria-label="Phone tabs">
      <Link to="/" className="phone-tab" activeOptions={{ exact: true }}>
        Home
      </Link>
      <Link to="/work" className="phone-tab">
        My work
        <CountBadge counts={counts.data} area="work" />
      </Link>
      <Link to={queues} className="phone-tab">
        Queues
        {queues === '/moderation' && <CountBadge counts={counts.data} area="moderation" />}
      </Link>
      <button type="button" className="phone-tab" aria-expanded={moreOpen} onClick={onMore}>
        More
      </button>
    </nav>
  );
}
