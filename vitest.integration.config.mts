import { defineConfig } from "vitest/config"

const testDbUrl = process.env.TEST_DATABASE_URL
if (!testDbUrl) {
  throw new Error(
    "TEST_DATABASE_URL is not set. Point it at a disposable Postgres database, " +
    "e.g. postgresql://postgres:***@localhost:5432/heretix_management_test",
  )
}

export default defineConfig({
  resolve: {
    alias: { "@": import.meta.dirname },
  },
  test: {
    globals: true,
    include: ["app/**/*.integration.test.ts"],
    env: { DATABASE_URL: testDbUrl },
    // All integration test files share one truncated DB — running them
    // concurrently would race on beforeEach() resets.
    fileParallelism: false,
    testTimeout: 15000,
    hookTimeout: 15000,
  },
})
