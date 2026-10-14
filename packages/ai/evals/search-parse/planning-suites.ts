/**
 * The route suites dispatched by name from ../lib/runner.ts: plain-words search, link import, crew
 * compromise, place facts research, menu reading, and base-set destination texts and critters.
 */
import {
  DESTINATION_CRITTER_SUITE,
  runDestinationCritterSuite,
} from '../destination-critter/suite';
import {
  DESTINATION_DESCRIBE_SUITE,
  runDestinationDescribeSuite,
} from '../destination-describe/suite';
import { FACTS_RESEARCH_SUITE, runFactsResearchSuite } from '../facts-research/suite';
import { LINK_EXTRACT_SUITE, runLinkExtractSuite } from '../link-extract/suite';
import type { RunOptions, SuiteReport } from '../lib/runner';
import { PROVIDER_EXTRACT_SUITE, runProviderExtractSuite } from '../provider-extract/suite';
import { MENU_SUITE, runMenuSuite } from '../menu/suite';
import { PLACE_COMPROMISE_SUITE, runPlaceCompromiseSuite } from '../place-compromise/suite';
import { runSearchParseSuite, SEARCH_PARSE_SUITE } from './suite';

export const PLANNING_SUITES: Readonly<
  Record<string, (options: RunOptions, threshold: number) => Promise<SuiteReport>>
> = {
  [SEARCH_PARSE_SUITE]: runSearchParseSuite,
  [LINK_EXTRACT_SUITE]: runLinkExtractSuite,
  [PLACE_COMPROMISE_SUITE]: runPlaceCompromiseSuite,
  [FACTS_RESEARCH_SUITE]: runFactsResearchSuite,
  [PROVIDER_EXTRACT_SUITE]: runProviderExtractSuite,
  [MENU_SUITE]: runMenuSuite,
  [DESTINATION_DESCRIBE_SUITE]: runDestinationDescribeSuite,
  [DESTINATION_CRITTER_SUITE]: runDestinationCritterSuite,
};
