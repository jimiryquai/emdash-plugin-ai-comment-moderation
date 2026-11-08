import { defineConfig } from "vitest/config";

// Disable Wrangler telemetry before its test plugin is loaded, locally and in CI.
process.env.WRANGLER_SEND_METRICS = "false";
const { emdashPluginTest } = await import("@emdash-cms/plugin-test/config");

export default defineConfig({
  test: {
    projects: [
      { test: { name: "unit", include: ["tests/moderation.test.ts"] } },
      {
        plugins: [emdashPluginTest()],
        test: { name: "sandbox", include: ["tests/sandbox.test.ts"] }
      }
    ]
  }
});
