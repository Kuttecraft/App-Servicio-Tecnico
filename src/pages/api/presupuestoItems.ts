// src/pages/api/presupuestoItems.ts
import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';

/* ====================================================================== */
/* ========================== Helpers internos ========================== */
/* ====================================================================== */

/**
 * toInt(v)
 *
 * Convierte un valor desconocido a entero usando Number() y Math.trunc.
 * - Si no es numérico válido → devuelve NaN.
 *
 * Esto se usa para sanear:
 *   - ticket_id
 *   - repuesto_id
 *   - cantidad
 */
function toInt(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : NaN;
}

/**
 * parseEnteroARS(s)
 *
 * Convierte un string de precio (posiblemente con separadores de miles y/o decimales)
 * a un ENTERO en ARS escalado a "miles".
 *
 * 🧠 Contexto:
 * - En la tabla `repuestos_csv` el campo "Precio" viene como string libre, tipo:
 *     "12.345", "12,345", "12.3", "12,30", "$12.300", etc.
 * - El sistema quiere guardar `precio_unit` como número entero en milésimos (x1000),
 *   o directamente como "entero ARS" sin coma. Es decir:
 *     "12,30" → ~12300 (12.30 * 1000 ≈ 12300)
 *     "12345" → 12345
 *
 * Regla general:
 * - Detecta si hay punto y coma para decidir qué es separador de miles
 *   y qué es separador decimal.
 * - Intenta interpretar decimales y los escala (multiplica *1000 y redondea).
 * - Si no ve decimales claros, asume es un entero ya expresado en ARS.
 *
 * Retorna:
 *   - number (entero) o null si no se puede interpretar.
 *
 * EJEMPLOS (intención del código):
 *   "12.300"     → 12300
 *   "12,300"     → 12300
 *   "12,5"       → 12500  (12.5 * 1000)
 *   "12.50"      → 12500
 *   "900"        → 900
 */
function parseEnteroARS(s?: string | null): number | null {
  if (!s) return null;
  const raw = String(s).trim();
  if (!raw) return null;

  const hasDot = raw.includes('.');
  const hasCom = raw.includes(',');

  // Caso: tiene punto Y coma → inferimos cuál es miles y cuál es decimal
  if (hasDot && hasCom) {
    const lastDot = raw.lastIndexOf('.');
    const lastCom = raw.lastIndexOf(',');
    // "dec" va a ser el separador decimal elegido
    const dec = lastDot > lastCom ? '.' : ',';
    // "mil" va a ser el separador de miles
    const mil = dec === '.' ? ',' : '.';

    // Sacamos separador de miles
    let t = raw.split(mil).join('');
    // Convertimos decimal a punto si hace falta
    if (dec === ',') t = t.replace(',', '.');

    // Limpieza final a solo dígitos, punto y signo
    const n = Number(t.replace(/[^\d.-]/g, ''));
    if (!Number.isFinite(n)) return null;

    // Si el número parece ser tipo "12.34", interpretamos 12.34 ARS → 12340 aprox.
    // El código original decide:
    //   - si n < 1000 → multiplica x1000
    //   - si n >=1000 → ya lo toma como entero
    return Math.round(n < 1000 ? n * 1000 : n);
  }

  // Caso: solo coma ","
  if (hasCom && !hasDot) {
    // nos quedamos sólo con dígitos y coma
    const only = raw.replace(/[^\d,]/g, '');

    // Forma tipo "12,34"
    if (/^\d{1,3},\d{1,2}$/.test(only)) {
      const n = Number(only.replace(',', '.')); // "12,34" -> "12.34"
      return Number.isFinite(n) ? Math.round(n * 1000) : null;
    }

    // Sino, asumimos comas son miles, quitamos no-dígitos y parseamos entero
    const d = raw.replace(/[^\d]/g, '');
    const n = Number(d);
    return Number.isFinite(n) ? n : null;
  }

  // Caso: solo punto "."
  if (hasDot && !hasCom) {
    // nos quedamos sólo con dígitos y punto
    const only = raw.replace(/[^\d.]/g, '');

    // Forma tipo "12.34"
    if (/^\d{1,3}\.\d{1,2}$/.test(only)) {
      const n = Number(only); // ej "12.50" -> 12.5
      return Number.isFinite(n) ? Math.round(n * 1000) : null;
    }

    // Sino, asumimos puntos son miles, limpiamos y parseamos entero
    const d = raw.replace(/[^\d]/g, '');
    const n = Number(d);
    return Number.isFinite(n) ? n : null;
  }

  // Caso: sin separadores, sólo dígitos tipo "12345"
  const d = raw.replace(/[^\d]/g, '');
  const n = Number(d);
  return Number.isFinite(n) ? n : null;
}

/**
 * parseStockNum(s)
 *
 * Limpia una cadena de stock y la convierte en número entero.
 * - Acepta strings con basura tipo "12u", " 5 ", "0003", "-2"
 * - Devuelve 0 si no puede parsear algo válido.
 */
function parseStockNum(s?: string | null): number {
  if (s == null) return 0;
  const d = String(s).replace(/[^\d-]/g, '');
  const n = Number(d);
  return Number.isFinite(n) ? n : 0;
}

/**
 * getOrCreatePresupuestoId(ticket_id)
 *
 * 📌 Propósito:
 *   Devuelve el id del presupuesto asociado al ticket dado.
 *   Si no existe ninguno, crea uno nuevo.
 *
 * 📋 Lógica:
 *   1. Busca en `presupuestos` por `ticket_id`, ordena desc y se queda con el más reciente.
 *   2. Si no encuentra → inserta un presupuesto nuevo con `fecha_presupuesto = ahora`.
 *
 * 🔁 Esto se usa tanto en el GET como en el POST.
 */
async function getOrCreatePresupuestoId(ticket_id: number): Promise<number> {
  const { data: found, error: errFind } = await supabase
    .from('presupuestos')
    .select('id')
    .eq('ticket_id', ticket_id)
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (errFind) throw errFind;
  if (found?.id) return found.id;

  const { data: created, error: errIns } = await supabase
    .from('presupuestos')
    .insert({
      ticket_id,
      fecha_presupuesto: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (errIns) throw errIns;

  return created!.id as number;
}

/* ====================================================================== */
/* ============================== GET ================================== */
/* ====================================================================== */

/**
 * GET /api/presupuestoItems?ticket_id=123
 *
 * 📖 Qué hace:
 *   - Garantiza que el ticket tenga un presupuesto (crea uno si no existe).
 *   - Trae todos los ítems de `presupuesto_repuestos` para ese presupuesto:
 *       { repuesto_id, cantidad, precio_unit }
 *   - Cruza esa info con `repuestos_csv` para traer:
 *       componente, precio actual, stock actual, categoría, activo...
 *
 *   - Devuelve una lista lista para la UI con datos enriquecidos
 *     y campos numéricos ya parseados.
 *
 * 📤 Respuesta ejemplo:
 * {
 *   rows: [
 *     {
 *       repuesto_id: 10,
 *       cantidad: 2,
 *       componente: "Ventilador 40mm",
 *       precio: "12.300",
 *       precio_unit_al_momento: 12300,
 *       precio_unit_num: 12300,
 *       stock: "4",
 *       stock_num: 4,
 *       categoria: "cooling",
 *       activo: true
 *     },
 *     ...
 *   ]
 * }
 *
 * ❌ Errores:
 *   - 400 si ticket_id inválido
 *   - 500 si hay error de base de datos
 */
export const GET: APIRoute = async ({ url }) => {
  try {
    // ------------------------------------------------------------
    // 1) Validar ticket_id
    // ------------------------------------------------------------
    const ticketId = toInt(url.searchParams.get('ticket_id'));
    if (!ticketId) {
      return new Response(
        JSON.stringify({ rows: [], error: 'ticket_id inválido' }),
        { status: 400 }
      );
    }

    // ------------------------------------------------------------
    // 2) Buscar o crear presupuesto asociado al ticket
    // ------------------------------------------------------------
    const presupuesto_id = await getOrCreatePresupuestoId(ticketId);

    // ------------------------------------------------------------
    // 3) Traer los ítems guardados en ese presupuesto
    //    presupuesto_repuestos: (repuesto_id, cantidad, precio_unit)
    // ------------------------------------------------------------
    const { data: itemsRaw, error: errItems } = await supabase
      .from('presupuesto_repuestos')
      .select('repuesto_id, cantidad, precio_unit')
      .eq('presupuesto_id', presupuesto_id);

    if (errItems) throw errItems;

    const items = Array.isArray(itemsRaw) ? itemsRaw : [];

    // Si no hay ítems, devolvemos lista vacía
    if (items.length === 0) {
      return new Response(
        JSON.stringify({ rows: [] }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // ------------------------------------------------------------
    // 4) Buscar metadata de cada repuesto involucrado
    //
    //    repuestos_csv:
    //     - "Componentes presupuestados" (nombre legible)
    //     - "Precio" (string de precio actual en catálogo)
    //     - "Stock"
    //     - categoria
    //     - activo
    //
    //  NOTA: se usa SELECT con comillas pq las columnas tienen espacios.
    // ------------------------------------------------------------
    const ids = Array.from(new Set(items.map((r: any) => r.repuesto_id)));
    const { data: repRaw, error: errRep } = await supabase
      .from('repuestos_csv')
      .select('id, "Componentes presupuestados", "Precio", "Stock", categoria, activo')
      .in('id', ids);

    if (errRep) throw errRep;

    // Tipado auxiliar de cada fila de repuestos_csv
    type RepRow = {
      id: number;
      ['Componentes presupuestados']?: string | null;
      ['Precio']?: string | null;
      ['Stock']?: string | null;
      categoria?: string | null;
      activo?: boolean | null;
    };

    // Normalizamos a array seguro
    const repuestos: RepRow[] = Array.isArray(repRaw) ? (repRaw as RepRow[]) : [];

    // Mapeo rápido id -> fila
    const byId: Record<number, RepRow> = {};
    for (const r of repuestos) byId[r.id] = r;

    // ------------------------------------------------------------
    // 5) Armar rows finales combinando ambas fuentes
    // ------------------------------------------------------------
    //
    // - preferStr = precio string que está hoy en catálogo
    // - precio_unit_al_momento = snapshot guardado en presupuesto_repuestos (entero)
    // - precio_unit_num = número final que la UI puede usar como base de cálculo.
    //      -> si hay precio_unit guardado, usamos eso
    //      -> si no, intentamos parsear el string "Precio" del catálogo
    //
    const rows = items.map((it: any) => {
      const meta = byId[it.repuesto_id] || ({} as RepRow);

      const preferStr = meta?.['Precio'] ?? null;

      // preferNum:
      // - primero intentamos el `precio_unit` guardado (it.precio_unit),
      //   siempre que sea numérico
      // - si no, tratamos de interpretar el string "Precio" del repuesto
      const preferNum =
        it?.precio_unit != null && Number.isFinite(Number(it.precio_unit))
          ? Number(it.precio_unit)
          : parseEnteroARS(preferStr);

      return {
        repuesto_id: it.repuesto_id,
        cantidad: it.cantidad,
        componente: meta?.['Componentes presupuestados'] ?? '',
        precio: preferStr ?? '',
        precio_unit_al_momento: it?.precio_unit ?? null,
        precio_unit_num: preferNum ?? 0,
        stock: meta?.['Stock'] ?? null,
        stock_num: parseStockNum(meta?.['Stock']),
        categoria: meta?.categoria ?? null,
        activo: !!meta?.activo,
      };
    });

    // ------------------------------------------------------------
    // 6) Responder éxito
    // ------------------------------------------------------------
    return new Response(
      JSON.stringify({ rows }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (e: any) {
    // ------------------------------------------------------------
    // Error inesperado en GET
    // ------------------------------------------------------------
    console.error('presupuestoItems GET error:', e?.message || e);
    return new Response(
      JSON.stringify({ rows: [], error: e?.message || 'Error' }),
      { status: 500 }
    );
  }
};

/* ====================================================================== */
/* ============================== POST ================================= */
/* ====================================================================== */

/**
 * POST /api/presupuestoItems
 *
 * 📥 Body esperado (JSON):
 * {
 *   "ticket_id": 123,
 *   "items": [
 *     { "repuesto_id": 10, "cantidad": 2 },
 *     { "repuesto_id": 55, "cantidad": 1 }
 *   ]
 * }
 *
 * 🧠 Qué hace:
 * 1. Valida `ticket_id`.
 * 2. Normaliza y limpia los ítems entrantes:
 *      - repuesto_id entero válido
 *      - cantidad mínima = 1
 * 3. Busca (o crea) el presupuesto del ticket.
 * 4. Trae los ítems ACTUALES del presupuesto:
 *      - Esto nos sirve para detectar qué repuestos ya estaban antes.
 *        ¿Por qué? Porque hay repuestos inactivos que siguen siendo válidos
 *        si ya estaban en el presupuesto (permitimos mantenerlos).
 * 5. Trae info de los repuestos entrantes desde `repuestos_csv`
 *      - precio actual ("Precio")
 *      - estado `activo`
 * 6. Bloquea agregar repuestos NUEVOS que estén inactivos.
 *      - Si un repuesto está activo=false y NO estaba antes,
 *        devolvemos error.
 *      - Si estaba antes, se permite mantenerlo.
 * 7. Hace REEMPLAZO TOTAL:
 *      - Borra todos los rows actuales en `presupuesto_repuestos`
 *      - Inserta la nueva lista limpia.
 *      - Guarda snapshot de `precio_unit` (parseado en número entero).
 *
 * 📤 Respuesta éxito:
 *   { ok: true, count: <cantidad de items guardados> }
 *
 * ❌ Respuestas de error:
 *   - 400  → ticket_id inválido
 *   - 400  → intento de agregar repuestos inactivos nuevos
 *   - 500  → error DB / inesperado
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    // ------------------------------------------------------------
    // 1) Parsear body JSON
    // ------------------------------------------------------------
    const body = (await request.json()) as {
      ticket_id?: unknown;
      items?: Array<{ repuesto_id: unknown; cantidad?: unknown }>;
    };

    const ticket_id = toInt(body?.ticket_id);
    const incoming = Array.isArray(body?.items) ? body!.items : [];

    if (!ticket_id) {
      return new Response(
        JSON.stringify({ ok: false, error: 'ticket_id inválido' }),
        { status: 400 }
      );
    }

    // ------------------------------------------------------------
    // 2) Limpiar / normalizar ítems entrantes
    // ------------------------------------------------------------
    //
    // - repuesto_id debe ser entero válido
    // - cantidad mínima = 1
    //
    const clean = incoming
      .map((it) => {
        const repuesto_id = toInt(it?.repuesto_id);
        if (!Number.isFinite(repuesto_id)) return null;

        const cr = toInt(it?.cantidad ?? 1);
        const cantidad = Math.max(1, Number.isFinite(cr) ? cr : 1);

        return { repuesto_id, cantidad };
      })
      .filter(
        (x): x is { repuesto_id: number; cantidad: number } => x !== null
      );

    // ------------------------------------------------------------
    // 3) Obtener (o crear) el presupuesto
    // ------------------------------------------------------------
    const presupuesto_id = await getOrCreatePresupuestoId(ticket_id);

    // ------------------------------------------------------------
    // 4) Leer actualmente guardados en presupuesto_repuestos
    //    para saber qué repuestos "ya estaban"
    // ------------------------------------------------------------
    //
    // Esto nos permite distinguir:
    //   - Repuesto inactivo NUEVO → bloquear
    //   - Repuesto inactivo que ya estaba → permitir
    //
    const { data: actualesRaw, error: errAct } = await supabase
      .from('presupuesto_repuestos')
      .select('repuesto_id')
      .eq('presupuesto_id', presupuesto_id);

    if (errAct) throw errAct;

    const actuales = Array.isArray(actualesRaw) ? actualesRaw : [];
    const actualesSet = new Set<number>(actuales.map(r => r.repuesto_id));

    // ------------------------------------------------------------
    // 5) Traer info de todos los repuestos entrantes desde repuestos_csv
    //
    // Necesitamos:
    //  - Precio (string crudo)
    //  - Activo (boolean)
    //
    // Para:
    //  - capturar snapshot de precio_unit
    //  - detectar inactivos
    // ------------------------------------------------------------
    const ids = Array.from(new Set(clean.map((x) => x.repuesto_id)));

    const { data: repRaw, error: errRep } = await supabase
      .from('repuestos_csv')
      .select('id, "Precio", activo')
      .in('id', ids);

    if (errRep) throw errRep;

    type RepRow = { id: number; ['Precio']?: string | null; activo?: boolean | null };

    const repuestos: RepRow[] = Array.isArray(repRaw) ? repRaw : [];

    // Construimos dos maps simples:
    //  priceById[repuesto_id] = "12.300"
    //  activeById[repuesto_id] = true|false
    //
    const priceById: Record<number, string | null> = {};
    const activeById: Record<number, boolean> = {};
    for (const r of repuestos) {
      priceById[r.id] = r['Precio'] ?? null;
      activeById[r.id] = !!r.activo;
    }

    // ------------------------------------------------------------
    // 6) Bloquear repuestos inactivos NUEVOS
    // ------------------------------------------------------------
    //
    // Repuestos inactivos solo se permiten si YA existían en el presupuesto.
    // Detectamos cuáles de los incoming están inactivos y no estaban antes.
    //
    const inactivosNuevos = clean
      .filter(
        x => activeById[x.repuesto_id] === false && !actualesSet.has(x.repuesto_id)
      )
      .map(x => x.repuesto_id);

    if (inactivosNuevos.length > 0) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: `Hay repuestos inactivos nuevos: ${inactivosNuevos.join(', ')}`
        }),
        { status: 400 }
      );
    }

    // ------------------------------------------------------------
    // 7) Reemplazo TOTAL de los ítems del presupuesto
    //    (borramos todo y luego insertamos lo nuevo)
    // ------------------------------------------------------------
    const del = await supabase
      .from('presupuesto_repuestos')
      .delete()
      .eq('presupuesto_id', presupuesto_id);

    if (del.error) throw del.error;

    // Si la lista quedó vacía después de limpiar → OK sin insertar nada
    if (clean.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, count: 0 }),
        { status: 200 }
      );
    }

    // ------------------------------------------------------------
    // 8) Insertar ítems nuevos con snapshot de precio_unit
    // ------------------------------------------------------------
    //
    // precio_unit:
    //   - guardamos el valor numérico PARSEADO del catálogo actual,
    //     usando parseEnteroARS, para congelar el precio en el momento.
    //
    const payload = clean.map(x => ({
      presupuesto_id,
      repuesto_id: x.repuesto_id,
      cantidad: x.cantidad,
      precio_unit: (() => {
        const parsed = parseEnteroARS(priceById[x.repuesto_id]);
        return parsed ?? null;
      })(),
    }));

    const { error: insErr } = await supabase
      .from('presupuesto_repuestos')
      .insert(payload);

    if (insErr) throw insErr;

    // ------------------------------------------------------------
    // 9) Responder éxito
    // ------------------------------------------------------------
    return new Response(
      JSON.stringify({ ok: true, count: payload.length }),
      { status: 200 }
    );
  } catch (e: any) {
    // ------------------------------------------------------------
    // Error inesperado en POST
    // ------------------------------------------------------------
    console.error('presupuestoItems POST error:', e?.message || e);
    return new Response(
      JSON.stringify({ ok: false, error: e?.message || 'Error' }),
      { status: 500 }
    );
  }
};
