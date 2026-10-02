/**
 * Widget refresh jobs: `widgets.refresh` (one per event, fanned out to the installs it concerns)
 * and `widgets.push` (one install's own push: the trailing one after its debounce window, or a
 * retry the provider asked for), plus the hook that queues a refresh for every event the worker
 * appends.
 */
import { onEventAppended } from '@cp/db';
import {
  WIDGET_QUEUES,
  widgetsPushJobSchema,
  widgetsRefreshJobSchema,
  type WidgetsPushJob,
  type WidgetsRefreshJob,
} from '@cp/domain';

import { defineJob, JobAttemptError, type AnyJobDefinition, type JobDefinition } from '../../boss';
import {
  loadTarget,
  pushToDevice,
  refreshWidgets,
  widgetEventHook,
  WIDGETS_PUSH_SWITCH,
  type WidgetPushDeps,
} from './refresh';

export { decideWidgetPush } from './debounce';
export {
  refreshWidgets,
  pushToDevice,
  loadTarget,
  widgetEventHook,
  type WidgetPushDeps,
} from './refresh';

export function widgetsRefreshJob(deps: WidgetPushDeps): JobDefinition<WidgetsRefreshJob> {
  return defineJob({
    queue: WIDGET_QUEUES.refresh,
    schema: widgetsRefreshJobSchema,
    singletonKey: (job) => job.event_id,
    handler: async (job, ctx) => ({ ...(await refreshWidgets(ctx.pool, deps, job.event_id)) }),
  });
}

export function widgetsPushJob(deps: WidgetPushDeps): JobDefinition<WidgetsPushJob> {
  return defineJob({
    queue: WIDGET_QUEUES.push,
    schema: widgetsPushJobSchema,
    singletonKey: (job) => (job.priority ? `${job.device_id}:priority` : job.device_id),
    handler: async (job, ctx) => {
      if (!(await deps.switches.isOn(WIDGETS_PUSH_SWITCH))) return { outcome: 'switched_off' };
      const target = await loadTarget(ctx.pool, job.device_id);
      if (target === undefined) return { outcome: 'no_widgets' };
      const outcome = await pushToDevice(ctx.pool, deps, target, job.priority);
      // Ran before its window ended, or the provider asked to try again: pg-boss retries.
      if ((outcome === 'retry' || outcome === 'deferred') && !ctx.job.isFinalAttempt) {
        throw new JobAttemptError(`widget push ${outcome}`, { outcome });
      }
      return { outcome };
    },
  });
}

let hooked = false;

export function widgetJobs(deps: WidgetPushDeps): AnyJobDefinition[] {
  if (!hooked) {
    hooked = true;
    onEventAppended(widgetEventHook);
  }
  return [widgetsRefreshJob(deps), widgetsPushJob(deps)];
}
