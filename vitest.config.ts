import { defineConfig } from 'vitest/config';

// Workspace test projects; each package may add its own vitest.config.ts. The mobile app uses Jest, and the
// media Worker runs its own Vitest (the Workers pool pins an older major), so both stay out of this run.
export default defineConfig({
  test: {
    projects: ['packages/*', 'services/*', '!services/media-worker', 'tools/*'],
  },
});
