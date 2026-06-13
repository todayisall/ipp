import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  {
    test: { globals: true, environment: 'node', name: 'protocol',        include: ['packages/protocol/src/**/*.test.ts'] },
  },
  {
    test: { globals: true, environment: 'node', name: 'codec',           include: ['packages/codec/src/**/*.test.ts'] },
  },
  {
    test: { globals: true, environment: 'node', name: 'client',          include: ['packages/client/src/**/*.test.ts'] },
  },
  {
    test: { globals: true, environment: 'node', name: 'transport-fetch', include: ['packages/transport-fetch/src/**/*.test.ts'] },
  },
  {
    test: { globals: true, environment: 'node', name: 'transport-node',  include: ['packages/transport-node/src/**/*.test.ts'] },
  },
  {
    test: { globals: true, environment: 'node', name: 'server',          include: ['packages/server/src/**/*.test.ts'] },
  },
]);
