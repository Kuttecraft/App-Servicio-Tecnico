// src/pages/api/estadisticas.ts
import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';

/**
 * Endpoint GET /api/estadisticas
 *
 * 📊 Qué hace:
 * - Sólo deja entrar a admins.
 * - Filtra tickets de un mes específico (por year+month o period=YYYY-MM).
 * - Agrupa esos tickets por:
 *    - modelo  (impresoras.modelo del join)
 *    - estado  (tickets_mian.estado)
 *    - tecnico (email del técnico -> local-part antes de @)
 * - Cuenta cuántos tickets hay por cada grupo.
 * - Calcula % relativo al total.
 * - Devuelve el TOP 10 de ese ranking.
 * - Además arma mapas tipo { clave   : [ {id, cliente}, ... ] }
 *   para que el frontend pueda hacer drill-down (ej: "dame todos
 *   los tickets que aportan a 'Ender 3'").
 *
 * 🔐 Seguridad:
 *   - Sólo admins pueden consultar (si no => 403).
 *
 * 📅 Filtro temporal:
 *   - Requerís año/mes en la query:
 *       ?year=2025&month=10
 *     o
 *       ?period=2025-10
 *
 *   - No hay fallback automático: si no viene período válido → 400.
 *
 * 🧠 Cómo filtra por mes:
 *   - `tickets_mian.marca_temporal` puede venir en varios formatos tipo:
 *       "3/4/2025", "03/04/2025", "2025-03-04", "2025/03/04", etc.
 *   - Se construyen varios patrones ILIKE y se combinan con `.or(...)`.
 *
 * 🗂 Output principal:
 * {
 *   total: 42,
 *   items: [
 *     { label:"Ender 3", count:10, porcentaje:23.8 },
 *     ...
 *   ],
 *   group: "modelo" | "estado" | "tecnico",
 *   idsByEstado:  { [estado]: [{id,cliente}, ...] } | undefined,
 *   idsByModelo:  { [modelo]: [{id,cliente}, ...] } | undefined,
 *   idsByTecnico: { [tecnico]:[{id,cliente}, ...] } | undefined
 * }
 */
export const GET: APIRoute = async ({ url, locals }) => {
  // ============================================================
  // 1. Autorización: sólo admin
  // ============================================================
  const perfil = (locals as any)?.perfil as { rol?: string; admin?: boolean } | undefined;
  const isAdmin = (perfil?.rol === 'admin') || (perfil?.admin === true);

  if (!isAdmin) {
    // Si no es admin devolvemos 403 con JSON
    return new Response(
      JSON.stringify({ error: 'Permisos insuficientes' }),
      {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  // ============================================================
  // 2. Parámetros de filtrado temporal y tipo de agrupación
  // ============================================================

  // Intentamos leer year y month desde query params
  let year = Number(url.searchParams.get('year'));
  let month = Number(url.searchParams.get('month'));

  // period=YYYY-MM también es válido (pisa year/month si existe)
  const period = url.searchParams.get('period');

  // group= determina cómo agrupamos el conteo
  //  - "modelo": agrupa por nombre de modelo de impresora
  //  - "estado": agrupa por estado actual del ticket
  //  - "tecnico": agrupa por la persona que figura como técnico
  const groupParam = (url.searchParams.get('group') || 'modelo').toLowerCase();

  const group: 'modelo' | 'estado' | 'tecnico' =
    groupParam === 'estado'
      ? 'estado'
      : groupParam === 'tecnico'
      ? 'tecnico'
      : 'modelo'; // default → 'modelo'

  // Si no vino year/month pero vino period=YYYY-MM -> usamos eso.
  if ((!year || !month) && period && /^\d{4}-\d{2}$/.test(period)) {
    const [y, m] = period.split('-').map(Number);
    year = y;
    month = m;
  }

  // Validamos parámetros de período: sin mes válido → 400
  if (!year || !month || month < 1 || month > 12) {
    return new Response(
      JSON.stringify({
        error: 'Parámetros inválidos. Use year+month o period=YYYY-MM.',
      }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  // ============================================================
  // 3. Construir el filtro OR por fecha (marca_temporal)
  // ============================================================
  //
  // marca_temporal se guarda en texto estilo:
  //   "3/4/2025"
  //   "03/04/2025"
  //   "2025-03-04"
  //   "2025/03/04"
  //
  // Queremos "todos los tickets del mes YEAR-MONTH".
  // Generamos varios patrones ILIKE y los combinamos en un .or(...)
  //
  // Ej: para year=2025, month=3
  //   patterns = [
  //     "3/%/2025%",   // M/D/YYYY sin padding
  //     "03/%/2025%",  // MM/D/YYYY con padding si month<10
  //     "2025-03-%",   // YYYY-MM-DD
  //     "2025/03/%"    // YYYY/MM/DD
  //   ]
  //
  // Después armamos orExpr:
  //   "marca_temporal.ilike.3/%/2025%,marca_temporal.ilike.03/%/2025%,marca_temporal.ilike.2025-03-%,marca_temporal.ilike.2025/03/%"
  //
  const y = String(year);
  const mNoPad = String(month);              // "3"
  const mPad   = String(month).padStart(2, '0'); // "03"

  const patterns = [
    // Formato tipo "3/.../2025%"
    `${mNoPad}/%/${y}%`,
    // Si el mes es <10 también agregamos "03/.../2025%"
    ...(mNoPad !== mPad ? [`${mPad}/%/${y}%`] : []),
    // Formato ISO-like "2025-03-%"
    `${y}-${mPad}-%`,
    // Formato "2025/03/%"
    `${y}/${mPad}/%`,
  ];

  // Suponiendo que Supabase .or() recibe una lista separada por coma
  // de condiciones "col.ilike.patron"
  const orExpr = patterns
    .map(p => `marca_temporal.ilike.${p}`)
    .join(',');

  // ============================================================
  // 4. Query principal
  // ============================================================
  //
  // Traemos de tickets_mian:
  //   - id
  //   - marca_temporal (para el filtro por mes)
  //   - estado
  //   - tecnico_id (fk)
  //   - cliente_id (fk)
  //   - impresoras:impresora_id (...) → join a la tabla `impresoras`
  //       pedimos `modelo`
  //   - tecnicos:tecnico_id (...)     → join a la tabla `tecnicos`
  //       pedimos `email`
  //   - clientes:cliente_id (...)     → join a la tabla `cliente`
  //       pedimos `cliente` (nombre mostrado al usuario)
  //
  // Nota: Supabase devuelve estos joins como
  //       { tecnicos: {email:...} } o { tecnicos: [ {email:...} ] }
  //       según cómo esté la relación. Abajo los normalizamos.
  //
  const { data, error } = await supabase
    .from('tickets_mian')
    .select(`
      id,
      marca_temporal,
      estado,
      tecnico_id,
      cliente_id,
      impresoras:impresora_id ( modelo ),
      tecnicos:tecnico_id ( email ),
      clientes:cliente_id ( cliente )
    `)
    .or(orExpr); // aplicamos el filtro de mes/año con OR de ILIKE

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  // ============================================================
  // 5. Helpers para leer joins con formato inestable
  // ============================================================

  /**
   * getTecnicoEmail(row):
   * Normaliza la parte del join "tecnicos" para sacar un email único.
   * - Si supabase devuelve `tecnicos` como array, usamos [0].
   * - Si lo devuelve como objeto suelto, usamos ese.
   * - Si no hay nada, devolvemos null.
   *
   * Luego, más adelante usamos sólo la parte antes de la "@"
   * para agrupar por técnico.
   */
  const getTecnicoEmail = (row: any): string | null => {
    const t = Array.isArray(row?.tecnicos)
      ? row.tecnicos[0]
      : row?.tecnicos;

    const email: string | undefined = t?.email || undefined;
    return email ? String(email) : null;
  };

  /**
   * getClienteNombre(row):
   * Saca el "cliente" (nombre de la persona/empresa dueña del equipo)
   * usando el join `clientes`.
   */
  const getClienteNombre = (row: any): string | null => {
    const c = Array.isArray(row?.clientes)
      ? row.clientes[0]
      : row?.clientes;

    const nom: string | undefined = c?.cliente || undefined;
    return nom ? String(nom) : null;
  };

  // ============================================================
  // 6. Agregación principal (conteo por grupo)
  // ============================================================
  //
  // Vamos a recorrer todos los tickets del mes filtrado y contar
  // cuántos pertenecen a cada "clave".
  //
  // - group === 'estado'  → clave = row.estado
  // - group === 'tecnico' → clave = local-part del email del técnico
  // - group === 'modelo'  → clave = impresoras.modelo
  //
  // Si la clave no existe o viene vacía, usamos labels fallback:
  //   - 'Sin estado'
  //   - 'Sin técnico'
  //   - 'Sin modelo'
  //
  // Guardamos resultados en `counts: Map<string, number>`.
  //
  const counts = new Map<string, number>();

  for (const row of (data ?? [])) {
    let key: string;

    if (group === 'estado') {
      // Agrupamos por estado textual del ticket.
      key =
        (row as any)?.estado?.toString().trim() ||
        'Sin estado';

    } else if (group === 'tecnico') {
      // Agrupamos por técnico usando el email:
      //   "juan.perez@algo" -> "juan.perez"
      const email = getTecnicoEmail(row);
      key = email
        ? (email.split('@')[0] || 'Sin técnico')
        : 'Sin técnico';

    } else {
      // group === 'modelo'
      // Tomamos el modelo de la impresora del join.
      // O usamos 'Sin modelo' si no hay dato.
      key =
        (row as any)?.impresoras?.modelo
          ?.toString()
          .trim() ||
        'Sin modelo';
    }

    // sumamos 1 al contador de esa key
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  const total = (data ?? []).length; // tickets totales del período

  // Pasamos counts => array ordenable, y calculamos porcentaje.
  const itemsAll = Array.from(counts.entries())
    .map(([label, count]) => ({
      label,
      count,
      porcentaje: total ? (count / total) * 100 : 0,
    }))
    // Ordenamos de mayor a menor cantidad
    .sort((a, b) => b.count - a.count);

  // Sólo devolvemos top 10 categorías (para no mandar 500 grupos al front)
  const TOP_N = 10;
  const items = itemsAll.slice(0, TOP_N);

  // ============================================================
  // 7. Drill-down: mapear cada grupo -> lista de {id, cliente}
  // ============================================================
  //
  // La idea:
  //   además del ranking, queremos poder decir
  //   "en 'Ender 3' ¿qué tickets específicos hay?"
  //
  // Vamos a armar objetos:
  //   idsByEstado?:  { [estado]:  [{id,cliente}, ...] }
  //   idsByModelo?:  { [modelo]:  [{id,cliente}, ...] }
  //   idsByTecnico?: { [tecnico]: [{id,cliente}, ...] }
  //
  // Para evitar duplicados de ticket repetidos, después normalizamos.
  //
  function pushId(
    map: Record<string, { id: number; cliente: string | null }[]>,
    key: string,
    row: any
  ) {
    if (!map[key]) map[key] = [];
    map[key].push({
      id: row.id as number,
      cliente: getClienteNombre(row),
    });
  }

  /**
   * Elimina duplicados por ID dentro de cada array.
   * Ordena por id asc para que sea más prolijo de leer en el front.
   */
  function normalizeIdsMap(
    map: Record<string, { id: number; cliente: string | null }[]>
  ) {
    for (const k of Object.keys(map)) {
      const seen = new Set<number>();
      map[k] = map[k]
        .filter((it) => {
          if (seen.has(it.id)) return false;
          seen.add(it.id);
          return true;
        })
        .sort((a, b) => a.id - b.id);
    }
  }

  // Creamos solo el mapa que corresponda según el tipo de agrupación actual.
  // (Los otros quedan como undefined para no mandar basura que no se usa.)
  let idsByEstado:
    | Record<string, { id: number; cliente: string | null }[]>
    | undefined;
  let idsByModelo:
    | Record<string, { id: number; cliente: string | null }[]>
    | undefined;
  let idsByTecnico:
    | Record<string, { id: number; cliente: string | null }[]>
    | undefined;

  if (group === 'estado') {
    // Agrupación por estado → armamos idsByEstado
    idsByEstado = {};
    for (const row of (data ?? [])) {
      const key =
        (row as any)?.estado?.toString().trim() ||
        'Sin estado';
      pushId(idsByEstado, key, row);
    }
    normalizeIdsMap(idsByEstado);
  } else if (group === 'modelo') {
    // Agrupación por modelo → armamos idsByModelo
    idsByModelo = {};
    for (const row of (data ?? [])) {
      const key =
        (row as any)?.impresoras?.modelo
          ?.toString()
          .trim() ||
        'Sin modelo';
      pushId(idsByModelo, key, row);
    }
    normalizeIdsMap(idsByModelo);
  } else if (group === 'tecnico') {
    // Agrupación por técnico → armamos idsByTecnico
    idsByTecnico = {};
    for (const row of (data ?? [])) {
      const email = getTecnicoEmail(row);
      const key = email
        ? (email.split('@')[0] || 'Sin técnico')
        : 'Sin técnico';
      pushId(idsByTecnico, key, row);
    }
    normalizeIdsMap(idsByTecnico);
  }

  // ============================================================
  // 8. Respuesta final JSON
  // ============================================================
  //
  // - `total`: cantidad total de tickets encontrados este período.
  // - `items`: top 10 grupos con count y porcentaje.
  // - `group`: string de agrupación ("modelo" | "estado" | "tecnico").
  // - `idsByX`: mapa de drill-down SOLO para el tipo pedido.
  //
  // Ejemplo de respuesta para group=modelo:
  // {
  //   total: 42,
  //   items: [
  //     { label:"Ender 3", count:10, porcentaje:23.8 },
  //     ...
  //   ],
  //   group:"modelo",
  //   idsByEstado: undefined,
  //   idsByModelo: {
  //     "Ender 3": [ {id: 12, cliente:"Juan"}, {id: 48, cliente:"Laura"} ],
  //     ...
  //   },
  //   idsByTecnico: undefined
  // }
  //
  return new Response(
    JSON.stringify({
      total,
      items,
      group,
      idsByEstado,
      idsByModelo,
      idsByTecnico,
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
};
