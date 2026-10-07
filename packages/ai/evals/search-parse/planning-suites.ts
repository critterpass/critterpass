/**
 * The route suites dispatched by name from ../lib/runner.ts: plain-words search, link import, crew
 * compromise, place facts research and menu reading.
 */
import { FACTS_RESEARCH_SUITE, runFactsResearchSuite } from '../facts-research/suite';
import { LINK_EXTRACT_SUITE, runLinkExtractSuite } from '../link-extract/suite';
import type { RunOptions, SuiteReport } from '../lib/runner';
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
  [MENU_SUITE]: runMenuSuite,
};
