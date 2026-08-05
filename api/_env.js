function firstDefined(...names) {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }
  return undefined;
}

function getServerConfig() {
  return {
    supabaseUrl: firstDefined(
      "SUPABASE_URL",
      "VITE_SUPABASE_URL",
      "REACT_APP_SUPABASE_URL",
    ),
    supabaseAnonKey: firstDefined(
      "SUPABASE_ANON_KEY",
      "VITE_SUPABASE_ANON_KEY",
      "REACT_APP_SUPABASE_ANON_KEY",
    ),
    supabaseServiceRoleKey: firstDefined("SUPABASE_SERVICE_ROLE_KEY"),
    openAiApiKey: firstDefined("OPENAI_API_KEY"),
  };
}

function requireServerConfig(name) {
  const config = getServerConfig();
  const value = config[name];
  if (!value) throw new Error(`Missing required server configuration: ${name}`);
  return value;
}

function getReadiness() {
  const config = getServerConfig();
  const required = ["supabaseUrl", "supabaseAnonKey", "supabaseServiceRoleKey", "openAiApiKey"];
  const missing = required.filter((name) => !config[name]);
  return { ready: missing.length === 0, missing };
}

module.exports = { getReadiness, getServerConfig, requireServerConfig };
