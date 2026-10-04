/** The plan check's commands, registered from the fixers module of the planning aggregator. */
import type { CommandRegistry } from '../_framework/registry';

import type { FixerDeps } from '../../planning/fixers/check-input';
import { answerMemberAskCommand } from './answer-member-ask';
import { applyCheckFixCommand } from './apply-check-fix';
import { askMemberAboutSavesCommand } from './ask-member-about-saves';
import { keepCheckIssueCommand } from './keep-check-issue';

export function registerCheckCommands(registry: CommandRegistry, deps: FixerDeps): void {
  registry.register(applyCheckFixCommand(deps));
  registry.register(askMemberAboutSavesCommand(deps));
  registry.register(answerMemberAskCommand);
  registry.register(keepCheckIssueCommand);
}
