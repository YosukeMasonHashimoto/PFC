import { afterEach, describe, expect, it, vi } from "vitest";
import { appOrigin } from "../src/lib/config";
afterEach(() => vi.unstubAllEnvs());
describe("trusted deployment origin", () => {
  it("prefers an explicit origin and strips paths", () => {
    vi.stubEnv("APP_URL", "https://pfc.example/app");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "other.vercel.app");
    expect(appOrigin()).toBe("https://pfc.example");
  });
  it("uses the stable Vercel production hostname without manual URL configuration", () => {
    vi.stubEnv("APP_URL", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "pfc.vercel.app");
    vi.stubEnv("VERCEL_URL", "pfc-deployment.vercel.app");
    expect(appOrigin()).toBe("https://pfc.vercel.app");
  });
  it("falls back to the deployment hostname, then local development", () => {
    vi.stubEnv("APP_URL", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
    vi.stubEnv("VERCEL_URL", "pfc-deployment.vercel.app");
    expect(appOrigin()).toBe("https://pfc-deployment.vercel.app");
    vi.stubEnv("VERCEL_URL", "");
    expect(appOrigin()).toBe("http://localhost:3000");
  });
});
