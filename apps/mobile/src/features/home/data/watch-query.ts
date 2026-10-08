/**
 * A live local query with bound parameters: runs now and again whenever one of `tables` changes.
 * `useLiveRows` keeps the latest rows as state, with `loaded` false until the first delivery;
 * `null` params skip the query (a value it depends on is not known yet). The app's shared hooks, in
 * the form where a failed read is not an answer.
 */
export {
  useQuietLiveRows as useLiveRows,
  watchQuery,
  type QuietLiveRows as LiveRows,
} from '@/data/powersync/live-rows';
