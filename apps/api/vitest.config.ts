import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The PostgreSQL suites share one *_test database and wipe it, so test files run one at a time.
    fileParallelism: false,
  },
});
