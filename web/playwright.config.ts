import { config as loadDotenv } from "dotenv";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const originalEnvKeys = new Set(Object.keys(process.env));

function preloadEnvFile(relativePath: string) {
  const result = loadDotenv({
    path: path.resolve(process.cwd(), relativePath),
    processEnv: {},
    quiet: true,
  });
  if (result.error || !result.parsed) return;

  for (const [key, value] of Object.entries(result.parsed)) {
    if (originalEnvKeys.has(key)) continue;
    process.env[key] = value;
  }
}

preloadEnvFile(".env");
preloadEnvFile(".env.local");

const port = Number(process.env.PORT ?? 3100);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`;
// Vercel Deployment Protection bypass — set via GitHub Secret VERCEL_AUTOMATION_BYPASS_SECRET
const vercelBypassToken = process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? "";
const fallbackDatabaseUrl = "postgresql://postgres:postgres@127.0.0.1:5432/workout_log_ci";
const serverMode = process.env.PLAYWRIGHT_SERVER_MODE === "prod" ? "prod" : "dev";
const serverCommand =
  serverMode === "prod"
    ? `pnpm build && pnpm start -H 127.0.0.1 -p ${port}`
    : `pnpm exec next dev --webpack -H 127.0.0.1 -p ${port}`;
const defaultServerTimeoutMs = serverMode === "prod" ? 600_000 : 180_000;
const configuredServerTimeoutMs = Number(process.env.PLAYWRIGHT_WEB_SERVER_TIMEOUT ?? defaultServerTimeoutMs);
const webServerTimeoutMs =
  Number.isFinite(configuredServerTimeoutMs) && configuredServerTimeoutMs > 0
    ? configuredServerTimeoutMs
    : defaultServerTimeoutMs;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
    headless: true,
    // Vercel Deployment Protection bypass header (no-op when token is empty)
    ...(vercelBypassToken ? { extraHTTPHeaders: { "x-vercel-protection-bypass": vercelBypassToken } } : {}),
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: serverCommand,
        env: {
          ...process.env,
          DATABASE_URL: process.env.DATABASE_URL ?? fallbackDatabaseUrl,
          NEXT_TELEMETRY_DISABLED: process.env.NEXT_TELEMETRY_DISABLED ?? "1",
          // 이메일 복구 UI는 기본 숨김(flag) — auth-recovery·email-verification e2e는
          // 이 기능을 검증하므로 테스트 서버에서는 기본 활성화한다.
          NEXT_PUBLIC_EMAIL_RECOVERY_ENABLED:
            process.env.NEXT_PUBLIC_EMAIL_RECOVERY_ENABLED ?? "1",
        },
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: webServerTimeoutMs,
      },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
