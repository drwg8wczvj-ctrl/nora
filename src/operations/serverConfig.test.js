import { afterEach, describe, expect, it, vi } from "vitest";
import serverEnvironment from "../../api/_env.js";

const variables = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "OPENAI_API_KEY",
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
  "REACT_APP_SUPABASE_URL",
  "REACT_APP_SUPABASE_ANON_KEY",
];

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("server readiness configuration", () => {
  it("accepts the current Supabase environment names", () => {
    vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("SUPABASE_ANON_KEY", "anon");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service");
    vi.stubEnv("OPENAI_API_KEY", "openai");
    expect(serverEnvironment.getReadiness()).toEqual({ ready: true, missing: [] });
  });

  it("reports missing settings without exposing configured values", () => {
    for (const variable of variables) vi.stubEnv(variable, "");
    const result = serverEnvironment.getReadiness();
    expect(result.ready).toBe(false);
    expect(result.missing).toContain("supabaseUrl");
    expect(JSON.stringify(result)).not.toContain("service-role-secret");
  });
});
