import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/** Static build (dist/) for admin.kummie.eu, served by Apache; auth is enforced by the API (M1). */
export default defineConfig({
  plugins: [react()],
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
  build: { outDir: "dist", sourcemap: true },
});
