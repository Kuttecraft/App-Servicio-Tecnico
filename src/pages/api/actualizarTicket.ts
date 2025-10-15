// src/pages/api/actualizarTicket.ts
import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';
import { resolverAutor, nombreAutor } from '../../lib/resolverAutor';

/**
 * Normaliza fechas a formato 'YYYY-MM-DD' a partir de varios posibles formatos de entrada:
 * - ISO completo (corta a la fecha) / 'YYYY-MM-DD'
 * - 'YYYY/MM/DD'
 * - 'MM/DD/YYYY' o 'DD/MM/YYYY' (detecta por rango de mes/día)
 * - Strings parseables por Date()
 * Devuelve null si no se puede interpretar.
 */
function normDate(value?: string | null): string | null {
  if (!value) return null;
  const sRaw = value.trim();
  if (!sRaw || sRaw.toLowerCase() === 'null' || sRaw.toLowerCase() === 'undefined') return null;

  // Quita hora si viene en ISO; también corta si trae espacios
  const s = sRaw.split('T')[0].split(' ')[0];

  // Caso YYYY-MM-DD
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  // Caso YYYY/MM/DD
  m = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;

  // Caso M/D/YYYY o D/M/YYYY (ambigua → heurística por rangos)
  m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (m) {
    const a = parseInt(m[1],10), b = parseInt(m[2],10), yyyy = m[3];
    let dd:number, mm:number;
    // Si uno de los campos > 12, deducimos rol por descarte
    if (b > 12 && a <= 12) { mm = a; dd = b; }
    else if (a > 12 && b <= 12) { dd = a; mm = b; }
    else { mm = a; dd = b; } // Ambiguo → asumimos M/D
    return `${yyyy}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`;
  }

  // Fallback: Date nativo (acepta varios formatos)
  const d = new Date(sRaw);
  if (!isNaN(d.getTime())) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth()+1).padStart(2,'0');
    const dd = String(d.getDate()).padStart(2,'0');
    return `${yyyy}-${mm}-${dd}`;
  }
  return null;
}

/**
 * Convierte la fecha entrada a 'M/D/YYYY' (sin ceros a la izquierda).
 * Acepta varios formatos y usa heurística M/D vs D/M cuando es ambiguo.
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

  // M/D/YYYY o D/M/YYYY (resuelve por rango)
  m = sRaw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (m) {
    const a = parseInt(m[1],10), b = parseInt(m[2],10), yyyy = m[3];
    let mm:number, dd:number;
    if (b > 12 && a <= 12) { mm = a; dd = b; }       // asumimos M/D
    else if (a > 12 && b <= 12) { dd = a; mm = b; }  // venía D/M
    else { mm = a; dd = b; }                         // ambiguo → M/D
    return `${mm}/${dd}/${yyyy}`;
  }

  // Fallback: Date nativo
  const d = new Date(sRaw);
  if (!isNaN(d.getTime())) {
    return `${d.getMonth()+1}/${d.getDate()}/${d.getFullYear()}`;
  }
  return null;
}

/**
 * Normaliza montos escritos como “$10.000”, “10.000,50”, “10000.5”, etc.
 * → devuelve string numérico estable usando punto como separador decimal.
 * - Mantiene el signo.
 * - Remueve símbolos no numéricos excepto '.' y ','.
 * - Si hay ambos separadores, toma como decimal el último que aparece.
 */
function normalizarMontoTexto(input?: string | null): string | null {
  if (input == null) return null;
  let s = String(input).trim();
  if (!s) return null;

  // Dejar solo dígitos, coma, punto y signo menos
  s = s.replace(/[^0-9.,-]/g, '');

  const tienePunto = s.includes('.');
  const tieneComa = s.includes(',');

  if (tienePunto && tieneComa) {
    // Regla: el separador decimal es el último símbolo entre coma/punto
    const lastP = s.lastIndexOf('.');
    const lastC = s.lastIndexOf(',');
    const decimalSep = lastP > lastC ? '.' : ',';
    const milesSep = decimalSep === '.' ? ',' : '.';

    s = s.split(milesSep).join(''); // quitar miles
    if (decimalSep === ',') s = s.replace(',', '.'); // decimal como punto
  } else if (tieneComa && !tienePunto) {
    // Solo coma → usar coma como decimal
    s = s.replace(',', '.');
  } // Solo punto o solo dígitos → queda igual

  // Si puede convertirse a número, devolver tal cual la cadena limpiada
  const n = Number(s);
  if (!isFinite(n)) return String(s || '');
  return s;
}

/**
 * Normaliza DNI/CUIT para almacenamiento (servidor = fuente de verdad).
 * - 7 dígitos → X.XXX.XXX
 * - 8 dígitos → XX.XXX.XXX
 * - 11 dígitos → XX-XXXXXXXX-X (CUIT/CUIL)
 * Si no coincide, devuelve el raw.
 */
function normalizarDniCuit(input?: string | null): string | null {
  if (input == null) return null;
  const raw = String(input).trim();
  if (!raw) return null;
  const digits = raw.replace(/\D+/g, '');
  if (digits.length === 7) {
    return `${digits[0]}.${digits.slice(1,4)}.${digits.slice(4)}`;
  }
  if (digits.length === 8) {
    return `${digits.slice(0,2)}.${digits.slice(2,5)}.${digits.slice(5)}`;
  }
  if (digits.length === 11) {
    return `${digits.slice(0,2)}-${digits.slice(2,10)}-${digits.slice(10)}`;
  }
  return raw;
}

/** Helper para responder JSON de error con status configurable. */
function jsonError(message: string, status = 500) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/* ====== Helpers de "display" para armar un comentario humano-legible con diffs ====== */
/** Muestra '—' para null/undefined/vacío; si no, String(v). */
const show = (v: any) => (v === null || v === undefined || v === '') ? '—' : String(v);

/** Formatea números ARS en es-AR con hasta 2 decimales, o '—' si null/'' . */
function formatARSForShow(v?: string | null) {
  if (v == null || v === '') return '—';
  const n = Number(v);
  if (!isFinite(n)) return show(v);
  const dec = (String(v).split('.')[1]?.length || 0);
  const d = dec ? Math.min(2, dec) : 0;
  return '$' + n.toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d });
}

/** 'Sí'/'No'/'—' para booleanos o strings 'true'/'false'. */
const boolShow = (v: string | boolean | null | undefined) =>
  v === true || v === 'true'
    ? 'Sí'
    : v === false || v === 'false'
    ? 'No'
    : '—';

// 🚩 NUEVO: flag para NO registrar el diff duplicado "modelo/máquina"
const REGISTRAR_CAMBIO_MAQUINA_REPARADA = false;

// 🆕 Helper para mostrar estado de imagen en el diff
const imgShow = (v: any) => (v ? 'Cargada' : '—');

/**
 * Handler principal POST de Astro para actualizar un ticket.
 * - Lee y valida el ID del ticket desde varios orígenes.
 * - Carga estado actual (ticket + relaciones) para calcular diffs.
 * - Aplica actualizaciones parciales según los campos enviados.
 * - Maneja creación/actualización de delivery y presupuesto.
 * - Sube/borra imágenes en Supabase Storage.
 * - Escribe un comentario con los cambios realizados.
 * - Redirige a /detalle/:id si todo OK.
 */
export const POST: APIRoute = async ({ request, params, locals }) => {
  try {
    // Perfil/rol desde locals (puede venir de middleware de autenticación)
    const perfil = (locals as any)?.perfil as { rol?: string; admin?: boolean } | undefined;
    const isAdmin = (perfil?.rol === 'admin') || (perfil?.admin === true);

    // ---------- Obtener ID robustamente desde form/query/params/referer ----------
    const formData = await request.formData();
    let id: string | undefined;

    // Priorizamos keys más comunes del form
    for (const k of ['ticketId', 'id', 'ticket', 'ticket_id']) {
      const v = formData.get(k);
      if (typeof v === 'string' && v.trim() && v.trim().toLowerCase() !== 'undefined') {
        id = v.trim();
        break;
      }
    }
    // Fallback: params de la ruta, query string, o referer (/editar/:id)
    if (!id && params?.id) id = String(params.id).trim();
    if (!id) {
      const u = new URL(request.url);
      const qid = u.searchParams.get('id');
      if (qid && qid.trim()) id = qid.trim();
    }
    if (!id) {
      const ref = request.headers.get('referer') || request.headers.get('Referrer') || '';
      const m = ref.match(/\/editar\/(\d+)/);
      if (m && m[1]) id = m[1];
    }
    if (!id) return jsonError('ID no proporcionado', 400);

    // Validación numérica del ID
    const idNum = Number(id);
    if (!Number.isFinite(idNum) || idNum <= 0) return jsonError(`ID inválido: ${id}`, 400);

    // ---------- Manejo de archivos (imágenes) y flags de borrado ----------
    const imagenArchivo       = formData.get('imagenArchivo') as File | null;
    const borrarImagen        = (formData.get('borrarImagen') as string | null) || 'false';
    const imagenTicketArchivo = formData.get('imagenTicketArchivo') as File | null;
    const borrarImagenTicket  = (formData.get('borrarImagenTicket') as string | null) || 'false';
    const imagenExtraArchivo  = formData.get('imagenExtraArchivo') as File | null;
    const borrarImagenExtra   = (formData.get('borrarImagenExtra') as string | null) || 'false';

    // ---------- Campos de texto planos del form ----------
    const fields: Record<string, string> = {};
    formData.forEach((val, key) => { if (typeof val === 'string') fields[key] = val.trim(); });

    // ---------- Leer fila actual del ticket (datos base para comparar) ----------
    const { data: tRow, error: tErr } = await supabase
      .from('tickets_mian')
      .select('cliente_id, impresora_id, marca_temporal, fecha_de_reparacion, estado, maquina_reparada, tecnico_id, notas_del_tecnico, notas_del_cliente, imagen, imagen_ticket, imagen_extra') // 🆕 sumo campos de imagen
      .eq('id', idNum)
      .single();
    if (tErr || !tRow) return jsonError(`No se pudo obtener el ticket (id=${String(id)})`, 500);

    // 🆕 Estados previos de imágenes (para armar el diff)
    const prevImgMain   = tRow.imagen ?? null;
    const prevImgTicket = tRow.imagen_ticket ?? null;
    const prevImgExtra  = tRow.imagen_extra ?? null;

    // Cargar datos actuales de tablas relacionadas (solo si las vamos a tocar)
    let clienteOld: any = null;
    if (tRow.cliente_id) {
      const { data } = await supabase
        .from('cliente')
        .select('dni_cuit, correo_electronico, whatsapp, comentarios')
        .eq('id', tRow.cliente_id)
        .maybeSingle();
      clienteOld = data || null;
    }

    let impresoraOld: any = null;
    if (tRow.impresora_id) {
      const { data } = await supabase
        .from('impresoras')
        .select('modelo, maquina, numero_de_serie, tamano_de_boquilla')
        .eq('id', tRow.impresora_id)
        .maybeSingle();
      impresoraOld = data || null;
    }

    // Delivery actual vinculado al ticket
    const { data: deliveryOld } = await supabase
      .from('delivery')
      .select('pagado, medio_de_entrega, cotizar_delivery, informacion_adicional_delivery')
      .eq('ticket_id', idNum)
      .maybeSingle();

    // Último presupuesto del ticket (o ninguno)
    const { data: presOld } = await supabase
      .from('presupuestos')
      .select('monto, link_presupuesto, cubre_garantia, fecha_presupuesto')
      .eq('ticket_id', idNum)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();

    // ====== Acumulador de cambios (para comentario automático) ======
    const cambios: string[] = [];
    /**
     * Agrega un cambio al listado si 'before' y 'after' difieren textualmente
     * (con formateo opcional por campo).
     */
    const pushCambio = (label: string, before: any, after: any, formatter?: (v:any)=>string) => {
      const f = formatter ?? show;
      const b = f(before);
      const a = f(after);
      if (b === a) return;
      cambios.push(`- <strong>${label}</strong>: de "${b}" a "${a}"`);
    };

    // ========== Ticket principal ==========
    // Normalizaciones de fechas específicas del formulario
    const fechaFormularioMDY = toMDYFromAny(fields.fechaFormulario); // guardamos en marca_temporal → M/D/YYYY
    const fechaListoNorm     = normDate(fields.timestampListo);      // guardamos en fecha_de_reparacion → YYYY-MM-DD

    const estadoForm = (fields.estado ?? '').trim();

    // Payload base a actualizar en tickets_mian (merge con valores actuales)
    const datosTicketsMian: Record<string, any> = {
      estado: estadoForm || tRow.estado || null,
      marca_temporal: (fechaFormularioMDY ?? tRow.marca_temporal) || null,
      fecha_de_reparacion: (fechaListoNorm ?? tRow.fecha_de_reparacion) || null,
      notas_del_tecnico: fields.notaTecnico || null,
      // 'maquina' o 'modelo' pueden venir de la UI; si no, mantenemos el actual
      maquina_reparada: fields.maquina || fields.modelo || tRow.maquina_reparada || null,
    };

    // Registrar diffs visibles del ticket
    pushCambio('estado', tRow.estado, datosTicketsMian.estado);
    pushCambio('fecha formulario', tRow.marca_temporal, datosTicketsMian.marca_temporal);
    pushCambio('fecha listo', tRow.fecha_de_reparacion, datosTicketsMian.fecha_de_reparacion);
    pushCambio('nota técnico', tRow.notas_del_tecnico, datosTicketsMian.notas_del_tecnico);
    // 🔒 NO registrar “modelo/máquina” para evitar duplicado con “máquina (modelo)”
    if (REGISTRAR_CAMBIO_MAQUINA_REPARADA) {
      pushCambio('modelo/máquina', tRow.maquina_reparada, datosTicketsMian.maquina_reparada);
    }

    // Guardar “Detalle del problema” en notas_del_cliente del ticket, si viene
    if (typeof fields.detalleCliente === 'string') {
      pushCambio('detalle del problema', tRow.notas_del_cliente, fields.detalleCliente);
      datosTicketsMian.notas_del_cliente = fields.detalleCliente;
    }

    // ========== Técnico asignado ==========
    if ('tecnico_id' in fields) {
      const prevTecId = tRow.tecnico_id ?? null;

      // Determinar nuevo técnico desde el form (string → number | null)
      let newTecId: number | null = null;
      const raw = fields.tecnico_id;
      if (raw === '') {
        datosTicketsMian.tecnico_id = null;        // “— Sin asignar —”
        newTecId = null;
      } else {
        const tid = Number(raw);
        if (Number.isFinite(tid) && tid > 0) {
          datosTicketsMian.tecnico_id = tid;
          newTecId = tid;
        } else {
          datosTicketsMian.tecnico_id = null;
          newTecId = null;
        }
      }

      // Evitar trabajo si no hay cambio efectivo
      const changed = (prevTecId ?? null) !== (newTecId ?? null);

      if (changed) {
        // Traer en un solo query ambos técnicos para armar etiquetas legibles
        const ids: number[] = [];
        if (prevTecId != null) ids.push(prevTecId);
        if (newTecId  != null && newTecId !== prevTecId) ids.push(newTecId);

        let prevLabel = '—';
        let newLabel  = '—';

        if (ids.length > 0) {
          const { data: tecs } = await supabase
            .from('tecnicos')
            .select('id, nombre, apellido, email')
            .in('id', ids);

          const byId = new Map<number, any>();
          (tecs ?? []).forEach(t => byId.set(Number(t.id), t));

          // Preferimos local-part del email; si no, nombre y apellido; si no, #id
          const labelFrom = (t: any): string => {
            if (!t) return '—';
            const email = (t.email ?? '').toString().trim();
            if (email && email.includes('@')) return email.split('@')[0];
            const nom = (t.nombre ?? '').toString().trim();
            const ape = (t.apellido ?? '').toString().trim();
            const full = `${nom} ${ape}`.trim();
            return full || `#${t.id}`;
          };

          if (prevTecId != null) prevLabel = labelFrom(byId.get(prevTecId));
          if (newTecId  != null) newLabel  = labelFrom(byId.get(newTecId));
        }

        cambios.push(`- <strong>técnico asignado</strong>: de "${prevLabel}" a "${newLabel}"`);
      }
    } else if (typeof fields.tecnico === 'string') {
      // Campo legacy con nombre libre; no es confiable para ID → no registramos diff
    }

    // ========== Cliente (merge: solo actualizamos lo que venga no vacío) ==========
    if (tRow.cliente_id) {
      const updateCliente: Record<string, any> = {};

      if (typeof fields.dniCuit === 'string' && fields.dniCuit !== '') {
        const nuevo = normalizarDniCuit(fields.dniCuit);
        pushCambio('DNI/CUIT', clienteOld?.dni_cuit, nuevo);
        updateCliente.dni_cuit = nuevo;
      }
      if (typeof fields.whatsapp === 'string' && fields.whatsapp !== '') {
        pushCambio('WhatsApp', clienteOld?.whatsapp, fields.whatsapp);
        updateCliente.whatsapp = fields.whatsapp;
      }
      if (typeof fields.correo === 'string' && fields.correo !== '') {
        pushCambio('correo del cliente', clienteOld?.correo_electronico, fields.correo);
        updateCliente.correo_electronico = fields.correo;
      }
      if (typeof fields.detalleCliente === 'string') {
        pushCambio('comentarios del cliente', clienteOld?.comentarios, fields.detalleCliente);
        updateCliente.comentarios = fields.detalleCliente;
      }

      // Solo tocamos la fila si hay algo que actualizar
      if (Object.keys(updateCliente).length > 0) {
        const { error } = await supabase.from('cliente').update(updateCliente).eq('id', tRow.cliente_id);
        if (error) return jsonError('Error al actualizar cliente: ' + error.message, 500);
      }
    }

    // ========== Impresora (actualiza existente o crea y vincula) ==========
    const maquina      = fields.maquina || ''; // modelo real
    const numeroSerie  = fields.numeroSerie || '';
    const boquilla     = fields.boquilla || '';

    if (maquina || numeroSerie || boquilla) {
      if (tRow.impresora_id) {
        // Actualización parcial de impresora ya vinculada
        const payloadImpresora: any = {};
        if (maquina) {
          payloadImpresora.modelo  = maquina;
          payloadImpresora.maquina = maquina;
          const oldModelo = impresoraOld?.modelo ?? impresoraOld?.maquina ?? null;
          pushCambio('máquina (modelo)', oldModelo, maquina);
        }
        if (numeroSerie) {
          pushCambio('n° de serie', impresoraOld?.numero_de_serie, numeroSerie);
          payloadImpresora.numero_de_serie = numeroSerie;
        }
        if ('boquilla' in fields) {
          pushCambio('tamaño de boquilla', impresoraOld?.tamano_de_boquilla, boquilla);
          payloadImpresora.tamano_de_boquilla = boquilla || null;
        }

        if (Object.keys(payloadImpresora).length > 0) {
          const { error } = await supabase
            .from('impresoras')
            .update(payloadImpresora)
            .eq('id', tRow.impresora_id);
          if (error) return jsonError('Error al actualizar impresora: ' + error.message, 500);
        }
      } else if (maquina || numeroSerie || boquilla) {
        // No hay impresora vinculada → buscar/crear y luego vincular
        let impresoraId: number | null = null;

        // 1) Si vino número de serie, intentamos matchear
        if (numeroSerie) {
          const { data: impFound } = await supabase
            .from('impresoras')
            .select('id')
            .eq('numero_de_serie', numeroSerie)
            .maybeSingle();
          if (impFound?.id) impresoraId = impFound.id;
        }

        // 2) Si no hay por serie, probamos por modelo (modelo=maquina)
        if (!impresoraId && (maquina || numeroSerie || boquilla)) {
          const maquinaSafe = maquina || 'Desconocida';
          const serieSafe   = numeroSerie || `TEMP-${Date.now()}-${Math.floor(Math.random()*900+100)}`;
          const { data: byCombo } = await supabase
            .from('impresoras')
            .select('id')
            .match({ modelo: maquinaSafe, maquina: maquinaSafe })
            .limit(1)
            .maybeSingle();

          if (byCombo?.id) {
            impresoraId = byCombo.id;
          } else {
            // 3) Crear impresora mínima
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
            if (impErr) return jsonError('No se pudo crear la impresora: ' + impErr.message, 500);
            impresoraId = impNew!.id;
          }
          // Registrar cambios semánticos de creación
          pushCambio('máquina (modelo)', null, maquina || 'Desconocida');
          if (numeroSerie) pushCambio('n° de serie', null, numeroSerie);
          if (boquilla) pushCambio('tamaño de boquilla', null, boquilla);
        }

        // 4) Vincular impresora creada/encontrada al ticket
        if (impresoraId) {
          const { error: linkErr } = await supabase
            .from('tickets_mian')
            .update({ impresora_id: impresoraId })
            .eq('id', idNum);
          if (linkErr) return jsonError('No se pudo vincular la impresora al ticket: ' + linkErr.message, 500);
        }
      }
    }

    // ========== Delivery (crea si no existe; respeta permisos admin para ciertos campos) ==========
    const deliveryUpd: any = {};
    if (typeof fields.cobrado === 'string') {
      // Guardamos como 'true'/'false'/null (string) para homogeneidad con bd
      const nuevo = fields.cobrado === 'true' ? 'true' : fields.cobrado === 'false' ? 'false' : null;
      pushCambio('cobrado', deliveryOld?.pagado, nuevo, boolShow);
      deliveryUpd.pagado = nuevo;
    }
    if (isAdmin) {
      if (typeof fields.medioEntrega === 'string') {
        pushCambio('modo de entrega', deliveryOld?.medio_de_entrega, fields.medioEntrega);
        deliveryUpd.medio_de_entrega = fields.medioEntrega || null;
      }
      if (typeof fields.costoDelivery === 'string') {
        const normNew = normalizarMontoTexto(fields.costoDelivery);
        pushCambio('costo delivery', deliveryOld?.cotizar_delivery, normNew, formatARSForShow);
        deliveryUpd.cotizar_delivery = normNew;
      }
      if (typeof fields.infoDelivery === 'string') {
        pushCambio('info delivery', deliveryOld?.informacion_adicional_delivery, fields.infoDelivery);
        deliveryUpd.informacion_adicional_delivery = fields.infoDelivery || null;
      }
    }

    // Upsert manual: intentamos update; si no afectó filas, hacemos insert
    if (Object.keys(deliveryUpd).length > 0) {
      const { data: updRows, error: updErr } = await supabase
        .from('delivery')
        .update(deliveryUpd)
        .eq('ticket_id', idNum)
        .select('id');

      if (updErr) return jsonError('Error al actualizar delivery: ' + updErr.message, 500);

      const affected = Array.isArray(updRows) ? updRows.length : (updRows ? 1 : 0);
      if (affected === 0) {
        const insPayload: any = { ticket_id: idNum, ...deliveryUpd };
        const { error: insErr } = await supabase.from('delivery').insert(insPayload);
        if (insErr) return jsonError('Error al crear delivery: ' + insErr.message, 500);
      }
    }

    // ========== Presupuesto (actualiza o crea; marca estado 'P. Enviado' si se guarda) ==========
    const fechaPresuNorm = normDate(fields.timestampPresupuesto); // opcional
    const presUpdate: any = {
      // Usamos 'undefined' para no tocar campos no enviados
      monto: ('monto' in fields) ? normalizarMontoTexto(fields.monto) : undefined,
      link_presupuesto: ('linkPresupuesto' in fields) ? (fields.linkPresupuesto || null) : undefined,
      cubre_garantia: (fields.cubre_garantia ?? fields.cubreGarantia) === 'true' ? 'true' : 'false',
    };
    if (fechaPresuNorm) presUpdate.fecha_presupuesto = fechaPresuNorm;

    let presGuardado = false;

    // Solo realizamos operación si al menos un campo vino presente
    if (Object.values(presUpdate).some(v => v !== undefined)) {
      // Diffs visibles: solo para los campos presentes en el form
      if ('monto' in fields) {
        pushCambio('monto', presOld?.monto, normalizarMontoTexto(fields.monto), formatARSForShow);
      }
      if ('linkPresupuesto' in fields) {
        pushCambio('link presupuesto', presOld?.link_presupuesto, fields.linkPresupuesto || null);
      }
      if ('cubreGarantia' in fields || 'cubre_garantia' in fields) {
        const newBool = (fields.cubre_garantia ?? fields.cubreGarantia) === 'true' ? 'true' : 'false';
        pushCambio('cubre garantía', presOld?.cubre_garantia, newBool, boolShow);
      }
      if (fechaPresuNorm) {
        pushCambio('fecha presupuesto', presOld?.fecha_presupuesto, fechaPresuNorm);
      }

      // Intento de update
      const { data: updRows, error: updErr } = await supabase
        .from('presupuestos')
        .update(presUpdate)
        .eq('ticket_id', idNum)
        .select('id');

      if (updErr) return jsonError('Error al actualizar presupuesto: ' + updErr.message, 500);

      const afectadas = Array.isArray(updRows) ? updRows.length : (updRows ? 1 : 0);

      if (afectadas === 0) {
        // No existía → insert
        const presInsert: any = { ticket_id: idNum, ...presUpdate };
        const { data: insRows, error: insErr } = await supabase
          .from('presupuestos')
          .insert(presInsert)
          .select('id');

        if (insErr) return jsonError('Error al crear presupuesto: ' + insErr.message, 500);
        presGuardado = Array.isArray(insRows) ? insRows.length > 0 : Boolean(insRows);
      } else {
        presGuardado = true;
      }
    }

    // Si se guardó/creó un presupuesto, forzamos estado del ticket a "P. Enviado"
    if (presGuardado) {
      const { error: estadoErr } = await supabase
        .from('tickets_mian')
        .update({ estado: 'P. Enviado' })
        .eq('id', idNum);
      if (estadoErr) return jsonError('No se pudo marcar el estado como P. Enviado: ' + estadoErr.message, 500);
    }

    // ========== Imágenes (subir/borrar en Supabase Storage) ==========
    const contentType = (f: File | null) => (f as any)?.type || 'image/webp';

    // Sube una imagen al bucket 'imagenes' en 'public/...' (upsert) y setea la URL pública en el campo indicado del ticket
    const subirImagen = async (archivo: File, nombreArchivo: string, campo: 'imagen'|'imagen_ticket'|'imagen_extra') => {
      const { error: uploadError } = await supabase.storage
        .from('imagenes')
        .upload(nombreArchivo, archivo, { cacheControl: '3600', upsert: true, contentType: contentType(archivo) });
      if (uploadError) throw new Error(`Error al subir ${campo}: ${uploadError.message}`);
      const { data } = supabase.storage.from('imagenes').getPublicUrl(nombreArchivo);
      (datosTicketsMian as any)[campo] = data.publicUrl;
    };

    // Borra un archivo del bucket y setea null en el campo del ticket
    const borrarImagenCampo = async (nombreArchivo: string, campo: 'imagen'|'imagen_ticket'|'imagen_extra') => {
      await supabase.storage.from('imagenes').remove([nombreArchivo]);
      (datosTicketsMian as any)[campo] = null;
    };

    // Interpreta flags 'delete'/'true' para borrar
    const mustDelete = (v: string | null | undefined) => v === 'delete' || v === 'true';

    // Imagen principal
    const nombreArchivo = `public/${idNum}.webp`;
    if (imagenArchivo && imagenArchivo.size > 0)      await subirImagen(imagenArchivo, nombreArchivo, 'imagen');
    else if (mustDelete(borrarImagen))                await borrarImagenCampo(nombreArchivo, 'imagen');

    // Imagen del ticket (comprobante, etc.)
    const nombreArchivoTicket = `public/${idNum}_ticket.webp`;
    if (imagenTicketArchivo && imagenTicketArchivo.size > 0) await subirImagen(imagenTicketArchivo, nombreArchivoTicket, 'imagen_ticket');
    else if (mustDelete(borrarImagenTicket))                  await borrarImagenCampo(nombreArchivoTicket, 'imagen_ticket');

    // Imagen extra (adicional)
    const nombreArchivoExtra = `public/${idNum}_extra.webp`;
    if (imagenExtraArchivo && imagenExtraArchivo.size > 0) await subirImagen(imagenExtraArchivo, nombreArchivoExtra, 'imagen_extra');
    else if (mustDelete(borrarImagenExtra))                 await borrarImagenCampo(nombreArchivoExtra, 'imagen_extra');

    // 🆕 Registrar diffs de imágenes (después de aplicar uploads/borrados)
    const afterImgMain   = (datosTicketsMian as any).imagen        ?? prevImgMain;
    const afterImgTicket = (datosTicketsMian as any).imagen_ticket ?? prevImgTicket;
    const afterImgExtra  = (datosTicketsMian as any).imagen_extra  ?? prevImgExtra;

    pushCambio('imagen principal', prevImgMain,   afterImgMain,   imgShow);
    pushCambio('imagen del ticket', prevImgTicket, afterImgTicket, imgShow);
    pushCambio('imagen extra',     prevImgExtra,  afterImgExtra,  imgShow);

    // Guardar los cambios acumulados del ticket (tickets_mian)
    {
      const { error } = await supabase.from('tickets_mian').update(datosTicketsMian).eq('id', idNum);
      if (error) return jsonError('Error al actualizar ticket: ' + error.message, 500);
    }

    // ====== Comentario automático con el diff (si hubo cambios) ======
    if (cambios.length > 0) {
      // Determinar autor (usuario actual) para el comentario
      const autor = await resolverAutor(locals);
      if (!autor || autor.activo === false) {
        return jsonError('No se pudo determinar el autor para comentar cambios', 401);
      }
      const userEmail: string | null =
        (locals as any)?.user?.email ||
        (locals as any)?.perfil?.email ||
        (locals as any)?.usuario?.email ||
        null;
      const localPart = (typeof userEmail === 'string' && userEmail.includes('@'))
        ? userEmail.split('@')[0]
        : nombreAutor(autor);

      const encabezado = `${localPart} cambió los siguientes datos:`;
      const cuerpo = cambios.join('\n'); // una línea por cambio, con viñeta y <strong>
      const mensaje = `${encabezado}\n${cuerpo}`.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

      // Insertar comentario de cambios
      const { error: cErr } = await supabase
        .from('ticket_comentarios')
        .insert({ ticket_id: idNum, autor_id: autor.id, mensaje });

      if (cErr) return jsonError('No se pudo crear el comentario de cambios: ' + cErr.message, 500);
    }

    // Redirección al detalle si todo salió bien
    return new Response(null, { status: 303, headers: { Location: `/detalle/${idNum}` } });
  } catch (err: any) {
    // Fallback de error inesperado
    return jsonError('Error inesperado: ' + (err?.message || String(err)), 500);
  }
};
