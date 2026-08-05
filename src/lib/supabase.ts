import { createClient } from "@supabase/supabase-js";
import { browserEnv } from "../config/env";
import type { Database } from "../types/database.generated";

export const supabase = createClient<Database>(
  browserEnv.supabaseUrl,
  browserEnv.supabaseAnonKey
);
