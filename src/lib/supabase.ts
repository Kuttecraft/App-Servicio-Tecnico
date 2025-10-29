// ===========================================================
// src/lib/supabase.ts
// -----------------------------------------------------------
// Este módulo centraliza la creación del cliente de Supabase,
// usando las variables de entorno públicas (anon key + URL).
//
// Se importa en todo el proyecto para interactuar con la base
// de datos, tanto en el frontend (lectura) como en el backend
// (consultas SSR, API routes, etc.).
// ===========================================================

import { createClient } from '@supabase/supabase-js'

// -----------------------------------------------------------
// 1️⃣ Variables de entorno
// -----------------------------------------------------------
// Estas deben estar definidas en tu archivo `.env`:
//
//   PUBLIC_SUPABASE_URL="https://<project>.supabase.co"
//   PUBLIC_SUPABASE_ANON_KEY="<tu anon key>"
//
// `import.meta.env` es la forma estándar de acceder a variables
// en Vite / Astro (en tiempo de compilación).
// -----------------------------------------------------------
const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY

// -----------------------------------------------------------
// 2️⃣ Validación temprana (fail-fast)
// -----------------------------------------------------------
// Si falta alguna variable de entorno crítica, lanzamos un error
// al iniciar la app, para evitar que el cliente quede mal configurado
// y cause errores silenciosos más adelante.
// -----------------------------------------------------------
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('❌ Supabase URL o ANON KEY no definidas en .env')
}

// -----------------------------------------------------------
// 3️⃣ Crear cliente Supabase
// -----------------------------------------------------------
// `createClient(url, key)` devuelve una instancia lista para usar
// que provee métodos como `.from().select()`, `.insert()`, `.update()`,
// `.auth`, `.storage`, etc.
//
// Como estamos usando la `anon key`, este cliente se usa para operaciones
// públicas o seguras sólo del lado del servidor (Astro SSR / API).
// -----------------------------------------------------------
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// -----------------------------------------------------------
// ✅ Ejemplo de uso:
//
//   import { supabase } from '../lib/supabase';
//
//   const { data, error } = await supabase
//     .from('clientes')
//     .select('*')
//     .limit(5);
//
// -----------------------------------------------------------
