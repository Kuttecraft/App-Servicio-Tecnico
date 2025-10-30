// src/pages/api/actualizarTicket.ts
import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';
import { resolverAutor, nombreAutor } from '../../lib/resolverAutor';

/**
 * normDate()
 * ------------------------------------------------------------------
 * Normaliza fechas a formato 'YYYY-MM-DD' a partir de varios posibles
 * formatos de entrada del form/UI.
 *
 * Acepta:
 *  - ISO "2025-10-29T14:32:00.000Z" → "2025-10-29"
 *  - "2025-10-29"
 *  - "2025/10/29"
 *  - "10/29/2025" (MM/DD/YYYY)
 *  - "29/10/2025" (DD/MM/YYYY)
 *  - "10-29-2025" / "29-10-2025"
 *  - Cualquier string que Date() pueda parsear razonablemente
 *
 * Heurística para fechas ambiguas tipo "10/11/2025":
 * - Si un campo es > 12, asumimos que el >12 es día.
 * - Si ambos <= 12, asumimos M/D/YYYY.
 *
 * Devuelve:
 *  - "YYYY-MM-DD" si pudo interpretar
 *  - null si no
 */
function normDate(value?: string | null): string | null {
  if (!value) return null;
  const sRaw = value.trim();
  if (!sRaw || sRaw.toLowerCase() === 'null' || sRaw.toLowerCase() === 'undefined') return null;

  // Sacar hora si viene en ISO, o después de un espacio
  const s = sRaw.split('T')[0].split(' ')[0];

  // Caso claro: YYYY-MM-DD
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  // Caso YYYY/MM/DD
  m = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (m) {
    return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  }

  // Caso M/D/YYYY o D/M/YYYY
  m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (m) {
    const a = parseInt(m[1], 10);
    const b = parseInt(m[2], 10);
    const yyyy = m[3];

    // heurística para separar mes/día
    let dd: number;
    let mm: number;
    if (b > 12 && a <= 12) {
      mm = a;
      dd = b;
    } else if (a > 12 && b <= 12) {
      dd = a;
      mm = b;
    } else {
      // Ambos <= 12 → asumimos M/D
      mm = a;
      dd = b;
    }

    return `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  }

  // Fallback: confiar en Date()
  const d = new Date(sRaw);
  if (!isNaN(d.getTime())) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  return null;
}

/**
 * toMDYFromAny()
 * ------------------------------------------------------------------
 * Convierte una fecha cualquiera a formato "M/D/YYYY"
 * (sin ceros a la izquierda).
 *
 * Esto se usa para `marca_temporal`, que en tu flujo parece ser
 * la "fecha formulario" en formato estilo US.
 *
 * Devuelve null si no logra interpretar.
 */
function toMDYFromAny(value?: string | null): string | null {
  if (!value) return null;
  const sRaw = String(value).trim();
  if (!sRaw || sRaw.toLowerCase() === 'null' || sRaw.toLowerCase() === 'undefined') return null;

  // YYYY-MM-DD
  let m = sRaw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${Number(m[2])}/${Number(m[3])}/${m[1]}`;

  // YYYY/MM/DD
  m = sRaw.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (m) return `${Number(m[2])}/${Number(m[3])}/${m[1]}`;

  // M/D/YYYY o D/M/YYYY
  m = sRaw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (m) {
    const a = parseInt(m[1], 10);
    const b = parseInt(m[2], 10);
    const yyyy = m[3];

    let mm: number;
    let dd: number;

    if (b > 12 && a <= 12) {
      // asumimos a=mes
      mm = a;
      dd = b;
    } else if (a > 12 && b <= 12) {
      // asumimos b=mes
      dd = a;
      mm = b;
    } else {
      // ambiguo → lo tomamos como M/D
      mm = a;
      dd = b;
    }

    return `${mm}/${dd}/${yyyy}`;
  }

  // Fallback con Date
  const d = new Date(sRaw);
  if (!isNaN(d.getTime())) {
    return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
  }
  return null;
}

/**
 * normalizarMontoTexto()
 * ------------------------------------------------------------------
 * Limpia montos tipeados por el usuario ("$10.000", "10.000,50", "10000.5")
 * y devuelve un string listo para guardar / parsear:
 *
 * - Deja solo dígitos, coma, punto y signo '-'.
 * - Si hay coma y punto, asume que el ÚLTIMO separador es el decimal.
 *   El otro se considera separador de miles y se elimina.
 * - Si sólo hay coma, la convierte en punto.
 * - Devuelve la string normalizada ("10000.5").
 * - Si no es un número finito, devuelve la string igual (debug-friendly).
 * - Devuelve null si estaba vacío.
 */
function normalizarMontoTexto(input?: string | null): string | null {
  if (input == null) return null;
  let s = String(input).trim();
  if (!s) return null;

  s = s.replace(/[^0-9.,-]/g, ''); // dejamos dígitos/coma/punto/-

  const tienePunto = s.includes('.');
  const tieneComa = s.includes(',');

  if (tienePunto && tieneComa) {
    // Último separador = decimal
    const lastP = s.lastIndexOf('.');
    const lastC = s.lastIndexOf(',');
    const decimalSep = lastP > lastC ? '.' : ',';
    const milesSep = decimalSep === '.' ? ',' : '.';

    // sacamos miles
    s = s.split(milesSep).join('');

    // si decimal era coma -> lo pasamos a punto
    if (decimalSep === ',') {
      s = s.replace(',', '.');
    }
  } else if (tieneComa && !tienePunto) {
    // sólo coma -> coma es decimal
    s = s.replace(',', '.');
  }

  const n = Number(s);
  if (!isFinite(n)) return String(s || '');

  return s;
}

/**
 * normalizarDniCuit()
 * ------------------------------------------------------------------
 * Limpia / formatea DNI o CUIT para guardar en DB de manera consistente.
 *
 * Reglas:
 * - 7 dígitos => X.XXX.XXX
 * - 8 dígitos => XX.XXX.XXX
 * - 11 dígitos => XX-XXXXXXXX-X  (formato CUIT/CUIL)
 * - Otros casos => se devuelve tal cual vino (sin tirar error).
 */
function normalizarDniCuit(input?: string | null): string | null {
  if (input == null) return null;
  const raw = String(input).trim();
  if (!raw) return null;

  const digits = raw.replace(/\D+/g, '');

  if (digits.length === 7) {
    return `${digits[0]}.${digits.slice(1, 4)}.${digits.slice(4)}`;
  }

  if (digits.length === 8) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  }

  if (digits.length === 11) {
    return `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(10)}`;
  }

  return raw;
}

/**
 * jsonError()
 * ------------------------------------------------------------------
 * Helper utilitario para responder un error JSON consistente, con status custom.
 */
function jsonError(message: string, status = 500) {
  return new Response(
    JSON.stringify({ error: message }),
    {
      status,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

/* ===========================
   Helpers de display en el diff
   =========================== */

/**
 * show()
 * Muestra `'—'` si el valor es null/undefined/''. Si no, lo castea a string.
 * Sirve para logs en el comentario automático.
 */
const show = (v: any) =>
  v === null || v === undefined || v === '' ? '—' : String(v);

/**
 * formatARSForShow()
 * Muestra un valor numérico como pesos AR con hasta 2 decimales visibles si existen.
 *
 * - Si v es null/'' → '—'
 * - Si v no parsea limpio → devuelve show(v)
 * - Si parsea → "$12.345" o "$12.345,50" según corresponda
 *
 * La idea es que en el comentario (historial de cambios) quede legible.
 */
function formatARSForShow(v?: string | null) {
  if (v == null || v === '') return '—';
  const n = Number(v);
  if (!isFinite(n)) return show(v);

  // Detectar cuántos decimales reales tiene v.
  const dec = (String(v).split('.')[1]?.length || 0);
  const d = dec ? Math.min(2, dec) : 0;

  return (
    '$' +
    n.toLocaleString('es-AR', {
      minimumFractionDigits: d,
      maximumFractionDigits: d,
    })
  );
}

/**
 * boolShow()
 * Convierte booleanos o strings "true"/"false" a "Sí" / "No" / "—".
 * Usado para cosas como "pagado", "cubre garantía", etc.
 */
const boolShow = (v: string | boolean | null | undefined) =>
  v === true || v === 'true'
    ? 'Sí'
    : v === false || v === 'false'
    ? 'No'
    : '—';

/**
 * imgShow()
 * Para mostrar en el diff si había imagen o no.
 * Si hay URL → "Cargada", si no → "—".
 */
const imgShow = (v: any) => (v ? 'Cargada' : '—');

/**
 * Flag para suprimir un diff en particular:
 * Si no querés loguear "modelo/máquina" dos veces, lo dejás en false.
 */
const REGISTRAR_CAMBIO_MAQUINA_REPARADA = false;

/**
 * Handler principal POST /api/actualizarTicket
 * ------------------------------------------------------------------
 * Este endpoint es el "cerebro" del editor de ticket.
 *
 * Lo que hace:
 *   1. Determina el ID del ticket desde varios lugares seguros
 *      (form, params, query, referer).
 *   2. Carga el estado actual del ticket + datos relacionados (cliente,
 *      impresora, delivery, presupuesto).
 *   3. Parsea el form recibido:
 *        - campos texto
 *        - flags
 *        - fechas
 *        - técnico asignado
 *        - valores de delivery
 *        - valores de presupuesto
 *   4. Sube/baja imágenes al storage de Supabase (principal, ticket, extra).
 *   5. Escribe todos los cambios en las tablas correspondientes.
 *   6. Genera automáticamente un comentario con un diff humano de lo que cambió.
 *   7. Redirige al detalle del ticket.
 *
 * Si algo falla en el camino → responde jsonError().
 */
export const POST: APIRoute = async ({ request, params, locals }) => {
  try {
    // Perfil del usuario logueado (viene de middleware en locals).
    // Se usa para decisiones de permisos (por ejemplo, algunos campos delivery
    // sólo los puede tocar admin).
    const perfil = (locals as any)?.perfil as { rol?: string; admin?: boolean } | undefined;
    const isAdmin =
      (perfil?.rol === 'admin') || (perfil?.admin === true);

    /* ---------------------------
       1. Resolver el ID del ticket
       --------------------------- */

    const formData = await request.formData();

    // Intentamos en orden campos comunes del form.
    let id: string | undefined;
    for (const k of ['ticketId', 'id', 'ticket', 'ticket_id']) {
      const v = formData.get(k);
      if (
        typeof v === 'string' &&
        v.trim() &&
        v.trim().toLowerCase() !== 'undefined'
      ) {
        id = v.trim();
        break;
      }
    }

    // Fallback: params de la ruta (por ejemplo /api/actualizarTicket/[id])
    if (!id && params?.id) id = String(params.id).trim();

    // Fallback: query string (?id=123)
    if (!id) {
      const u = new URL(request.url);
      const qid = u.searchParams.get('id');
      if (qid && qid.trim()) id = qid.trim();
    }

    // Fallback: intentar parsear el Referer /editar/:id
    if (!id) {
      const ref = request.headers.get('referer') || request.headers.get('Referrer') || '';
      const m = ref.match(/\/editar\/(\d+)/);
      if (m && m[1]) id = m[1];
    }

    // Si no logramos sacar el id
    if (!id) return jsonError('ID no proporcionado', 400);

    // Validar que sea número válido (>0)
    const idNum = Number(id);
    if (!Number.isFinite(idNum) || idNum <= 0) {
      return jsonError(`ID inválido: ${id}`, 400);
    }

    /* -----------------------------------
       2. Manejo de archivos e input plano
       ----------------------------------- */

    // Archivos de imagen del form
    const imagenArchivo       = formData.get('imagenArchivo') as File | null;
    const borrarImagen        = (formData.get('borrarImagen') as string | null) || 'false';

    const imagenTicketArchivo = formData.get('imagenTicketArchivo') as File | null;
    const borrarImagenTicket  = (formData.get('borrarImagenTicket') as string | null) || 'false';

    const imagenExtraArchivo  = formData.get('imagenExtraArchivo') as File | null;
    const borrarImagenExtra   = (formData.get('borrarImagenExtra') as string | null) || 'false';

    // Campos no file → a objeto plano de strings
    const fields: Record<string, string> = {};
    formData.forEach((val, key) => {
      if (typeof val === 'string') {
        fields[key] = val.trim();
      }
    });

    /* --------------------------------------------
       3. Obtener estado actual del ticket y anexos
       -------------------------------------------- */

    // Traemos datos actuales del ticket (para calcular diffs y merges)
    const { data: tRow, error: tErr } = await supabase
      .from('tickets_mian')
      .select(
        'cliente_id, impresora_id, marca_temporal, fecha_de_reparacion, estado, maquina_reparada, tecnico_id, notas_del_tecnico, notas_del_cliente, imagen, imagen_ticket, imagen_extra'
      )
      .eq('id', idNum)
      .single();

    if (tErr || !tRow) {
      return jsonError(
        `No se pudo obtener el ticket (id=${String(id)})`,
        500
      );
    }

    // Guardamos URLs actuales de imágenes para diffs más tarde
    const prevImgMain   = tRow.imagen ?? null;
    const prevImgTicket = tRow.imagen_ticket ?? null;
    const prevImgExtra  = tRow.imagen_extra ?? null;

    // Datos actuales del cliente asociado (solo si hay cliente_id)
    let clienteOld: any = null;
    if (tRow.cliente_id) {
      const { data } = await supabase
        .from('cliente')
        .select('dni_cuit, correo_electronico, whatsapp, comentarios')
        .eq('id', tRow.cliente_id)
        .maybeSingle();
      clienteOld = data || null;
    }

    // Datos actuales de la impresora asociada (si hay impresora_id)
    let impresoraOld: any = null;
    if (tRow.impresora_id) {
      const { data } = await supabase
        .from('impresoras')
        .select('modelo, maquina, numero_de_serie, tamano_de_boquilla')
        .eq('id', tRow.impresora_id)
        .maybeSingle();
      impresoraOld = data || null;
    }

    // Estado actual de delivery
    const { data: deliveryOld } = await supabase
      .from('delivery')
      .select('pagado, medio_de_entrega, cotizar_delivery, informacion_adicional_delivery')
      .eq('ticket_id', idNum)
      .maybeSingle();

    // Último presupuesto asociado
    const { data: presOld } = await supabase
      .from('presupuestos')
      .select('monto, link_presupuesto, cubre_garantia, fecha_presupuesto')
      .eq('ticket_id', idNum)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();

    /* -------------------------------------------------
       4. Preparar estructura para diffs / comentarios
       ------------------------------------------------- */

    const cambios: string[] = [];

    /**
     * pushCambio()
     * Agrega una línea al array `cambios` si el valor "después" difiere del "antes".
     * Permite un formateador opcional para valores especiales (dinero, booleanos...).
     */
    const pushCambio = (
      label: string,
      before: any,
      after: any,
      formatter?: (v: any) => string
    ) => {
      const f = formatter ?? show;
      const b = f(before);
      const a = f(after);
      if (b === a) return;
      cambios.push(`- <strong>${label}</strong>: de "${b}" a "${a}"`);
    };

    /* ---------------------------------
       5. Actualización de TICKET (main)
       --------------------------------- */

    // Normalizar fechas que vienen del form
    // marca_temporal  -> formato M/D/YYYY (toMDYFromAny)
    // fecha_de_reparacion -> formato YYYY-MM-DD (normDate)
    const fechaFormularioMDY = toMDYFromAny(fields.fechaFormulario);
    const fechaListoNorm     = normDate(fields.timestampListo);

    const estadoForm = (fields.estado ?? '').trim();

    // Preparamos payload base para `tickets_mian`
    // (Sólo seteamos campos que realmente queremos tocar)
    const datosTicketsMian: Record<string, any> = {
      estado: estadoForm || tRow.estado || null,
      marca_temporal: (fechaFormularioMDY ?? tRow.marca_temporal) || null,
      fecha_de_reparacion: (fechaListoNorm ?? tRow.fecha_de_reparacion) || null,
      notas_del_tecnico: fields.notaTecnico || null,

      // "maquina_reparada" viene de 'maquina' o 'modelo' del form
      // y es un string "qué máquina reparé". Si no vino, dejamos valor previo.
      maquina_reparada:
        fields.maquina ||
        fields.modelo ||
        tRow.maquina_reparada ||
        null,
    };

    // Diffs relevantes visibles:
    pushCambio('estado', tRow.estado, datosTicketsMian.estado);
    pushCambio(
      'fecha formulario',
      tRow.marca_temporal,
      datosTicketsMian.marca_temporal
    );
    pushCambio(
      'fecha listo',
      tRow.fecha_de_reparacion,
      datosTicketsMian.fecha_de_reparacion
    );
    pushCambio(
      'nota técnico',
      tRow.notas_del_tecnico,
      datosTicketsMian.notas_del_tecnico
    );

    // Esto puede duplicarse con "máquina (modelo)" abajo,
    // así que sólo lo registramos si activamos el flag global.
    if (REGISTRAR_CAMBIO_MAQUINA_REPARADA) {
      pushCambio(
        'modelo/máquina',
        tRow.maquina_reparada,
        datosTicketsMian.maquina_reparada
      );
    }

    // También podemos guardar "Detalle del problema" como notas_del_cliente
    if (typeof fields.detalleCliente === 'string') {
      pushCambio(
        'detalle del problema',
        tRow.notas_del_cliente,
        fields.detalleCliente
      );
      datosTicketsMian.notas_del_cliente = fields.detalleCliente;
    }

    /* ---------------------------------
       6. Técnico asignado al ticket
       --------------------------------- */

    if ('tecnico_id' in fields) {
      // técnico actual
      const prevTecId = tRow.tecnico_id ?? null;

      // técnico nuevo (parseado desde string)
      let newTecId: number | null = null;
      const rawTec = fields.tecnico_id;

      if (rawTec === '') {
        datosTicketsMian.tecnico_id = null;
        newTecId = null; // "sin asignar"
      } else {
        const tid = Number(rawTec);
        if (Number.isFinite(tid) && tid > 0) {
          datosTicketsMian.tecnico_id = tid;
          newTecId = tid;
        } else {
          datosTicketsMian.tecnico_id = null;
          newTecId = null;
        }
      }

      // ¿Realmente cambió el técnico?
      const changed = (prevTecId ?? null) !== (newTecId ?? null);

      if (changed) {
        // Para mostrar en el diff "de <tecnico A> a <tecnico B>"
        // tratamos de obtener ambos nombres/alias en un solo query.
        const ids: number[] = [];
        if (prevTecId != null) ids.push(prevTecId);
        if (newTecId != null && newTecId !== prevTecId) ids.push(newTecId);

        let prevLabel = '—';
        let newLabel = '—';

        if (ids.length > 0) {
          const { data: tecs } = await supabase
            .from('tecnicos')
            .select('id, nombre, apellido, email')
            .in('id', ids);

          const byId = new Map<number, any>();
          (tecs ?? []).forEach((t: any) => byId.set(Number(t.id), t));

          const labelFrom = (t: any): string => {
            if (!t) return '—';

            const email = (t.email ?? '').toString().trim();
            if (email && email.includes('@')) {
              return email.split('@')[0];
            }

            const nom = (t.nombre ?? '').toString().trim();
            const ape = (t.apellido ?? '').toString().trim();
            const full = `${nom} ${ape}`.trim();
            return full || `#${t.id}`;
          };

          if (prevTecId != null) prevLabel = labelFrom(byId.get(prevTecId));
          if (newTecId != null) newLabel = labelFrom(byId.get(newTecId));
        }

        cambios.push(
          `- <strong>técnico asignado</strong>: de "${prevLabel}" a "${newLabel}"`
        );
      }
    } else if (typeof fields.tecnico === 'string') {
      // legacy field, no hacemos diff con eso
    }

    /* -----------------------------
       7. Datos del CLIENTE asociado
       ----------------------------- */

    if (tRow.cliente_id) {
      const updateCliente: Record<string, any> = {};

      // DNI / CUIT
      if (typeof fields.dniCuit === 'string' && fields.dniCuit !== '') {
        const nuevo = normalizarDniCuit(fields.dniCuit);
        pushCambio('DNI/CUIT', clienteOld?.dni_cuit, nuevo);
        updateCliente.dni_cuit = nuevo;
      }

      // WhatsApp
      if (typeof fields.whatsapp === 'string' && fields.whatsapp !== '') {
        pushCambio('WhatsApp', clienteOld?.whatsapp, fields.whatsapp);
        updateCliente.whatsapp = fields.whatsapp;
      }

      // Correo
      if (typeof fields.correo === 'string' && fields.correo !== '') {
        pushCambio(
          'correo del cliente',
          clienteOld?.correo_electronico,
          fields.correo
        );
        updateCliente.correo_electronico = fields.correo;
      }

      // Comentarios del cliente
      if (typeof fields.detalleCliente === 'string') {
        pushCambio(
          'comentarios del cliente',
          clienteOld?.comentarios,
          fields.detalleCliente
        );
        updateCliente.comentarios = fields.detalleCliente;
      }

      // Sólo hacemos update si realmente hay algo que escribir
      if (Object.keys(updateCliente).length > 0) {
        const { error } = await supabase
          .from('cliente')
          .update(updateCliente)
          .eq('id', tRow.cliente_id);

        if (error) {
          return jsonError(
            'Error al actualizar cliente: ' + error.message,
            500
          );
        }
      }
    }

    /* ---------------------------------
       8. IMPRESORA (actualizar o crear)
       --------------------------------- */

    // Campos relevantes que pueden haber llegado del form
    const maquina     = fields.maquina || '';      // modelo real de la impresora
    const numeroSerie = fields.numeroSerie || '';
    const boquilla    = fields.boquilla || '';

    if (maquina || numeroSerie || boquilla) {
      if (tRow.impresora_id) {
        // Ya hay impresora asociada → update parcial

        const payloadImpresora: any = {};

        if (maquina) {
          payloadImpresora.modelo = maquina;
          payloadImpresora.maquina = maquina;

          const oldModelo =
            impresoraOld?.modelo ?? impresoraOld?.maquina ?? null;

          pushCambio('máquina (modelo)', oldModelo, maquina);
        }

        if (numeroSerie) {
          pushCambio(
            'n° de serie',
            impresoraOld?.numero_de_serie,
            numeroSerie
          );
          payloadImpresora.numero_de_serie = numeroSerie;
        }

        if ('boquilla' in fields) {
          pushCambio(
            'tamaño de boquilla',
            impresoraOld?.tamano_de_boquilla,
            boquilla
          );
          payloadImpresora.tamano_de_boquilla = boquilla || null;
        }

        if (Object.keys(payloadImpresora).length > 0) {
          const { error } = await supabase
            .from('impresoras')
            .update(payloadImpresora)
            .eq('id', tRow.impresora_id);

          if (error) {
            return jsonError(
              'Error al actualizar impresora: ' + error.message,
              500
            );
          }
        }
      } else {
        // No había impresora vinculada → crear/vincular una

        let impresoraId: number | null = null;

        // (1) Intentar matchear por número de serie si vino
        if (numeroSerie) {
          const { data: impFound } = await supabase
            .from('impresoras')
            .select('id')
            .eq('numero_de_serie', numeroSerie)
            .maybeSingle();

          if (impFound?.id) {
            impresoraId = impFound.id;
          }
        }

        // (2) Si no encontramos por serie, probamos por modelo (maquina)
        if (!impresoraId && (maquina || numeroSerie || boquilla)) {
          const maquinaSafe =
            maquina || 'Desconocida';
          const serieSafe =
            numeroSerie ||
            `TEMP-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`;

          const { data: byCombo } = await supabase
            .from('impresoras')
            .select('id')
            .match({ modelo: maquinaSafe, maquina: maquinaSafe })
            .limit(1)
            .maybeSingle();

          if (byCombo?.id) {
            impresoraId = byCombo.id;
          } else {
            // (3) Crear impresora mínima
            const { data: impNew, error: impErr } = await supabase
              .from('impresoras')
              .insert({
                modelo: maquinaSafe,
                maquina: maquinaSafe,
                numero_de_serie: serieSafe,
                tamano_de_boquilla: boquilla || null,
              })
              .select('id')
              .single();

            if (impErr) {
              return jsonError(
                'No se pudo crear la impresora: ' + impErr.message,
                500
              );
            }

            impresoraId = impNew!.id;
          }

          // Registramos cambios semánticos en el diff
          pushCambio('máquina (modelo)', null, maquina || 'Desconocida');
          if (numeroSerie) {
            pushCambio('n° de serie', null, numeroSerie);
          }
          if (boquilla) {
            pushCambio('tamaño de boquilla', null, boquilla);
          }
        }

        // (4) Asociar impresora_id al ticket
        if (impresoraId) {
          const { error: linkErr } = await supabase
            .from('tickets_mian')
            .update({ impresora_id: impresoraId })
            .eq('id', idNum);

          if (linkErr) {
            return jsonError(
              'No se pudo vincular la impresora al ticket: ' +
                linkErr.message,
              500
            );
          }
        }
      }
    }

    /* -------------------------------------------------------
       9. DELIVERY (cobrado, medio, costo, info extra, etc.)
       ------------------------------------------------------- */

    const deliveryUpd: Record<string, any> = {};

    // Campo pagado/cobrado
    if (typeof fields.cobrado === 'string') {
      // Guardamos como string "true"/"false"/null (coherente con tu BD)
      const nuevo =
        fields.cobrado === 'true'
          ? 'true'
          : fields.cobrado === 'false'
          ? 'false'
          : null;

      pushCambio(
        'cobrado',
        deliveryOld?.pagado,
        nuevo,
        boolShow
      );
      deliveryUpd.pagado = nuevo;
    }

    // Resto de campos de delivery sólo si es admin
    if (isAdmin) {
      if (typeof fields.medioEntrega === 'string') {
        pushCambio(
          'modo de entrega',
          deliveryOld?.medio_de_entrega,
          fields.medioEntrega
        );
        deliveryUpd.medio_de_entrega =
          fields.medioEntrega || null;
      }

      if (typeof fields.costoDelivery === 'string') {
        const normNew = normalizarMontoTexto(fields.costoDelivery);
        pushCambio(
          'costo delivery',
          deliveryOld?.cotizar_delivery,
          normNew,
          formatARSForShow
        );
        deliveryUpd.cotizar_delivery = normNew;
      }

      if (typeof fields.infoDelivery === 'string') {
        pushCambio(
          'info delivery',
          deliveryOld?.informacion_adicional_delivery,
          fields.infoDelivery
        );
        deliveryUpd.informacion_adicional_delivery =
          fields.infoDelivery || null;
      }
    }

    // Upsert manual de delivery:
    // Intentamos update por ticket_id. Si no actualiza nada → insert.
    if (Object.keys(deliveryUpd).length > 0) {
      const { data: updRows, error: updErr } = await supabase
        .from('delivery')
        .update(deliveryUpd)
        .eq('ticket_id', idNum)
        .select('id');

      if (updErr) {
        return jsonError(
          'Error al actualizar delivery: ' + updErr.message,
          500
        );
      }

      const affected = Array.isArray(updRows)
        ? updRows.length
        : updRows
        ? 1
        : 0;

      if (affected === 0) {
        const insPayload = { ticket_id: idNum, ...deliveryUpd };
        const { error: insErr } = await supabase
          .from('delivery')
          .insert(insPayload);

        if (insErr) {
          return jsonError(
            'Error al crear delivery: ' + insErr.message,
            500
          );
        }
      }
    }

    /* -------------------------------------------------------
       10. PRESUPUESTO (monto, link, garantía, fecha, estado)
       ------------------------------------------------------- */

    // Fecha presupuesto normalizada (YYYY-MM-DD)
    const fechaPresuNorm = normDate(fields.timestampPresupuesto);

    // Preparamos objeto de update para presupuestos
    // Ponemos undefined si el form no envió ese campo → para no sobreescribirlo
    const presUpdate: Record<string, any> = {
      monto:
        'monto' in fields
          ? normalizarMontoTexto(fields.monto)
          : undefined,
      link_presupuesto:
        'linkPresupuesto' in fields
          ? fields.linkPresupuesto || null
          : undefined,
      cubre_garantia:
        (fields.cubre_garantia ?? fields.cubreGarantia) === 'true'
          ? 'true'
          : 'false',
    };
    if (fechaPresuNorm) {
      presUpdate.fecha_presupuesto = fechaPresuNorm;
    }

    let presGuardado = false;

    // Ejecutamos la lógica de presupuesto sólo si el form tocó al menos un campo
    if (
      Object.values(presUpdate).some((v) => v !== undefined)
    ) {
      // Armar diffs humanos
      if ('monto' in fields) {
        pushCambio(
          'monto',
          presOld?.monto,
          normalizarMontoTexto(fields.monto),
          formatARSForShow
        );
      }

      if ('linkPresupuesto' in fields) {
        pushCambio(
          'link presupuesto',
          presOld?.link_presupuesto,
          fields.linkPresupuesto || null
        );
      }

      if (
        'cubreGarantia' in fields ||
        'cubre_garantia' in fields
      ) {
        const newBool =
          (fields.cubre_garantia ?? fields.cubreGarantia) ===
          'true'
            ? 'true'
            : 'false';

        pushCambio(
          'cubre garantía',
          presOld?.cubre_garantia,
          newBool,
          boolShow
        );
      }

      if (fechaPresuNorm) {
        pushCambio(
          'fecha presupuesto',
          presOld?.fecha_presupuesto,
          fechaPresuNorm
        );
      }

      // Intentamos update en presupuestos
      const { data: updRows, error: updErr } = await supabase
        .from('presupuestos')
        .update(presUpdate)
        .eq('ticket_id', idNum)
        .select('id');

      if (updErr) {
        return jsonError(
          'Error al actualizar presupuesto: ' +
            updErr.message,
          500
        );
      }

      const afectadas = Array.isArray(updRows)
        ? updRows.length
        : updRows
        ? 1
        : 0;

      if (afectadas === 0) {
        // No había presupuesto previo → insert nuevo
        const presInsert = {
          ticket_id: idNum,
          ...presUpdate,
        };

        const { data: insRows, error: insErr } = await supabase
          .from('presupuestos')
          .insert(presInsert)
          .select('id');

        if (insErr) {
          return jsonError(
            'Error al crear presupuesto: ' +
              insErr.message,
            500
          );
        }

        presGuardado = Array.isArray(insRows)
          ? insRows.length > 0
          : Boolean(insRows);
      } else {
        presGuardado = true;
      }
    }

    // Si guardamos presupuesto, forzamos el estado del ticket a "P. Enviado"
    if (presGuardado) {
      const { error: estadoErr } = await supabase
        .from('tickets_mian')
        .update({ estado: 'P. Enviado' })
        .eq('id', idNum);

      if (estadoErr) {
        return jsonError(
          'No se pudo marcar el estado como P. Enviado: ' +
            estadoErr.message,
          500
        );
      }

      // Notar: esto ya puede hacer que el diff 'estado' muestre cambio
      // si antes tenía otro estado.
    }

    /* ---------------------------------
       11. IMÁGENES (Storage Supabase)
       --------------------------------- */

    // Helper: inferir contentType (fallback webp)
    const contentType = (f: File | null) =>
      (f as any)?.type || 'image/webp';

    /**
     * subirImagen()
     * Sube (o upsertea) una imagen al bucket de Supabase Storage en
     * la ruta dada y guarda la URL pública en el campo apropiado del ticket.
     *
     * campo puede ser: 'imagen', 'imagen_ticket', 'imagen_extra'
     */
    const subirImagen = async (
      archivo: File,
      nombreArchivo: string,
      campo:
        | 'imagen'
        | 'imagen_ticket'
        | 'imagen_extra'
    ) => {
      const { error: uploadError } = await supabase.storage
        .from('imagenes')
        .upload(nombreArchivo, archivo, {
          cacheControl: '3600',
          upsert: true,
          contentType: contentType(archivo),
        });

      if (uploadError) {
        throw new Error(
          `Error al subir ${campo}: ${uploadError.message}`
        );
      }

      const { data } = supabase.storage
        .from('imagenes')
        .getPublicUrl(nombreArchivo);

      (datosTicketsMian as any)[campo] =
        data.publicUrl;
    };

    /**
     * borrarImagenCampo()
     * Borra un archivo del bucket (si existe) y pone null
     * en el campo correspondiente del ticket.
     */
    const borrarImagenCampo = async (
      nombreArchivo: string,
      campo:
        | 'imagen'
        | 'imagen_ticket'
        | 'imagen_extra'
    ) => {
      await supabase.storage
        .from('imagenes')
        .remove([nombreArchivo]);

      (datosTicketsMian as any)[campo] = null;
    };

    // Helper para interpretar flags tipo "delete"/"true"
    const mustDelete = (
      v: string | null | undefined
    ) => v === 'delete' || v === 'true';

    // Imagen principal
    const nombreArchivo = `public/${idNum}.webp`;
    if (imagenArchivo && imagenArchivo.size > 0) {
      await subirImagen(
        imagenArchivo,
        nombreArchivo,
        'imagen'
      );
    } else if (mustDelete(borrarImagen)) {
      await borrarImagenCampo(
        nombreArchivo,
        'imagen'
      );
    }

    // Imagen de ticket (por ejemplo, comprobante de compra/reparación)
    const nombreArchivoTicket = `public/${idNum}_ticket.webp`;
    if (
      imagenTicketArchivo &&
      imagenTicketArchivo.size > 0
    ) {
      await subirImagen(
        imagenTicketArchivo,
        nombreArchivoTicket,
        'imagen_ticket'
      );
    } else if (mustDelete(borrarImagenTicket)) {
      await borrarImagenCampo(
        nombreArchivoTicket,
        'imagen_ticket'
      );
    }

    // Imagen extra
    const nombreArchivoExtra = `public/${idNum}_extra.webp`;
    if (
      imagenExtraArchivo &&
      imagenExtraArchivo.size > 0
    ) {
      await subirImagen(
        imagenExtraArchivo,
        nombreArchivoExtra,
        'imagen_extra'
      );
    } else if (mustDelete(borrarImagenExtra)) {
      await borrarImagenCampo(
        nombreArchivoExtra,
        'imagen_extra'
      );
    }

    // Luego de potenciales cambios de imagen, reflejamos en el diff:
    const afterImgMain =
      (datosTicketsMian as any).imagen ?? prevImgMain;
    const afterImgTicket =
      (datosTicketsMian as any).imagen_ticket ??
      prevImgTicket;
    const afterImgExtra =
      (datosTicketsMian as any).imagen_extra ??
      prevImgExtra;

    pushCambio(
      'imagen principal',
      prevImgMain,
      afterImgMain,
      imgShow
    );
    pushCambio(
      'imagen del ticket',
      prevImgTicket,
      afterImgTicket,
      imgShow
    );
    pushCambio(
      'imagen extra',
      prevImgExtra,
      afterImgExtra,
      imgShow
    );

    /* ------------------------------------------------------
       12. Guardar cambios en tickets_mian
       ------------------------------------------------------ */

    {
      const { error } = await supabase
        .from('tickets_mian')
        .update(datosTicketsMian)
        .eq('id', idNum);

      if (error) {
        return jsonError(
          'Error al actualizar ticket: ' + error.message,
          500
        );
      }
    }

    /* ------------------------------------------------------
       13. Comentario automático de auditoría (historial)
       ------------------------------------------------------
       Creamos una entrada en ticket_comentarios con el diff de cambios.
       - Determinamos autor a partir de locals (resolverAutor).
       - Construimos un mensaje HTML-like con una lista de cambios.
    */

    {
      // Determinar autor (técnico actual o usuario actual) para el comentario
      const autor = await resolverAutor(locals);

      if (!autor || autor.activo === false) {
        // No se pudo identificar quién hizo el cambio → error controlado
        return jsonError(
          'No se pudo determinar el autor para comentar cambios',
          401
        );
      }

      // Nombre amigable del autor:
      // Preferimos el local-part del email (antes de @). Si no hay, usamos nombre y apellido
      const userEmail: string | null =
        (locals as any)?.user?.email ||
        (locals as any)?.perfil?.email ||
        (locals as any)?.usuario?.email ||
        null;

      const localPart =
        typeof userEmail === 'string' &&
        userEmail.includes('@')
          ? userEmail.split('@')[0]
          : nombreAutor(autor);

      // Sólo insertar comentario si hubo cambios
      if (cambios.length > 0) {
        const encabezado = `${localPart} cambió los siguientes datos:`;
        const cuerpo = cambios.join('\n'); // usamos saltos de línea con <strong> ya inyectado en cada ítem
        const mensaje = `${encabezado}\n${cuerpo}`
          .replace(/\r\n/g, '\n')
          .replace(/\r/g, '\n');

        const { error: cErr } = await supabase
          .from('ticket_comentarios')
          .insert({
            ticket_id: idNum,
            autor_id: autor.id,
            mensaje,
          });

        if (cErr) {
          return jsonError(
            'No se pudo crear el comentario de cambios: ' +
              cErr.message,
            500
          );
        }
      }
    }

    /* ------------------------------------------------------
       14. Redirect final
       ------------------------------------------------------
       Si todo salió bien:
       - respondemos 303 See Other
       - el Location apunta al detalle del ticket actualizado
    */

    return new Response(null, {
      status: 303,
      headers: { Location: `/detalle/${idNum}` },
    });
  } catch (err: any) {
    // Cualquier excepción inesperada cae acá
    return jsonError(
      'Error inesperado: ' + (err?.message || String(err)),
      500
    );
  }
};
