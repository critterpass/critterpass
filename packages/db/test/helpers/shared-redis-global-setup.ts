/**
 * Vitest `globalSetup` entry: one Redis container for the whole run, running several Redis servers
 * so each test file that asks for Redis gets a whole, empty server (see `leaseSharedRedis` in
 * ./shared-server). List it after ./shared-postgres-global-setup, whose server holds the claims.
 */
import { availableParallelism } from 'node:os';

import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import type { TestProject } from 'vitest/node';

import { REDIS_TEST_IMAGE } from './containers';
import type { SharedRedis } from './shared-server';

const FIRST_PORT = 6379;

let container: StartedTestContainer | undefined;

export async function setup(project: TestProject): Promise<void> {
  // Two per worker Vitest can run at once: a file may hold more than one, and a file that finds
  // none free starts a container of its own.
  const ports = Array.from({ length: 2 * availableParallelism() }, (_, i) => FIRST_PORT + i);
  // Each server starts through the image's entrypoint, as a container of its own would. Snapshots
  // are off: the servers share a data directory and nothing is ever restored.
  const servers = ports
    .map(
      (port) => `docker-entrypoint.sh redis-server --port ${port} --protected-mode no --save '' &`,
    )
    .join(' ');
  container = await new GenericContainer(REDIS_TEST_IMAGE)
    .withExposedPorts(...ports)
    .withCommand(['sh', '-c', `${servers} wait`])
    .start();
  const host = container.getHost();
  const started = container;
  const shared: SharedRedis = {
    urls: ports.map((port) => `redis://${host}:${started.getMappedPort(port)}`),
  };
  project.provide('cpSharedRedis', shared);
}

export async function teardown(): Promise<void> {
  await container?.stop();
  container = undefined;
}
