import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['server/src/**/*.test.ts'],
    environment: 'node',
    // The suites share one database, so files run one at a time.
    fileParallelism: false,
    // Sign-up hashes passwords with bcrypt (deliberately slow); allow for
    // busy CI machines instead of the 5-second default.
    testTimeout: 20_000,
    hookTimeout: 30_000,
    setupFiles: ['./server/src/__tests__/setup-test-db.ts'],
  },
})
