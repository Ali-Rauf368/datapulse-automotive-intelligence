import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['server/src/**/*.test.ts'],
    environment: 'node',
    // The suites share one database, so files run one at a time.
    fileParallelism: false,
    setupFiles: ['./server/src/__tests__/setup-test-db.ts'],
  },
})
