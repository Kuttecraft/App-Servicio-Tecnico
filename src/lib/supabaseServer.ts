// ===========================================================
// src/lib/supabaseServer.ts
// -----------------------------------------------------------
// Cliente de Supabase exclusivo para el BACKEND (SSR / API).
//
// Usa la clave de servicio (SERVICE ROLE), que tiene permisos
// elevados para realizar operaciones administrativas seguras.
// ⚠️ NUNCA debe ser usada en el frontend ni enviada al cliente.
// ===========================================================

import { createClient } from '@supabase/supabase-js'

// -----------------------------------------------------------
// 1️⃣ Cargar variables de entorno críticas
// -----------------------------------------------------------
// - PUBLIC_SUPABASE_URL → URL del proyecto Supabase.
// - SUPABASE_SERVICE_ROLE → clave secreta con permisos completos.
//
// Ambas deben estar definidas en tu archivo `.env` o en las variables
// del entorno del servidor (por ejemplo, Vercel, Render, etc.)
// -----------------------------------------------------------
const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL
const serviceRole = import.meta.env.SUPABASE_SERVICE_ROLE

// -----------------------------------------------------------
// 2️⃣ Validación temprana (fail-fast)
// -----------------------------------------------------------
// Si falta alguna variable obligatoria, abortamos la ejecución.
// Esto previene que el backend quede mal configurado y falle
// silenciosamente durante una operación crítica.
// -----------------------------------------------------------
if (!supabaseUrl || !serviceRole) {
  throw new Error('[Supabase] ❌ Falta PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE en .env')
}

// -----------------------------------------------------------
// 3️⃣ Crear cliente Supabase (modo servidor)
// -----------------------------------------------------------
// - Se usa la SERVICE ROLE KEY, que otorga permisos de administrador.
// - `persistSession: false` desactiva almacenamiento de sesión local
//   (ya que en el backend no usamos cookies o tokens persistentes).
//
// Este cliente se debe usar SOLO en el servidor, por ejemplo:
//
//   - Endpoints API (`src/pages/api/...`)
//   - Scripts de backend (cron jobs, watchers, etc.)
//   - SSR que requiera acceso completo a la DB.
//
// ⚠️ IMPORTANTE: Nunca importar ni exponer `supabaseServer` al cliente.
// -----------------------------------------------------------
export const supabaseServer = createClient(supabaseUrl, serviceRole, {
  auth: { persistSession: false },
})

// -----------------------------------------------------------
// ✅ Ejemplo de uso en un endpoint:
//
// import { supabaseServer } from '../../lib/supabaseServer';
//
// export async function POST() {
//   const { data, error } = await supabaseServer
//     .from('tickets')
//     .insert({ cliente_id: 1, estado: 'Nuevo' })
//     .select('*')
//     .single();
//
//   return new Response(JSON.stringify({ data, error }));
// }
// -----------------------------------------------------------
