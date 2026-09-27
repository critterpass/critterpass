/** Render stage: the kind's review images (contact sheets for critters and forms), if it has any. */
import { parseItems } from '@cp/content';

import type { AnyKindModule, KindContext, RenderedItem } from '../kinds/types';
import { required, type StageFiles } from './state';

export async function runRender(
  module: AnyKindModule,
  ctx: KindContext,
  files: StageFiles,
  log: (line: string) => void = () => undefined,
): Promise<readonly RenderedItem[]> {
  if (module.render === undefined) return [];
  const items = parseItems(module.kind, required(files.items(), 'items'));
  const rendered = await module.render(ctx, items, files.paths.dir);
  files.write('renders', rendered);
  log(`render: ${rendered.length} review images in ${files.paths.dir}`);
  return rendered;
}
