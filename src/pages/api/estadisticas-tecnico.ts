import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';

/**
 * Tipo base que representa cada fila del SELECT a `tickets_mian` con los joins.
 * Ojo: Supabase cuando hacés `select(relacion:fk (...))` te puede devolver:
 *   - un objeto (cuando es 1:1)
 *   - un array con un objeto (dependiendo de la config de RLS o relación)
 *   - null si no hay relación
 *
 * Por eso usamos `any[] | objeto | null` y luego lo normalizamos.
 */
type Row = {
  id: number;

  // Campos del ticket
  marca_temporal?: string | null;        // fecha de ingreso, tipo "M/D/YYYY" o variantes
  estado?: string | null;                // "Lista", "Reparación", "Entregada", etc.
  fecha_de_reparacion?: string | null;   // cuándo quedó lista / se reparó (varios formatos)
  maquina_reparada?: string | null;      // texto manual con modelo/máquina reparada

  // Relación impresora
  impresora_id?: number | null;
  impresoras?: any[] | { modelo?: string | null } | null;

  // Relación técnico
  tecnico_id?: number | null;
  tecnicos?: any[] | { email?: string | null } | null;

  // Relación cliente
  cliente_id?: number | null;
  clientes?: any[] | { cliente?: string | null } | null;
};

/**
 * Estados que consideramos que equivalen a "impresora reparada / trabajo finalizado".
 * Además, más abajo tenemos otra heurística: si tiene fecha_de_reparacion => también la consideramos reparada.
 */
const ESTADOS_REPARADA = ['Lista', 'Entregada', 'Archivada'];

/**
 * Devuelve la "local part" del email (antes de la @),
 * todo en minúsculas y sin caracteres invisibles raros.
 *
 * Ej:
 *  "juan.perez@empresa.com" -> "juan.perez"
 *
 * Esto se usa para matchear un técnico del lado frontend/backoffice contra
 * el técnico logueado ahora. O contra un técnico pedido vía querystring.
 */
const localPart = (email?: string | null) => {
  let e = String(email || '').toLowerCase();

  // limpiamos caracteres invisibles tipo zero width joiner que a veces quedan
  e = e.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();

  return e.includes('@') ? e.split('@')[0] : e;
};

/**
 * Normaliza una relación Supabase (que puede venir como array o como objeto único)
 * y la convierte en UN SOLO objeto o null.
 *
 * Ej:
 *   { tecnicos: [{ email: "a@b.com" }] } -> { email: "a@b.com" }
 *   { tecnicos: { email: "a@b.com"} }    -> { email: "a@b.com" }
 *   { tecnicos: null }                   -> null
 */
const normalizeJoin = <T,>(val: T | T[] | null | undefined): T | null =>
  Array.isArray(val)
    ? ((val[0] ?? null) as any)
    : ((val as any) ?? null);

/**
 * Heurística para decidir si este row "representa una impresora real"
 * que cuente para las estadísticas.
 *
 * Contamos la impresora si:
 *  - El join a `impresoras` tiene al menos un modelo.
 *    (impresoras.modelo suele ser el campo "modelo"/"máquina")
 *  - O si `maquina_reparada` (texto libre) tiene algo.
 *
 * Si ambas cosas están vacías => asumimos que no hay impresora clara.
 */
const esImpresora = (row: Row) => {
  const imp = normalizeJoin(row.impresoras) as any;
  const tieneJoin = !!imp?.modelo;
  const tieneTexto = !!String(row.maquina_reparada || '').trim();
  return tieneJoin || tieneTexto;
};

/**
 * Heurística para marcar que está "reparada":
 *  - Si el estado está en ESTADOS_REPARADA.
 *  - O si hay fecha_de_reparacion cargada (cualquier string no vacío).
 *
 * Nota: esto NO garantiza que el cliente la retiró, pero nos da
 * una métrica para "la saqué adelante".
 */
const esReparada = (row: Row) => {
  const est = String(row.estado || '').trim();
  if (ESTADOS_REPARADA.includes(est)) return true;
  return !!String(row.fecha_de_reparacion || '').trim();
};

/**
 * patronesMes(year, month)
 * ------------------------
 * arma una OR-condition para supabase.or(...) con ILIKEs sobre `marca_temporal`
 * para filtrar por mes y año.
 *
 * ¿Por qué tan feo?
 *   Porque `marca_temporal` la guardás como texto libre tipo "3/14/2025" (M/D/YYYY),
 *   o a veces "03/14/2025", o a veces "2025-03-14".
 *
 * Entonces generamos patrones posibles:
 *   `${mNoPad}/%/${y}%`     -> "3/%/2025"
 *   `${mPad}/%/${y}%`       -> "03/%/2025" (si month <10)
 *   `${y}-${mPad}-%`        -> "2025-03-%"
 *   `${y}/${mPad}/%`        -> "2025/03/%"
 *
 * Supabase `.or("A,B,C")` acepta OR encadenados.
 * Cada item es tipo `col.ilike.valor`.
 *
 * Ej final: "marca_temporal.ilike.3/%/2025%,marca_temporal.ilike.03/%/2025%,marca_temporal.ilike.2025-03-%,marca_temporal.ilike.2025/03/%"
 */
function patronesMes(year: number, month: number) {
  const y = String(year);
  const mNoPad = String(month);
  const mPad = String(month).padStart(2, '0');

  const patterns = [
    // "3/%/2025%"
    `${mNoPad}/%/${y}%`,
    // Si month <10 también agregamos "03/%/2025%"
    ...(mNoPad !== mPad ? [`${mPad}/%/${y}%`] : []),
    // "2025-03-%"
    `${y}-${mPad}-%`,
    // "2025/03/%"
    `${y}/${mPad}/%`,
  ];

  // Supabase espera la OR así: "col.ilike.patron1,col.ilike.patron2,..."
  return patterns
    .map((p) => `marca_temporal.ilike.${p}`)
    .join(',');
}

/**
 * normDateLite()
 * --------------
 * Intenta convertir varias formas de fecha a "YYYY-MM-DD".
 * Es un best-effort para mostrar fechas limpias (sin hora) en el response.
 *
 * Soporta formatos tipo:
 *   - "2025-03-14"
 *   - "2025/3/14"
 *   - "3/14/2025"  / "14/3/2025" (detecta cuál es mes y cuál día usando heurística)
 *   - Date parsable por new Date()
 *
 * Si no se pudo interpretar, vuelve null.
 */
function normDateLite(value?: string | null): string | null {
  if (!value) return null;
  const s = String(value).trim();
  if (!s) return null;

  // nos quedamos sólo con la parte de fecha si viene "2025-03-14T12:00..."
  const onlyDate = s.split('T')[0].split(' ')[0];

  // Caso 1: YYYY-MM-DD
  let m = onlyDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  // Caso 2: YYYY/MM/DD
  m = onlyDate.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (m) {
    return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
  }

  // Caso 3: M/D/YYYY ó D/M/YYYY -> heurística según rangos válidos de mes
  m = onlyDate.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (m) {
    const a = parseInt(m[1],10);
    const b = parseInt(m[2],10);
    const yyyy = m[3];

    let dd: number;
    let mm: number;

    // si un campo es >12 asumimos que ese es el día
    if (b > 12 && a <= 12) {
      mm = a; dd = b;
    } else if (a > 12 && b <= 12) {
      dd = a; mm = b;
    } else {
      // ambiguo -> default "a=mes, b=día"
      mm = a; dd = b;
    }

    return `${yyyy}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`;
  }

  // Último intento usando el parser nativo de Date
  const d = new Date(onlyDate);
  if (!isNaN(d.getTime())) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth()+1).padStart(2,'0');
    const dd = String(d.getDate()).padStart(2,'0');
    return `${yyyy}-${mm}-${dd}`;
  }

  return null;
}

/**
 * diffDays()
 * ----------
 * Diferencia en días calendario entre dos fechas "YYYY-MM-DD".
 * Esto incluye fines de semana, NO es "días hábiles".
 *
 * Devuelve null si alguna fecha es inválida.
 */
function diffDays(
  ymdStart?: string | null,
  ymdEnd?: string | null
): number | null {
  if (!ymdStart || !ymdEnd) return null;

  const [y1,m1,d1] = ymdStart.split('-').map(Number);
  const [y2,m2,d2] = ymdEnd.split('-').map(Number);

  const a = new Date(Date.UTC(y1, m1-1, d1));
  const b = new Date(Date.UTC(y2, m2-1, d2));

  const ms = b.getTime() - a.getTime();
  if (!Number.isFinite(ms)) return null;

  // 1 día son 86400000 ms
  return Math.round(ms / 86400000);
}

/**
 * fetchTickets(orFecha)
 * ---------------------
 * Hace el SELECT principal a `tickets_mian` con joins "manuales"
 * a impresoras, tecnicos y clientes.
 *
 * Parámetro:
 *   orFecha -> string lista de condiciones OR (para supabase.or(...))
 *              generado por patronesMes(). Si null => trae todo.
 *
 * SELECT detalle:
 *   - id, marca_temporal, estado, fecha_de_reparacion, maquina_reparada
 *   - impresora_id y join a impresoras.modelo
 *   - tecnico_id y join a tecnicos.email
 *   - cliente_id y join a clientes.cliente
 *
 * Devuelve array de Row.
 */
async function fetchTickets(orFecha: string | null) {
  let qb = supabase
    .from('tickets_mian')
    .select(`
      id,
      marca_temporal,
      estado,
      fecha_de_reparacion,
      maquina_reparada,
      impresora_id,
      impresoras:impresora_id ( modelo ),
      tecnico_id,
      tecnicos:tecnico_id ( email ),
      cliente_id,
      clientes:cliente_id ( cliente )
    `);

  // Si se pasó filtro de mes/año, lo metemos con .or()
  if (orFecha) qb = qb.or(orFecha);

  // Ejecutamos la query
  const { data, error } = await qb;
  if (error) throw new Error(error.message);

  // Supabase devuelve `data` tipada como unknown[].
  // La casteamos a Row[] porque sabemos qué pedimos.
  return (data as Row[]) || [];
}

/**
 * fetchUltimosPresupuestos(ticketIds)
 * -----------------------------------
 * Para cada ticket, queremos saber cuál fue SU ÚLTIMO presupuesto
 * y en particular la `fecha_presupuesto`.
 *
 * Estrategia:
 *   - Traemos todos los presupuestos de esos ticket_ids, ordenados por id DESC.
 *   - Para cada ticket_id nos quedamos con la primera aparición (id más alto).
 *
 * Devuelve:
 *   Map<ticket_id, fecha_presupuesto | null>
 */
async function fetchUltimosPresupuestos(ticketIds: number[]) {
  if (!ticketIds.length) return new Map<number, string | null>();

  const { data, error } = await supabase
    .from('presupuestos')
    .select('id, ticket_id, fecha_presupuesto')
    .in('ticket_id', ticketIds)
    .order('id', { ascending: false });

  if (error) throw new Error(error.message);

  const map = new Map<number, string | null>();

  for (const row of (data || [])) {
    const tid = Number((row as any).ticket_id);
    // Primer registro que vemos de ese ticket_id ya es el más reciente
    if (!map.has(tid)) {
      map.set(
        tid,
        (row as any).fecha_presupuesto ?? null
      );
    }
  }

  return map;
}

/**
 * GET /api/estadisticas-tecnico
 * ---------------------------------------------------
 * Este endpoint arma estadísticas de productividad / desempeño
 * para un técnico dado.
 *
 * Query params soportados:
 *
 *  - tecnico=juanp    → (local-part de email del técnico)
 *    Si no viene, usamos el email de la sesión actual (`locals`).
 *
 *  - all=true         → ignora filtros de mes/año y trae histórico completo.
 *
 *  - year=2025&month=10
 *    ó period=2025-10 → filtran por un mes concreto.
 *    Si no viene nada, toma el mes actual.
 *
 *  - debug=true       → agrega metadata interna de cálculo.
 *
 * Respuesta JSON:
 * {
 *   tecnico: "juanp",
 *   year: 2025,
 *   month: 10,
 *   totalImpresoras: 8,
 *   totalImpresorasReparadas: 5,
 *   items: [
 *     {
 *       id: 123,
 *       modelo: "Ender 3",
 *       estado: "Lista",
 *       fecha_presupuesto: "2025-10-02",
 *       fecha_lista: "2025-10-05",
 *       tardanza_dias: 3,
 *       reparada: true,
 *       cliente: "Juan Perez"
 *     },
 *     ...
 *   ],
 *   debug: { ... } // sólo si debug=true
 * }
 */
export const GET: APIRoute = async ({ url, locals }) => {
  try {
    // ---------------------------------
    // 1) ¿Debug?
    // ---------------------------------
    const debug =
      (url.searchParams.get('debug') || '')
        .toLowerCase() === 'true';

    // ---------------------------------
    // 2) Determinar técnico objetivo
    // ---------------------------------
    // Orden de prioridad:
    //   a) ?tecnico= en la query
    //   b) email de la sesión actual (locals.perfil.email o locals.user.email)
    //
    // Guardamos solo la "localPart" (antes de @).
    const qTec = (url.searchParams.get('tecnico') || '')
      .trim()
      .toLowerCase();

    const perfil = (locals as any)?.perfil || {};
    const emailSesion: string | undefined =
      perfil?.email || (locals as any)?.user?.email;

    const tecnicoLocal = qTec || (emailSesion
      ? localPart(emailSesion)
      : '');

    if (!tecnicoLocal) {
      // Si ni query ni sesión tienen técnico,
      // no podemos filtrar, así que devolvemos 400.
      return new Response(
        JSON.stringify({ error: 'Falta el técnico' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // ---------------------------------
    // 3) Determinar período a consultar
    // ---------------------------------
    //
    // Tenemos varias formas de pedir rango temporal:
    //  - all=true: ignora mes y año, trae histórico
    //  - period=YYYY-MM: ej "2025-10"
    //  - year=2025&month=10
    //
    // Si no es all y no viene nada válido,
    // usamos el mes actual como fallback.
    const all =
      (url.searchParams.get('all') || '')
        .toLowerCase() === 'true';

    let year = Number(url.searchParams.get('year'));
    let month = Number(url.searchParams.get('month'));

    const period = url.searchParams.get('period');
    const now = new Date();

    // period=YYYY-MM pisa year/month si es válido
    if ((!year || !month) && period && /^\d{4}-\d{2}$/.test(period)) {
      const [y, m] = period.split('-').map(Number);
      year = y;
      month = m;
    }

    // fallback al mes actual si no es all
    if (
      !all &&
      (!year || !month || month < 1 || month > 12)
    ) {
      year = now.getFullYear();
      month = now.getMonth() + 1;
    }

    // ---------------------------------
    // 4) Fetch tickets desde Supabase
    // ---------------------------------
    //
    // - Si NO es "all", intentamos primero filtrar por ese mes
    //   usando patronesMes(year, month).
    //
    // - Si no trae nada (p.ej. porque marca_temporal tiene
    //   formatos raros y no matcheó), hacemos fallback a traer TODO
    //   (intento='historico').
    //
    // - Si es "all=true", directamente vamos por TODO.
    let rows: Row[] = [];
    let intento = 'mes'; // para debug

    if (!all) {
      rows = await fetchTickets(
        patronesMes(year!, month!)
      );

      if (!rows.length) {
        // fallback: traemos histórico completo
        rows = await fetchTickets(null);
        intento = 'historico';
      }
    } else {
      rows = await fetchTickets(null);
      intento = 'historico(force)';
    }

    // ---------------------------------
    // 5) Filtrar sólo las filas de ESTE técnico
    // ---------------------------------
    //
    // Cada row trae `tecnicos` (join con la tabla tecnicos),
    // que tiene (o debería tener) el email del técnico.
    //
    // Comparamos localPart(email_db) con tecnicoLocal (query o sesión).
    const filasDelTecnico = rows.filter((r) => {
      const tec = normalizeJoin(r.tecnicos) as any;
      const email = tec?.email || null;
      return localPart(email) === tecnicoLocal;
    });

    // ---------------------------------
    // 6) De esas filas, quedarnos sólo con las que
    //    realmente representan una "impresora"
    // ---------------------------------
    const filasImpresoras = filasDelTecnico.filter(
      esImpresora
    );

    // ---------------------------------
    // 7) Para calcular "tardanza_dias":
    //    necesitamos fecha_presupuesto y fecha_lista.
    //
    //    fecha_presupuesto = último presupuesto cargado
    //    fecha_lista = fecha_de_reparacion del ticket
    //
    //    Hacemos una query adicional a presupuestos,
    //    agarrando el último por ticket.
    // ---------------------------------
    const ids = filasImpresoras.map((r) => r.id);
    const mapPres = await fetchUltimosPresupuestos(ids);

    // ---------------------------------
    // 8) Construimos el array final `items`
    //    con datos limpios para el frontend
    // ---------------------------------
    const items = filasImpresoras.map((r) => {
      // Join impresoras -> para obtener modelo
      const imp = normalizeJoin(r.impresoras) as any;
      // Join clientes -> para mostrar nombre cliente
      const cli = normalizeJoin(r.clientes) as any;

      // preferimos el modelo de la impresora;
      // si no hay, usamos `maquina_reparada` como fallback
      const modelo =
        imp?.modelo ||
        r.maquina_reparada ||
        'Sin modelo';

      const cliente =
        cli?.cliente || '—';

      // Obtenemos fecha de presupuesto más reciente (puede ser null)
      const fechaPresRaw = mapPres.get(r.id) ?? null;

      // Normalizamos "fecha_presupuesto" y "fecha_de_reparacion"
      // a YYYY-MM-DD para generar diffDays
      const fechaPres = normDateLite(fechaPresRaw);
      const fechaLista = normDateLite(
        r.fecha_de_reparacion || null
      );

      // tardanza_dias: diferencia en días calendario
      // entre la fecha del último presupuesto y la fecha lista
      const tardanzaDias =
        (fechaPres && fechaLista)
          ? diffDays(fechaPres, fechaLista)
          : null;

      return {
        id: r.id,
        modelo,
        estado: r.estado || 'Sin estado',

        // campos nuevos útiles para métricas
        fecha_presupuesto: fechaPres, // YYYY-MM-DD | null
        fecha_lista: fechaLista,      // YYYY-MM-DD | null
        tardanza_dias: tardanzaDias,  // número o null

        reparada: esReparada(r),      // bool heurístico
        cliente,
      };
    });

    // ---------------------------------
    // 9) Agregados / resumen numérico
    // ---------------------------------
    const totalImpresoras = items.length;
    const totalImpresorasReparadas = items.filter(
      (i) => i.reparada
    ).length;

    // ---------------------------------
    // 10) Armamos la respuesta final
    // ---------------------------------
    //
    // Importante:
    //  - year & month sólo los devolvemos si se usó el filtro mensual
    //    con éxito (intento === 'mes'). Si venimos con histórico,
    //    devolvemos null en esos campos.
    //
    //  - si `debug=true`, agregamos un bloque "debug" con info
    //    de cómo se armó todo y sample de filas crudas.
    return new Response(
      JSON.stringify(
        {
          tecnico: tecnicoLocal,

          year:
            (!all && intento === 'mes')
              ? year
              : null,
          month:
            (!all && intento === 'mes')
              ? month
              : null,

          totalImpresoras,
          totalImpresorasReparadas,
          items,

          ...(debug
            ? {
                debug: {
                  intento,                  // "mes" | "historico" | "historico(force)"
                  totRowsRaw: rows.length, // cuántas filas trajimos al principio
                  totRowsDelTecnico:
                    filasDelTecnico.length,
                  sample: filasDelTecnico
                    .slice(0, 5)
                    .map((r) => ({
                      id: r.id,
                      tecnico_id: r.tecnico_id,
                      tecEmail:
                        normalizeJoin(
                          r.tecnicos
                        )?.email || null,
                      cliente:
                        normalizeJoin(
                          r.clientes
                        )?.cliente || null,
                      marca_temporal:
                        r.marca_temporal,
                      estado: r.estado,
                      impresora_id:
                        r.impresora_id,
                      maquina_reparada:
                        r.maquina_reparada,
                      fecha_de_reparacion:
                        r.fecha_de_reparacion,
                    })),
                },
              }
            : {}),
        }
      ),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (err: any) {
    // Error inesperado -> 500 con mensaje
    return new Response(
      JSON.stringify({
        error: err?.message || String(err),
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
