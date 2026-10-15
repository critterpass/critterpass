/**
 * Manual spot check: runs each query given on the command line through the same Tavily search and
 * prints the top results short, for a person to read against a profile's facts.
 */
import { search } from './lib';

for (const query of process.argv.slice(2)) {
  console.log(`\n## ${query}`);
  for (const page of await search(query, 4)) {
    console.log(`- ${page.url}\n  ${page.text.replace(/\s+/gu, ' ').slice(0, 300)}`);
  }
}
