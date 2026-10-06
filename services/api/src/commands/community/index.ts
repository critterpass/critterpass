/**
 * Community commands on one registry: publishing a crew plan with every participant's consent,
 * looking after it, saving and copying other crews' plans, and rating the places a trip visited.
 * Reporting a plan goes through `report_content` with the `shared_plan` moderation kind.
 */
import type { LinkEnvironment } from '@cp/domain';

import { registerCommunityModerationKinds } from '../../admin/community/moderation';
import type { CommandRegistry } from '../_framework/registry';
import {
  copySharedPlanCommand,
  saveSharedPlanCommand,
  suggestSharedPlanCommand,
  unsaveSharedPlanCommand,
} from './copy-shared-plan';
import {
  createPlanLinkCommand,
  revokePlanLinkCommand,
  unpublishSharedPlanCommand,
  updateSharedPlanCommand,
} from './manage-shared-plan';
import {
  publishSharedPlanCommand,
  respondPublishConsentCommand,
  withdrawPublishConsentCommand,
} from './publish-shared-plan';
import { ratePlacesCommand } from './rate-places';

export function registerCommunityCommands(
  registry: CommandRegistry,
  linkEnv: LinkEnvironment = 'development',
): void {
  registerCommunityModerationKinds();
  registry.register(publishSharedPlanCommand);
  registry.register(respondPublishConsentCommand);
  registry.register(withdrawPublishConsentCommand);
  registry.register(updateSharedPlanCommand);
  registry.register(unpublishSharedPlanCommand);
  registry.register(createPlanLinkCommand(linkEnv));
  registry.register(revokePlanLinkCommand);
  registry.register(saveSharedPlanCommand);
  registry.register(unsaveSharedPlanCommand);
  registry.register(copySharedPlanCommand);
  registry.register(suggestSharedPlanCommand);
  registry.register(ratePlacesCommand);
}
