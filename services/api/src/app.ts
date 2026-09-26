import { OpenAPIHono } from '@hono/zod-openapi';
import { Scalar } from '@scalar/hono-api-reference';
import { bodyLimit } from 'hono/body-limit';
import { requestId, type RequestIdVariables } from 'hono/request-id';
import type { Logger } from 'pino';

import { registerHealthRoutes, type ReadinessCheck } from './routes/health';

export interface AppDeps {
  service: string;
  version: string;
  commit: string;
  logger: Logger;
  readiness: Record<string, ReadinessCheck>;
  /** Serves the Scalar API reference at /docs (never in production). */
  exposeDocs: boolean;
}

export type AppEnv = { Variables: RequestIdVariables };

/** Wire error body shared by every route (docs/api-contracts.md §1, §3). */
function errorBody(code: string, message: string, retryable: boolean) {
  return { error: { code, message, retryable } };
}

const MAX_BODY_BYTES = 1024 * 1024;

export function createApp(deps: AppDeps) {
  const app = new OpenAPIHono<AppEnv>();

  app.use(requestId());
  app.use(async (c, next) => {
    const startedAt = performance.now();
    await next();
    // Path only: query strings may carry tokens or signatures.
    deps.logger.info(
      {
        req_id: c.var.requestId,
        method: c.req.method,
        path: c.req.path,
        status: c.res.status,
        ms: Math.round(performance.now() - startedAt),
      },
      'request',
    );
  });
  app.use(
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: (c) => c.json(errorBody('PAYLOAD_TOO_LARGE', 'Request body too large', false), 413),
    }),
  );

  registerHealthRoutes(app, deps);

  app.doc31('/openapi.json', {
    openapi: '3.1.0',
    info: { title: 'Critterpass API', version: deps.version },
  });
  if (deps.exposeDocs) app.get('/docs', Scalar({ url: '/openapi.json' }));

  app.notFound((c) => c.json(errorBody('NOT_FOUND', 'Not found', false), 404));
  app.onError((error, c) => {
    deps.logger.error({ req_id: c.var.requestId, err: error }, 'unhandled error');
    return c.json(errorBody('INTERNAL', 'Something went wrong', true), 500);
  });

  return app;
}
