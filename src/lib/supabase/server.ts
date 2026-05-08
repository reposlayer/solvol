import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getSupabasePublicConfig, supabaseAuthConfigured } from "@/lib/supabase/env";

export { getSupabasePublicConfig, supabaseAuthConfigured };

export async function createSupabaseServerClient() {
  const cfg = getSupabasePublicConfig();
  if (!cfg) throw new Error("Supabase auth client is not configured");
  const cookieStore = await cookies();

  return createServerClient(cfg.url, cfg.key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot write cookies; Proxy keeps sessions fresh.
        }
      },
    },
  });
}
