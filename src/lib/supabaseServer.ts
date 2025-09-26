// src/lib/supabaseServer.ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL
const serviceRole = import.meta.env.SUPABASE_SERVICE_ROLE

if (!supabaseUrl || !serviceRole) {
  throw new Error('[Supabase] Falta PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE en .env')
}

// ¡SOLO BACKEND! No expongas esta clave en el cliente.
export const supabaseServer = createClient(supabaseUrl, serviceRole, {
  auth: { persistSession: false },
})
