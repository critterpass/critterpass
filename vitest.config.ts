import { defineConfig } from 'vitest/config';

// Workspace test projects; each package may add its own vitest.config.ts. The mobile app uses Jest.
export default defineConfig({
  test: {
    projects: ['packages/*', 'services/*', 'tools/*'],
  },
});
