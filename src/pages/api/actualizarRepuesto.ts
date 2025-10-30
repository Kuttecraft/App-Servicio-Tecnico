import type { APIRoute } from 'astro';
import { z } from 'zod';
import { supabaseServer } from '../../lib/supabaseServer';

/**
 * Esquema de validación de entrada (body JSON) usando Zod.
 *
 * Espera algo así:
 * {
 *   "id": 123?,                    // opcional: si viene => update, si no => insert
 *   "componente": "Hotend MK8",    // requerido
 *   "stock": "12" | "∞" | null,    // string con dígitos o símbolo '∞' o vacío
 *   "categoria": "Extrusor",       // opcional, string o null
 *   "precio": "$12.000" | "12000", // opcional, string o null
 *   "activo": true | false         // opcional, default true
 * }
 *
 * Notas:
 * - `stock` se guarda como string porque puede ser "∞" (servicio).
 * - `precio` llega como string libre. Lo vamos a normalizar.
 * - `activo` se puede forzar en base al stock.
 */
const Schema = z.object({
  id: z.number().int().positive().optional(),
  componente: z.string().min(1),
  stock: z.string().nullable().optional(),    // puede venir "∞" para servicios sin stock físico
  categoria: z.string().nullable().optional(),
  precio: z.string().nullable().optional(),
  activo: z.boolean().default(true),
});

/**
 * normalizarPrecioARS()
 * --------------------------------------------------
 * Recibe un string que representa un precio en pesos ("12000", "$12.000", "  5.500  ")
 * y lo transforma a un formato unificado tipo "$12.000" (sin decimales).
 *
 * Reglas:
 *  - Quita todo lo que no es dígito.
 *  - Parsea esos dígitos como número entero (pesos, sin centavos).
 *  - Lo formatea con separador de miles según 'es-AR'.
 *  - Le antepone '$'.
 *
 * Si no había dígitos reales, devuelve null.
 *
 * Ejemplos:
 *  normalizarPrecioARS("12345")        -> "$12.345"
 *  normalizarPrecioARS("$ 9.000,00")   -> "$9.000"
 *  normalizarPrecioARS(null)           -> null
 */
function normalizarPrecioARS(input?: string | null): string | null {
  if (input == null) return null;
  const digits = String(input).trim().replace(/[^\d]/g, ''); // nos quedamos sólo con dígitos
  if (!digits) return null;

  const pesos = Number(digits);

  // Lo formateamos sin decimales y en locale es-AR
  const numero = new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
    .format(pesos)
    .replace(/\s/g, ''); // por si el formateador mete espacios no deseados

  return '$' + numero;
}

/**
 * esInfinitoStock()
 * --------------------------------------------------
 * Determina si el valor de stock representa "infinito"/servicio.
 * Accepta variantes tipo:
 *  - "∞"
 *  - "inf", "infinito", "infinite", etc. (case-insensitive, por /^inf/i)
 *
 * Esto se usa para distinguir:
 *  - repuestos con cantidad física real
 *  - servicios o piezas intangibles que no tienen stock finito
 */
function esInfinitoStock(s?: string | null): boolean {
  if (s == null) return false;
  const t = String(s).trim();
  if (!t) return false;
  return t === '∞' || /^inf/i.test(t);
}

/**
 * POST /api/actualizarRepuesto
 * --------------------------------------------------
 * Este endpoint crea o actualiza un repuesto en la tabla `repuestos_csv`.
 *
 * Lógica:
 *  1. Parsear y validar el body con Zod.
 *  2. Normalizar campos (stock, precio, flags).
 *  3. Armar `payload` con el formato que espera la tabla `repuestos_csv`.
 *     OJO: esa tabla tiene nombres de columna con espacios y mayúsculas:
 *       - "Componentes presupuestados"
 *       - "Stock"
 *       - "Precio"
 *     y algunos metadatos:
 *       - activo
 *       - categoria
 *       - actualizado_en / creado_en (ISO timestamps)
 *
 *  4. Si viene `id` → UPDATE
 *     Si no viene → INSERT
 *
 *  5. Responder con un objeto normalizado para el frontend.
 *
 * Seguridad:
 * - Usa `supabaseServer` (service role). Esto es SOLO backend.
 *   Nunca expongas este endpoint sin auth adecuada.
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    // 1) Parsear / validar body con Zod
    // request.json() debe contener el objeto que cumple con Schema
    const b = Schema.parse(await request.json());

    // Campos limpios
    const componente = b.componente.trim();
    const categoria = b.categoria ? b.categoria.trim() : null;

    // stock puede ser "12", "", "∞", "inf", etc.
    // Lo tratamos como string
    const stockStrRaw = (b.stock ?? '').toString().trim();

    // ¿Es un item "servicio" con stock infinito?
    const infinito = esInfinitoStock(stockStrRaw);

    // Extraemos sólo dígitos (y '-') del stock para obtener un número real.
    // Ej: "12 uds" -> "12"
    //     "0" -> "0"
    //     "∞" -> "" (después no lo usamos)
    const stockDigits = stockStrRaw.replace(/[^\d-]/g, '');

    // stockNum es un number para lógica de activo.
    // - Si NO es infinito y el campo no está vacío → casteamos a número.
    // - Si es infinito o está vacío → null.
    //
    // Ej: "15"   => 15
    //     "∞"    => null
    //     ""     => null
    const stockNum =
      !infinito && stockStrRaw !== '' && stockDigits !== ''
        ? Number(stockDigits) || 0
        : null;

    /**
     * 2) Armar payload que mapea a la estructura de la tabla `repuestos_csv`
     *
     * Notar que las columnas tienen nombres "raros" (con espacios y mayúsculas),
     * por eso las usamos entre comillas más abajo en el .select().
     *
     * Reglas:
     * - "Componentes presupuestados": nombre del componente/repuesto.
     * - "Stock":
     *      si es servicio/infinito → guardamos literalmente "∞"
     *      si no → guardamos el número (string) o null
     *
     * - "Precio": string formateada tipo "$12.000"
     *
     * - activo:
     *      si es infinito, lo dejamos activo (a menos que b.activo diga lo contrario)
     *      si NO es infinito pero el stockNum es 0 → forzamos activo=false
     *      en otros casos usamos b.activo ?? true
     *
     * - actualizado_en: timestamp ISO actual
     * - creado_en: sólo en inserts
     */
    const payload: any = {
      'Componentes presupuestados': componente,
      // Si es servicio infinito → guardamos "∞".
      // Si no, guardamos los dígitos limpios o null.
      'Stock': infinito
        ? '∞'
        : (stockDigits ? stockDigits : null),

      categoria,
      'Precio': normalizarPrecioARS(b.precio),

      // Reglas de activación:
      // - Si NO es infinito y stockNum === 0 ⇒ desactivar
      // - Caso contrario: usar lo que vino en b.activo o true por defecto
      activo: (!infinito && stockNum === 0)
        ? false
        : (b.activo ?? true),

      actualizado_en: new Date().toISOString(),
    };

    // 3) Hacer UPDATE o INSERT en la tabla `repuestos_csv`
    //
    // Si vino b.id => es una modificación
    // Si no vino => es un alta nueva
    //
    let resp;
    if (b.id) {
      // UPDATE existente
      resp = await supabaseServer
        .from('repuestos_csv')
        .update(payload)
        .eq('id', b.id)
        .select(
          'id,"Componentes presupuestados","Stock",categoria,"Precio",activo,actualizado_en'
        )
        .single();
    } else {
      // INSERT nuevo
      payload.creado_en = new Date().toISOString();

      resp = await supabaseServer
        .from('repuestos_csv')
        .insert(payload)
        .select(
          'id,"Componentes presupuestados","Stock",categoria,"Precio",activo,actualizado_en'
        )
        .single();
    }

    // 4) Manejo de respuesta Supabase
    const { data, error } = resp;
    if (error) throw error;

    // Helper para dejar las fechas en formato YYYY-MM-DD
    const toYmd = (iso?: string | null) =>
      iso ? String(iso).slice(0, 10) : null;

    // Preparamos salida "limpia" para el frontend/cliente
    // Cambiamos nombres de campos a algo más amigable y sin espacios
    const out = {
      id: data!.id,
      componente: data!['Componentes presupuestados'],
      stock: data!['Stock'], // puede ser "∞"
      categoria: data!.categoria,
      precio: data!['Precio'],
      activo: data!.activo,
      actualizado_en: toYmd(data!.actualizado_en),
    };

    // 5) Respondemos con JSON listo para usar en la UI
    return new Response(
      JSON.stringify(out),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (e: any) {
    // Si algo explota (Zod, Supabase, formateo...), devolvemos 400 con el mensaje
    console.error('actualizarRepuesto error:', e?.message || e);
    return new Response(
      JSON.stringify({ error: e?.message || 'Error' }),
      { status: 400 }
    );
  }
};
