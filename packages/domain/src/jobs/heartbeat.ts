/** Each worker instance refreshes `<prefix><instance>` (with a TTL) and joins the instance set. */
export const WORKER_HEARTBEAT_KEY_PREFIX = 'worker:heartbeat:';
export const WORKER_HEARTBEAT_SET = 'worker:heartbeats';
export const WORKER_HEARTBEAT_TTL_SECONDS = 30;
