/**
 * A live local query with bound parameters for the wallet: runs now and again whenever one of `tables`
 * changes, with `loaded` false until the first delivery. `null` params skip the query (something
 * it depends on is not known yet). The app's shared hook, in the form where a failed read is not an
 * answer.
 */
export {
  useQuietLiveRows as useLiveRows,
  type QuietLiveRows as LiveRows,
} from '@/data/powersync/live-rows';
