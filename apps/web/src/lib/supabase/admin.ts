import { createClient } from "@supabase/supabase-js";

// Client SERVIDOR-ONLY com service role. O app roda dentro do iframe do
// Chatwoot (sem sessão Supabase), então as rotas de API usam a service role
// key pra ler/gravar config. NUNCA importar isso em código de cliente — a key
// não pode vazar pro navegador. Bypassa RLS por design.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase não configurado (falta NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY)",
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
