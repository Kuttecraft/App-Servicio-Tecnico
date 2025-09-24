// src/pages/api/actualizarTicket.ts
import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';
import { resolverAutor, nombreAutor } from '../../lib/resolverAutor';

/** Normaliza a YYYY-MM-DD desde ISO, YYYY/MM/DD, MM/DD/YYYY o DD/MM/YYYY. */
function normDate(value?: string | null): string | null {
  if (!value) return null;
  const sRaw = value.trim();
  if (!sRaw || sRaw.toLowerCase() === 'null' || sRaw.toLowerCase() === 'undefined') return null;

  const s = sRaw.split('T')[0].split(' ')[0];

  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  m = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;

  m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (m) {
    const a = parseInt(m[1],10), b = parseInt(m[2],10), yyyy = m[3];
    let dd:number, mm:number;
    if (b > 12 && a <= 12) { mm = a; dd = b; }
    else if (a > 12 && b <= 12) { dd = a; mm = b; }
    else { mm = a; dd = b; }
    return `${yyyy}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`;
  }

  const d = new Date(sRaw);
  if (!isNaN(d.getTime())) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth()+1).padStart(2,'0');
    const dd = String(d.getDate()).padStart(2,'0');
    return `${yyyy}-${mm}-${dd}`;
  }
  return null;
}

/** Convierte lo que venga a 'M/D/YYYY' (sin ceros a la izquierda). */
function toMDYFromAny(value?: string | null): string | null {
  if (!value) return null;
  const sRaw = String(value).trim();
  if (!sRaw || sRaw.toLowerCase() === 'null' || sRaw.toLowerCase() === 'undefined') return null;

  let m = sRaw.match(/^(\d{4})-(\d{2})-(\d{2})$/);        // YYYY-MM-DD
  if (m) return `${Number(m[2])}/${Number(m[3])}/${m[1]}`;

  m = sRaw.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);      // YYYY/MM/DD
  if (m) return `${Number(m[2])}/${Number(m[3])}/${m[1]}`;

  m = sRaw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/); // M/D/YYYY o D/M/YYYY
  if (m) {
    const a = parseInt(m[1],10), b = parseInt(m[2],10), yyyy = m[3];
    let mm:number, dd:number;
    if (b > 12 && a <= 12) { mm = a; dd = b; }          // asumimos M/D
    else if (a > 12 && b <= 12) { dd = a; mm = b; }     // venía D/M
    else { mm = a; dd = b; }                             // ambiguo → M/D
    return `${mm}/${dd}/${yyyy}`;
  }

  const d = new Date(sRaw);
  if (!isNaN(d.getTime())) {
    return `${d.getMonth()+1}/${d.getDate()}/${d.getFullYear()}`;
  }
  return null;
}

/** Normaliza montos escritos como “$10.000”, “10.000,50”, “10000.5”, etc. → string numérico estable (decimal con punto). */
function normalizarMontoTexto(input?: string | null): string | null {
  if (input == null) return null;
  let s = String(input).trim();
  if (!s) return null;

  // Dejar solo dígitos, coma, punto y signo menos
  s = s.replace(/[^0-9.,-]/g, '');

  const tienePunto = s.includes('.');
  const tieneComa = s.includes(',');

  if (tienePunto && tieneComa) {
    // El separador decimal es el ÚLTIMO símbolo que aparezca (entre coma/punto)
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

  const n = Number(s);
  if (!isFinite(n)) return String(s || '');
  return s;
}

/** Normaliza DNI/CUIT (servidor, fuente de verdad). */
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

function jsonError(message: string, status = 500) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/* ====== Helpers de "display" para mostrar en comentario ====== */
const show = (v: any) => (v === null || v === undefined || v === '') ? '—' : String(v);
function formatARSForShow(v?: string | null) {
  if (v == null || v === '') return '—';
  const n = Number(v);
  if (!isFinite(n)) return show(v);
  const dec = (String(v).split('.')[1]?.length || 0);
  const d = dec ? Math.min(2, dec) : 0;
  return '$' + n.toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d });
}
const boolShow = (v: string | boolean | null | undefined) =>
  v === true || v === 'true'
    ? 'Sí'
    : v === false || v === 'false'
    ? 'No'
    : '—';

export const POST: APIRoute = async ({ request, params, locals }) => {
  try {
    const perfil = (locals as any)?.perfil as { rol?: string; admin?: boolean } | undefined;
    const isAdmin = (perfil?.rol === 'admin') || (perfil?.admin === true);

    // ---------- Obtener ID robustamente ----------
    const formData = await request.formData();
    let id: string | undefined;
    for (const k of ['ticketId', 'id', 'ticket', 'ticket_id']) {
      const v = formData.get(k);
      if (typeof v === 'string' && v.trim() && v.trim().toLowerCase() !== 'undefined') {
        id = v.trim();
        break;
      }
    }
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

    const idNum = Number(id);
    if (!Number.isFinite(idNum) || idNum <= 0) return jsonError(`ID inválido: ${id}`, 400);

    // ---------- Archivos y flags imagen ----------
    const imagenArchivo       = formData.get('imagenArchivo') as File | null;
    const borrarImagen        = (formData.get('borrarImagen') as string | null) || 'false';
    const imagenTicketArchivo = formData.get('imagenTicketArchivo') as File | null;
    const borrarImagenTicket  = (formData.get('borrarImagenTicket') as string | null) || 'false';
    const imagenExtraArchivo  = formData.get('imagenExtraArchivo') as File | null;
    const borrarImagenExtra   = (formData.get('borrarImagenExtra') as string | null) || 'false';

    // ---------- Campos de texto ----------
    const fields: Record<string, string> = {};
    formData.forEach((val, key) => { if (typeof val === 'string') fields[key] = val.trim(); });

    // ---------- Leer fila actual + valores para comparar ----------
    const { data: tRow, error: tErr } = await supabase
      .from('tickets_mian')
      .select('cliente_id, impresora_id, marca_temporal, fecha_de_reparacion, estado, maquina_reparada, tecnico_id, notas_del_tecnico, notas_del_cliente')
      .eq('id', idNum)
      .single();
    if (tErr || !tRow) return jsonError(`No se pudo obtener el ticket (id=${String(id)})`, 500);

    // Cargar valores actuales de tablas relacionadas (si vamos a tocar esos campos)
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

    const { data: deliveryOld } = await supabase
      .from('delivery')
      .select('pagado, medio_de_entrega, cotizar_delivery, informacion_adicional_delivery')
      .eq('ticket_id', idNum)
      .maybeSingle();

    const { data: presOld } = await supabase
      .from('presupuestos')
      .select('monto, link_presupuesto, cubre_garantia, fecha_presupuesto')
      .eq('ticket_id', idNum)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();

    // ====== acumulador de cambios para comentario ======
    const cambios: string[] = [];
    const pushCambio = (label: string, before: any, after: any, formatter?: (v:any)=>string) => {
      const f = formatter ?? show;
      const b = f(before);
      const a = f(after);
      if (b === a) return;
      cambios.push(`- <strong>${label}</strong>: de "${b}" a "${a}"`);
    };

    // ========== Ticket principal ==========
    const fechaFormularioMDY = toMDYFromAny(fields.fechaFormulario); // ← siempre M/D/YYYY
    const fechaListoNorm     = normDate(fields.timestampListo);      // ISO para fecha listo

    const estadoForm = (fields.estado ?? '').trim();

    const datosTicketsMian: Record<string, any> = {
      estado: estadoForm || tRow.estado || null,
      marca_temporal: (fechaFormularioMDY ?? tRow.marca_temporal) || null,
      fecha_de_reparacion: (fechaListoNorm ?? tRow.fecha_de_reparacion) || null,
      notas_del_tecnico: fields.notaTecnico || null,
      maquina_reparada: fields.maquina || fields.modelo || tRow.maquina_reparada || null,
    };

    // Comparar cambios de ticket
    pushCambio('estado', tRow.estado, datosTicketsMian.estado);
    pushCambio('fecha formulario', tRow.marca_temporal, datosTicketsMian.marca_temporal);
    pushCambio('fecha listo', tRow.fecha_de_reparacion, datosTicketsMian.fecha_de_reparacion);
    pushCambio('nota técnico', tRow.notas_del_tecnico, datosTicketsMian.notas_del_tecnico);
    pushCambio('modelo/máquina', tRow.maquina_reparada, datosTicketsMian.maquina_reparada);

    if (typeof fields.detalleCliente === 'string') {
      // guardamos “Detalle del problema” como notas_del_cliente del ticket
      pushCambio('detalle del problema', tRow.notas_del_cliente, fields.detalleCliente);
      datosTicketsMian.notas_del_cliente = fields.detalleCliente;
    }

    // ========== Técnico ==========
    if ('tecnico_id' in fields) {
      const prevTecId = tRow.tecnico_id ?? null;

      // calcular nuevo id según el form
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

      // Si no cambió el ID, no mostramos nada
      const changed = (prevTecId ?? null) !== (newTecId ?? null);

      if (changed) {
        // Traer en un solo query ambos técnicos (si existen)
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

          const labelFrom = (t: any): string => {
            if (!t) return '—';
            const email = (t.email ?? '').toString().trim();
            if (email && email.includes('@')) return email.split('@')[0]; // local-part
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
      // legacy "Nombre Apellido": no confiable para ID → omitimos del diff
    }

    // ========== Cliente (merge: solo lo que venga no vacío) ==========
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

      if (Object.keys(updateCliente).length > 0) {
        const { error } = await supabase.from('cliente').update(updateCliente).eq('id', tRow.cliente_id);
        if (error) return jsonError('Error al actualizar cliente: ' + error.message, 500);
      }
    }

    // ========== Impresora ==========
    const maquina      = fields.maquina || ''; // ← modelo real desde UI
    const numeroSerie  = fields.numeroSerie || '';
    const boquilla     = fields.boquilla || '';

    if (maquina || numeroSerie || boquilla) {
      if (tRow.impresora_id) {
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
        // crear y vincular
        let impresoraId: number | null = null;

        if (numeroSerie) {
          const { data: impFound } = await supabase
            .from('impresoras')
            .select('id')
            .eq('numero_de_serie', numeroSerie)
            .maybeSingle();
          if (impFound?.id) impresoraId = impFound.id;
        }

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
          // cambios semánticos (creación)
          pushCambio('máquina (modelo)', null, maquina || 'Desconocida');
          if (numeroSerie) pushCambio('n° de serie', null, numeroSerie);
          if (boquilla) pushCambio('tamaño de boquilla', null, boquilla);
        }

        if (impresoraId) {
          const { error: linkErr } = await supabase
            .from('tickets_mian')
            .update({ impresora_id: impresoraId })
            .eq('id', idNum);
          if (linkErr) return jsonError('No se pudo vincular la impresora al ticket: ' + linkErr.message, 500);
        }
      }
    }

    // ========== Delivery ==========
    const deliveryUpd: any = {};
    if (typeof fields.cobrado === 'string') {
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

    // ========== Presupuesto ==========
    const fechaPresuNorm = normDate(fields.timestampPresupuesto); // puede venir vacío
    const presUpdate: any = {
      monto: ('monto' in fields) ? normalizarMontoTexto(fields.monto) : undefined,
      link_presupuesto: ('linkPresupuesto' in fields) ? (fields.linkPresupuesto || null) : undefined,
      cubre_garantia: (fields.cubre_garantia ?? fields.cubreGarantia) === 'true' ? 'true' : 'false',
    };
    if (fechaPresuNorm) presUpdate.fecha_presupuesto = fechaPresuNorm;

    let presGuardado = false;

    if (Object.values(presUpdate).some(v => v !== undefined)) {
      // diffs visibles (solo para los que vienen en form)
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

      const { data: updRows, error: updErr } = await supabase
        .from('presupuestos')
        .update(presUpdate)
        .eq('ticket_id', idNum)
        .select('id');

      if (updErr) return jsonError('Error al actualizar presupuesto: ' + updErr.message, 500);

      const afectadas = Array.isArray(updRows) ? updRows.length : (updRows ? 1 : 0);

      if (afectadas === 0) {
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

    // ✅ si se guardó/creó un presupuesto → marcar estado "P. Enviado"
    if (presGuardado) {
      const { error: estadoErr } = await supabase
        .from('tickets_mian')
        .update({ estado: 'P. Enviado' })
        .eq('id', idNum);
      if (estadoErr) return jsonError('No se pudo marcar el estado como P. Enviado: ' + estadoErr.message, 500);
    }

    // ========== Imágenes ==========
    const contentType = (f: File | null) => (f as any)?.type || 'image/webp';
    const subirImagen = async (archivo: File, nombreArchivo: string, campo: 'imagen'|'imagen_ticket'|'imagen_extra') => {
      const { error: uploadError } = await supabase.storage
        .from('imagenes')
        .upload(nombreArchivo, archivo, { cacheControl: '3600', upsert: true, contentType: contentType(archivo) });
      if (uploadError) throw new Error(`Error al subir ${campo}: ${uploadError.message}`);
      const { data } = supabase.storage.from('imagenes').getPublicUrl(nombreArchivo);
      (datosTicketsMian as any)[campo] = data.publicUrl;
    };
    const borrarImagenCampo = async (nombreArchivo: string, campo: 'imagen'|'imagen_ticket'|'imagen_extra') => {
      await supabase.storage.from('imagenes').remove([nombreArchivo]);
      (datosTicketsMian as any)[campo] = null;
    };
    const mustDelete = (v: string | null | undefined) => v === 'delete' || v === 'true';

    const nombreArchivo = `public/${idNum}.webp`;
    if (imagenArchivo && imagenArchivo.size > 0)      await subirImagen(imagenArchivo, nombreArchivo, 'imagen');
    else if (mustDelete(borrarImagen))                await borrarImagenCampo(nombreArchivo, 'imagen');

    const nombreArchivoTicket = `public/${idNum}_ticket.webp`;
    if (imagenTicketArchivo && imagenTicketArchivo.size > 0) await subirImagen(imagenTicketArchivo, nombreArchivoTicket, 'imagen_ticket');
    else if (mustDelete(borrarImagenTicket))                  await borrarImagenCampo(nombreArchivoTicket, 'imagen_ticket');

    const nombreArchivoExtra = `public/${idNum}_extra.webp`;
    if (imagenExtraArchivo && imagenExtraArchivo.size > 0) await subirImagen(imagenExtraArchivo, nombreArchivoExtra, 'imagen_extra');
    else if (mustDelete(borrarImagenExtra))                 await borrarImagenCampo(nombreArchivoExtra, 'imagen_extra');

    // Guardar los cambios acumulados del ticket
    {
      const { error } = await supabase.from('tickets_mian').update(datosTicketsMian).eq('id', idNum);
      if (error) return jsonError('Error al actualizar ticket: ' + error.message, 500);
    }

    // ====== Comentario automático con el diff ======
    if (cambios.length > 0) {
      // autor / local-part
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

      const { error: cErr } = await supabase
        .from('ticket_comentarios')
        .insert({ ticket_id: idNum, autor_id: autor.id, mensaje });

      if (cErr) return jsonError('No se pudo crear el comentario de cambios: ' + cErr.message, 500);
    }

    return new Response(null, { status: 303, headers: { Location: `/detalle/${idNum}` } });
  } catch (err: any) {
    return jsonError('Error inesperado: ' + (err?.message || String(err)), 500);
  }
};
