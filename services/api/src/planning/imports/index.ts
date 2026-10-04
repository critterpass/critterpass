/** The Add from a link module: its preview and import routes, mounted from the planning aggregator. */
import type { PlanningModule } from '../register';
import { planningGateway } from '../search/gateway';
import { tripStaySource } from '../stay';
import { planningGemini } from './gemini';
import { registerImportRoutes } from './routes';

export const importsModule: PlanningModule = ({ app, doors, env }) => {
  registerImportRoutes(app, {
    pool: doors.pool,
    sessions: doors.sessions,
    redis: doors.redis,
    gateway: planningGateway(env, doors.pool),
    gemini: planningGemini(env.GEMINI_API_KEY, doors.pool),
    readers: { fetch: (input, init) => fetch(input, init), youtubeApiKey: env.YOUTUBE_API_KEY },
    // A match's best day on stored legs and straight lines only: no router call, no cache write.
    fit: { stays: tripStaySource, now: () => new Date() },
  });
};
