/** Driver directory jobs and the tip check handler. */
import type { AnyJobDefinition } from '../../boss/define-job';
import { driverDirectoryMaintenanceJobs } from './maintenance';
import { registerDriverTipCheck } from './tip-check';

export function driverDirectoryJobs(): AnyJobDefinition[] {
  registerDriverTipCheck();
  return driverDirectoryMaintenanceJobs();
}
