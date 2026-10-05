/**
 * Probes DeepSeek's server-side web search with free-form questions (photo URLs, live state):
 * prints each search query, the result URLs and the answer's first lines, plus tokens.
 */
const base = process.env.ANTHROPIC_BASE_URL || 'https://api.deepseek.com/anthropic';

async function ask(question: string): Promise<void> {
  const started = performance.now();
  const response = await fetch(`${base.replace(/\/$/u, '')}/v1/messages`, {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY ?? '',
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'deepseek-v4-pro',
      max_tokens: 1200,
      thinking: { type: 'disabled' },
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 2 }],
      messages: [
        { role: 'user', content: `${question} Answer in two sentences and list your source URLs.` },
      ],
    }),
    signal: AbortSignal.timeout(120_000),
  });
  const body = (await response.json()) as {
    content?: {
      type: string;
      text?: string;
      input?: { query?: string };
      content?: { url?: string }[];
    }[];
    usage?: { input_tokens?: number; output_tokens?: number; server_tool_use?: unknown };
  };
  const urls: string[] = [];
  const queries: string[] = [];
  let text = '';
  for (const block of body.content ?? []) {
    if (block.type === 'server_tool_use') queries.push(block.input?.query ?? '');
    if (block.type === 'web_search_tool_result' && Array.isArray(block.content))
      urls.push(...block.content.map((r) => r.url ?? ''));
    if (block.type === 'text') text += block.text ?? '';
  }
  console.log(
    `\n## ${question} (${response.status}, ${Math.round(performance.now() - started)} ms, in ${body.usage?.input_tokens} out ${body.usage?.output_tokens})`,
  );
  console.log(`queries: ${queries.join(' | ')}`);
  console.log(
    `results: ${urls
      .filter((u) => URL.canParse(u))
      .map((u) => new URL(u).hostname)
      .join(', ')}`,
  );
  console.log(
    `image-like URLs in answer: ${(text.match(/https?:\/\/\S+\.(?:jpe?g|png|webp)/giu) ?? []).length}`,
  );
  console.log(`answer: ${text.replace(/\s+/gu, ' ').slice(-420)}`);
}

await Promise.all(process.argv.slice(2).map(ask));
