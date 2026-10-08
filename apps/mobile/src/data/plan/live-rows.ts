/**
 * A live local query with bound parameters: runs now and again whenever one of `tables` changes,
 * with `loaded` false until the first delivery. `null` params skip the query (something it
 * depends on is not known yet). This is the app's shared hook; a failed query is delivered as
 * loaded with `failed` and a `retry`.
 */
export { useLiveRows, type LiveRows } from '@/data/powersync/live-rows';
