import type { AnyJobDefinition } from '../boss/define-job';
import { contentEmbedJob } from './embed';
import { contentPublishJob } from './publish';

export { publishRelease } from './publish';

/** Content release jobs: publish approved releases and embed help articles. */
export function contentJobs(): AnyJobDefinition[] {
  return [contentPublishJob(), contentEmbedJob()];
}
