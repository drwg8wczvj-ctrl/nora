import { z } from "zod";

const browserEnvSchema = z.object({
  supabaseUrl: z.url(),
  supabaseAnonKey: z.string().min(20),
  vapidPublicKey: z.string().min(20).optional(),
});

const result = browserEnvSchema.safeParse({
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? import.meta.env.REACT_APP_SUPABASE_URL,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? import.meta.env.REACT_APP_SUPABASE_ANON_KEY,
  vapidPublicKey: import.meta.env.VITE_VAPID_PUBLIC_KEY ?? import.meta.env.REACT_APP_VAPID_PUBLIC_KEY,
});

if (!result.success) {
  const fields = result.error.issues.map((issue) => issue.path.join(".")).join(", ");
  throw new Error(`Invalid browser environment configuration: ${fields}`);
}

export const browserEnv = Object.freeze(result.data);
