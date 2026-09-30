/**
 * Help and SOS jobs, wired from the worker's environment. Building them registers the Help and SOS
 * pushes once per process.
 */
import type { AnyJobDefinition } from '../../boss';
import { helpShareExpireJob } from './help-share-expire';
import { registerSafetyNotifications } from './notify';

export { registerSafetyNotifications } from './notify';

let registered = false;

export function safetyJobs(): AnyJobDefinition[] {
  if (!registered) {
    registered = true;
    registerSafetyNotifications();
  }
  return [helpShareExpireJob()];
}
