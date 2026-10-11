/**
 * The directory screen (6e-1, 6e-3): its data and filters are `useDirectory`.
 */
import { DirectoryView } from './DirectoryView';
import { useDirectory } from './use-directory';

export function DirectoryScreen(props: {
  readonly tripId: string;
  /** The trip's own area, selected first. */
  readonly area: string | null;
}) {
  return <DirectoryView {...useDirectory(props)} />;
}
