import { Link } from '@tanstack/react-router';

/** Switches between the batch review and the opening-hours verification queue. */
export function ContentTabs({ current }: { current: 'batches' | 'hours' }) {
  return (
    <nav className="tabs" aria-label="Content review">
      <Link
        to="/content"
        className={current === 'batches' ? 'btn btn-primary' : 'btn'}
        aria-current={current === 'batches' ? 'page' : undefined}
      >
        Batches
      </Link>
      <Link
        to="/content/hours"
        className={current === 'hours' ? 'btn btn-primary' : 'btn'}
        aria-current={current === 'hours' ? 'page' : undefined}
      >
        Opening hours
      </Link>
    </nav>
  );
}
