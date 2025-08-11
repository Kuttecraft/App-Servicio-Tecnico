// import del cliente de supabase compartido en tu proyecto
import { supabase } from '../../lib/supabase';

// IMPORTANTE: en algunos runtimes (Edge) Buffer no existe.
// En Node sí, pero es más seguro importarlo y tener fallback.
import { Buffer } from 'node:buffer';

// Utilidad para convertir archivo a DataURL base64 (se guarda en columna TEXT)
// ⚠️ Ya NO la usamos para guardar en DB. La dejo por si la querés reutilizar.
// Ahora el flujo guarda SIEMPRE una URL https (Supabase Storage).
async function fileToDataURL(file: File | null): Promise<string | null> {
  if (!file) return null;
  // Evitar guardar data:... vacío si el archivo no tiene contenido
  const size = typeof (file as any).size === 'number' ? (file as any).size : 0;
  if (size <= 0) return null;

  // (Opcional) límite por seguridad: 5MB base (antes de base64)
  const MAX_BYTES = 5 * 1024 * 1024;
  if (size > MAX_BYTES) {
    // Si querés, podés devolver 413. Por ahora, seguimos sin imagen.
    // return new Response('Imagen demasiado grande', { status: 413 }) as any;
    return null;
  }

  const ab = await file.arrayBuffer();
  if (!ab || ab.byteLength === 0) return null;

  // El front la comprime a WebP; a veces llega como application/octet-stream.
  const mimeRaw = (file.type || '').toLowerCase();
  const mime = mimeRaw && mimeRaw !== 'application/octet-stream' ? mimeRaw : 'image/webp';

  // Convertir a base64 robusto (Node y Edge)
  let base64 = '';
  try {
    // Si existe Buffer (Node), usarlo
    if (typeof Buffer !== 'undefined' && Buffer.from) {
      base64 = Buffer.from(ab).toString('base64');
    } else {
      // Fallback Edge: convertir a string binario por chunks y btoa()
      const bytes = new Uint8Array(ab);
      const chunkSize = 0x8000; // 32KB
      let binary = '';
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize) as any);
      }
      // @ts-ignore btoa está en runtime web/edge
      base64 = btoa(binary);
    }
  } catch {
    // Si algo falla, mejor no mandar basura a la DB
    return null;
  }

  return `data:${mime};base64,${base64}`;
}

// Helper Redirect 303
function redirect303(location: string) {
  return new Response(null, { status: 303, headers: { Location: location } });
}

// Helper para partir nombre/apellido cumpliendo NOT NULL en tabla cliente
function partirNombreApellido(completo: string): { nombre: string; apellido: string } {
  const limpio = (completo || '').trim().replace(/\s+/g, ' ');
  if (!limpio) return { nombre: 'Sin nombre', apellido: '(sin apellido)' };
  const partes = limpio.split(' ');
  if (partes.length === 1) return { nombre: partes[0], apellido: '(sin apellido)' };
  const nombre = partes.shift() as string;
  const apellido = partes.join(' ') || '(sin apellido)';
  return { nombre, apellido };
}

// Helper para normalizar el MIME de la imagen que llega del front
function normalizarMime(file: File | null): string | null {
  if (!file) return null;
  // Forzamos WebP para homogeneidad en Storage y servir
  return 'image/webp';
}

export async function POST({ request }: { request: Request }) {
  try {
    const form = await request.formData();

    // === Campos del form (respetando tus name="") ===
    const clienteNombreCompleto = String(form.get('cliente') ?? '').trim();
    const dniCuit        = String(form.get('dniCuit') ?? '').trim();
    const correo         = String(form.get('correo') ?? '').trim();
    const whatsapp       = String(form.get('whatsapp') ?? '').trim();
    const modelo         = String(form.get('modelo') ?? '').trim();
    const tecnicoNombre  = String(form.get('tecnico') ?? '').trim();
    const estado         = String(form.get('estado') ?? '').trim();
    const comentarios    = String(form.get('comentarios') ?? '').trim();
    const ticketRaw      = form.get('ticket');
    const ticketNumero   = ticketRaw ? Number(ticketRaw) : null;

    // Archivos opcionales:
    const archivoImagen       = (form.get('imagenArchivo') as File | null) ?? null;        // -> tickets_mian.imagen
    const archivoImagenTicket = (form.get('imagenTicketArchivo') as File | null) ?? null;  // -> tickets_mian.imagen_ticket
    const archivoImagenExtra  = (form.get('imagenExtraArchivo') as File | null) ?? null;   // -> tickets_mian.imagen_extra
    // const imagenDataURL  = await fileToDataURL(archivoImagen); // ❌ ya no guardamos dataURL

    // === Validaciones simples ===
    if (!clienteNombreCompleto) {
      return new Response('Falta el nombre del cliente', { status: 400 });
    }
    if (!ticketNumero || Number.isNaN(ticketNumero) || ticketNumero < 1) {
      return new Response('Número de ticket inválido', { status: 400 });
    }

    // === CLIENTE: buscar por dni_cuit; si no, por cliente (texto completo) ===
    let clienteId: number | null = null;

    {
      let found: { id: number } | null = null;

      if (dniCuit) {
        const { data, error } = await supabase
          .from('cliente')
          .select('id')
          .eq('dni_cuit', dniCuit)
          .limit(1)
          .maybeSingle();
        if (!error && data) found = data;
      }

      if (!found) {
        const { data, error } = await supabase
          .from('cliente')
          .select('id')
          .ilike('cliente', clienteNombreCompleto) // si querés permitir parcial: `%${clienteNombreCompleto}%`
          .limit(1)
          .maybeSingle();
        if (!error && data) found = data;
      }

      if (found?.id) {
        clienteId = found.id;
      } else {
        const { nombre, apellido } = partirNombreApellido(clienteNombreCompleto);
        const { data, error } = await supabase
          .from('cliente')
          .insert({
            cliente: clienteNombreCompleto, // ✅ NOT NULL
            nombre,                         // ✅ NOT NULL
            apellido,                       // ✅ NOT NULL
            dni_cuit: dniCuit || null,
            whatsapp: whatsapp || null,
            correo_electronico: correo || null,
            // resto: null
          })
          .select('id')
          .single();

        if (error) {
          return new Response(
            JSON.stringify({ error: 'No se pudo crear el cliente', supabase: error }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
          );
        }
        clienteId = data!.id;
      }
    }

    if (!clienteId || Number.isNaN(clienteId)) {
      return new Response('Cliente no válido (cliente_id vacío)', { status: 400 });
    }

    // === TÉCNICO (opcional): solo buscamos por nombre (tu tabla requiere nombre, apellido, email para crear) ===
    let tecnicoId: number | null = null;
    if (tecnicoNombre) {
      const { data, error } = await supabase
        .from('tecnicos')
        .select('id')
        .ilike('nombre', tecnicoNombre)
        .limit(1)
        .maybeSingle();
      if (!error && data?.id) tecnicoId = data.id;
    }

    // === IMPRESORA (opcional): tu tabla requiere modelo, maquina, numero_de_serie para crear; acá solo buscamos por modelo ===
    let impresoraId: number | null = null;
    if (modelo) {
      const { data, error } = await supabase
        .from('impresoras')
        .select('id')
        .ilike('modelo', modelo)
        .limit(1)
        .maybeSingle();
      if (!error && data?.id) impresoraId = data.id;
    }

    // === Insertar TICKET en tickets_mian (solo columnas que existen) ===
    const nowIso = new Date().toISOString();

    const insertRow: Record<string, any> = {
      cliente_id: clienteId,                 // ✅ NOT NULL
      tecnico_id: tecnicoId ?? null,         // FK nullable
      impresora_id: impresoraId ?? null,     // FK nullable
      marca_temporal: nowIso,                // TEXT (ISO)
      ticket: ticketNumero,                  // BIGINT (no unique)
      notas_del_cliente: comentarios || null,
      estado: estado || null,
      // ❗ OJO: NO ponemos 'imagen', 'imagen_ticket' ni 'imagen_extra' acá. Primero creamos el ticket y obtenemos su id.
    };

    const { data: tInsert, error: tErr } = await supabase
      .from('tickets_mian')
      .insert([insertRow])
      .select('id')
      .single();

    if (tErr) {
      return new Response(
        JSON.stringify({
          error: 'No se pudo crear el ticket',
          supabase: {
            message: tErr.message,
            details: (tErr as any).details,
            hint: (tErr as any).hint,
            code: (tErr as any).code,
          },
          payload: insertRow,
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const nuevoId = tInsert!.id as number;

    // === Subir imágenes a Supabase Storage y guardar URL pública (https) ===
    // Helper local para subir y devolver URL pública
    const subirYObtenerUrl = async (file: File | null, nombreArchivo: string) => {
      if (!file || (file as any).size <= 0) return null;

      // Límite rápido de 5MB
      const MAX_BYTES = 5 * 1024 * 1024;
      if ((file as any).size > MAX_BYTES) {
        throw new Error('La imagen supera el tamaño máximo permitido (5MB).');
      }

      const mime = normalizarMime(file) || 'image/webp';

      // Por si subieron antes un archivo con el mismo nombre (no debería en alta, pero es idempotente)
      try { await supabase.storage.from('imagenes').remove([nombreArchivo]); } catch {}

      const { error: uploadError } = await supabase.storage
        .from('imagenes')
        .upload(nombreArchivo, file, {
          cacheControl: '3600',
          upsert: true,
          contentType: mime, // ayuda a servir con el tipo correcto
        });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      const { data: publicUrl } = supabase.storage
        .from('imagenes')
        .getPublicUrl(nombreArchivo);

      return publicUrl.publicUrl as string;
    };

    // Intentamos cada imagen por separado (todas son opcionales)
    let imagenUrl: string | null = null;
    let imagenTicketUrl: string | null = null;
    let imagenExtraUrl: string | null = null;

    // ⚠️ Manejo de errores PARCIAL: si una falla, seguimos con el resto y no rompemos el alta del ticket.
    if (archivoImagen && (archivoImagen as any).size > 0) {
      try {
        imagenUrl = await subirYObtenerUrl(archivoImagen, `public/${nuevoId}.webp`);
      } catch (e: any) {
        console.error('Error subiendo imagen principal:', e?.message || e);
      }
    }

    if (archivoImagenTicket && (archivoImagenTicket as any).size > 0) {
      try {
        imagenTicketUrl = await subirYObtenerUrl(archivoImagenTicket, `public/${nuevoId}_ticket.webp`);
      } catch (e: any) {
        console.error('Error subiendo imagen de ticket:', e?.message || e);
      }
    }

    if (archivoImagenExtra && (archivoImagenExtra as any).size > 0) {
      try {
        imagenExtraUrl = await subirYObtenerUrl(archivoImagenExtra, `public/${nuevoId}_extra.webp`);
      } catch (e: any) {
        console.error('Error subiendo imagen extra:', e?.message || e);
      }
    }

    // Si subimos alguna, actualizamos el registro con las URLs correspondientes
    if (imagenUrl || imagenTicketUrl || imagenExtraUrl) {
      const updateImages: Record<string, any> = {};
      if (imagenUrl) updateImages.imagen = imagenUrl;
      if (imagenTicketUrl) updateImages.imagen_ticket = imagenTicketUrl;
      if (imagenExtraUrl) updateImages.imagen_extra = imagenExtraUrl;

      const { error: updImgErr } = await supabase
        .from('tickets_mian')
        .update(updateImages)
        .eq('id', nuevoId);

      if (updImgErr) {
        // No tiramos 500: dejamos creado el ticket y avisamos por consola
        console.error('Ticket creado, pero no se pudieron guardar las URLs de imagen:', updImgErr.message);
      }
    }

    // Redirigimos a donde prefieras (listado, detalle, o volver con query ok)
    return redirect303(`/addTicket?ok=1&ticket=${encodeURIComponent(String(ticketNumero))}`);
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: 'Error inesperado al crear el ticket', exception: String(err?.message || err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
