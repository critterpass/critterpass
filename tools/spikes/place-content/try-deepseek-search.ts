/**
 * Checks whether DeepSeek's Anthropic-compatible API runs the server-side web search tool: one
 * place, prints the tool calls, the cited URLs and the token counts (never the key).
 */
const base = process.env.ANTHROPIC_BASE_URL || 'https://api.deepseek.com/anthropic';
const model = process.argv[2] ?? 'deepseek-v4-pro';
const started = performance.now();
const response = await fetch(`${base.replace(/\/$/u, '')}/v1/messages`, {
  method: 'POST',
  headers: {
    'x-api-key': process.env.ANTHROPIC_API_KEY ?? '',
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json',
  },
  body: JSON.stringify({
    model,
    max_tokens: 2000,
    thinking: { type: 'disabled' },
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
    messages: [
      {
        role: 'user',
        content:
          'Thác Datanla (Datanla Falls), Đà Lạt, Vietnam: search the web and give the adult entrance fee and opening hours, each with the URL it came from.',
      },
    ],
  }),
  signal: AbortSignal.timeout(120_000),
});
const body = (await response.json()) as {
  content?: {
    type: string;
    text?: string;
    name?: string;
    input?: unknown;
    content?: unknown;
    citations?: unknown[];
  }[];
  usage?: unknown;
  error?: unknown;
};
console.log(
  'status',
  response.status,
  'ms',
  Math.round(performance.now() - started),
  'model',
  model,
);
if (body.error !== undefined) console.log('error', JSON.stringify(body.error).slice(0, 300));
for (const block of body.content ?? []) {
  if (block.type === 'text')
    console.log(
      'TEXT',
      (block.text ?? '').slice(0, 400),
      'citations',
      (block.citations ?? []).length,
    );
  else console.log(block.type, JSON.stringify(block.input ?? block.content ?? '').slice(0, 300));
}
console.log('usage', JSON.stringify(body.usage));
