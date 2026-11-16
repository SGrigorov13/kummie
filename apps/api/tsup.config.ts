import { defineConfig } from "tsup";

/**
 * Builds in GitHub Actions, never on the server (ARCHITECTURE §10). Output:
 *   dist/server.js   — `node dist/server.js` (cPanel Passenger)
 *   dist/tick.js     — run-once worker for cPanel cron
 *   dist/migrate.js  — deploy step
 * Workspace packages (@kummie/*) are bundled; npm dependencies stay external.
 */
export default defineConfig({
  entry: { server: "src/server.ts", tick: "src/jobs/tick.ts", migrate: "src/db/migrate.ts" },
  format: ["esm"],
  platform: "node",
  target: "node24",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  splitting: false,
  noExternal: [/^@kummie\//],
});
