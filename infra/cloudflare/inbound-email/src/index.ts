/**
 * The Email Worker entry: Cloudflare Email Routing's catch-all hands every unmatched message of the
 * zone to `email()`, which runs the handler with the real bindings, the platform's `fetch`, replies
 * sent through `message.reply` (threaded, from the crew address), `message.forward` and log lines
 * for Workers Logs.
 */
import { EmailMessage } from 'cloudflare:email';

import { handleInbound, type InboundEnv } from './handler';

export default {
  async email(message: ForwardableEmailMessage, env: InboundEnv): Promise<void> {
    await handleInbound(message, env, {
      fetch: (input, init) => fetch(input, init),
      now: () => new Date(),
      newId: () => crypto.randomUUID(),
      reply: async (raw) => {
        await message.reply(new EmailMessage(message.to, message.from, raw));
      },
      forward: async (to) => {
        await message.forward(to);
      },
      // One JSON line per message for Workers Logs (outcomes and verdicts only).
      log: (entry) => {
        console.log(JSON.stringify(entry));
      },
    });
  },
} satisfies ExportedHandler<InboundEnv>;
