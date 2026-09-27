/** Brief stage: the kind's generation units, plus reviewer notes when the last batch was rejected. */
import type { AnyKindModule, Brief, KindContext } from '../kinds/types';
import type { StageFiles } from './state';

export async function runBrief(
  module: AnyKindModule,
  ctx: KindContext,
  files: StageFiles,
  notes: Readonly<Record<string, string>> = {},
  log: (line: string) => void = () => undefined,
): Promise<Brief> {
  const base = await module.brief(ctx);
  const withOptions: Brief = { ...base, options: ctx.options };
  const brief: Brief = Object.keys(notes).length === 0 ? withOptions : { ...withOptions, notes };
  files.write('brief', brief);
  log(
    `brief: ${brief.units.length} units${brief.notes ? ` · ${Object.keys(notes).length} reviewer notes` : ''}`,
  );
  return brief;
}
