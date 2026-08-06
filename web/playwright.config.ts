import { defineConfig } from "@playwright/test";

/**
 * End-to-end suite against the production build (`npm run build` first).
 * PW_CHROMIUM points at a system Chromium when downloads are disabled
 * (e.g. the dev container); CI installs Playwright's own browser.
 * The SwiftShader flags keep WebGL rendering in software environments.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:3111",
    launchOptions: {
      executablePath: process.env.PW_CHROMIUM || undefined,
      args: ["--use-gl=angle", "--use-angle=swiftshader"],
    },
  },
  webServer: {
    command: "PORT=3111 npm start",
    port: 3111,
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
