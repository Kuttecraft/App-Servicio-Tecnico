// watchTickets.js
//
// PROPÓSITO
// ---------
// Este script corre del lado del servidor (Node) y escucha en tiempo real
// las inserciones en la tabla "tickets_mian" de tu base de datos Supabase.
// Cada vez que se crea un ticket nuevo:
//
//   1. Busca los datos del cliente (nombre, apellido, correo).
//   2. Le envía un correo automático confirmando la creación del ticket
//      y dándole instrucciones para hacer seguimiento.
//
// También maneja reconexión si la suscripción Realtime se cae.
//
// REQUISITOS
// ----------
// - Este script está pensado para ejecutarse como un watcher/worker
//   (por ejemplo un proceso Node corriendo en PM2, systemd, etc.).
//
// - Usa Supabase con una SERVICE ROLE KEY → eso significa que
//   este proceso tiene permisos muy elevados (puede leer TODO).
//   ¡Ojo! Esto NUNCA debe ir al frontend.
//
// - Usa nodemailer con credenciales de Gmail (u otro SMTP).
//
// - Usa dotenv para cargar variables de entorno desde .env si estás en local.
//
// ARCHITECTURE TL;DR
// ------------------
// 1. Carga las variables de entorno necesarias (.env).
// 2. Crea el cliente de Supabase con service role.
// 3. Crea el transporter SMTP.
// 4. Define sendTicketEmail() → arma y envía el email.
// 5. Define handleNewTicket() → recibe el row nuevo, busca el cliente, llama a sendTicketEmail().
// 6. Se suscribe a cambios INSERT en tickets_mian.
// 7. Si el canal se cae o falla, intenta re-suscribirse.
//
// NOTA: Este watcher asume que la tabla tickets_mian tiene columnas
//       como "ticket" y "cliente_id".
//       Ajustar nombres si difieren en la base de datos.
// --------------------------------------------------------------------


import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';
import 'dotenv/config'; // carga automáticamente .env en process.env si estás en entorno local


// ============ 1. ENV VARS (usamos tus nombres del .env tal cual) ============
//
// Estas variables tienen que venir del entorno o de tu archivo .env.
//
// PUBLIC_SUPABASE_URL     → URL de tu instancia Supabase (normalmente https://xyz.supabase.co)
// SUPABASE_SERVICE_ROLE   → service_role key de Supabase (PERMISOS ALTOS, mantener privada!)
// MAIL_USER               → usuario SMTP (por ej. correo Gmail que envía notificaciones)
// MAIL_PASS               → password/app password SMTP
// FOLLOW_LINK             → link público a la página donde el cliente puede seguir su ticket
// FROM_NAME               → nombre amigable que aparece en el "from" del correo
//
const {
  PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE,
  MAIL_USER,
  MAIL_PASS,
  FOLLOW_LINK,
  FROM_NAME,
} = process.env;


// sanity checks
//
// Antes de continuar, verificamos que existan las credenciales mínimas necesarias.
// Si faltan cosas esenciales, el proceso se corta con exit(1) porque sin eso no podemos
// ni leer la base ni mandar mails.
//
if (!PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
  console.error("❌ Faltan credenciales de Supabase (PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE)");
  process.exit(1); // detenemos el proceso entero. Esto está bien para un worker de background.
}
if (!MAIL_USER || !MAIL_PASS) {
  console.error("❌ Faltan credenciales de correo (MAIL_USER / MAIL_PASS)");
  process.exit(1);
}


// ============ 2. Crear cliente de Supabase ============
//
// Creamos el cliente con la service role key. Esto da acceso full a la DB.
// IMPORTANTE: persistSession/autorefresh en false porque ESTO ES SERVER SIDE,
// no un cliente web. No necesitamos que "recuerde" sesiones ni nada.
//
// createClient(url, key, { auth: { ... } })
//
const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});


// ============ 3. Configurar transporte SMTP (Gmail) ============
//
// Nodemailer es quien manda el mail real.
// Acá estás usando el servicio 'gmail', lo cual es cómodo pero tiene cosas a considerar:
//
// - Si estás usando una cuenta Gmail personal, Gmail suele bloquear logins "inseguros".
//   En producción conviene usar:
//     * una cuenta de empresa con App Password,
//     * o SMTP propio,
//     * o un proveedor tipo SendGrid / Mailgun.
//
// - MAIL_USER → quién envía.
// - MAIL_PASS → password o app password.
//
// También podrías agregar `tls: { rejectUnauthorized: false }` en algunos hosts
// si estás usando servidores on-prem con certificados raros. No hace falta con Gmail.
//
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: MAIL_USER,
    pass: MAIL_PASS,
  },
});


// ============ 4. Función para mandar el mail ============
//
// sendTicketEmail({...})
// ----------------------
// Recibe:
//   - email: correo del cliente destino
//   - nombre: nombre completo del cliente (para personalizar saludo)
//   - ticketNumber: número interno del ticket creado
//
// Construye el email de confirmación y lo envía con transporter.sendMail().
//
// Cosas que hace bien acá:
// - Si el cliente NO tiene email cargado, logueás un warning y no intentás mandar nada.
// - El cuerpo HTML incluye el link FOLLOW_LINK y también instrucciones
//   para que el cliente pueda seguir el estado del ticket después.
//
async function sendTicketEmail({ email, nombre, ticketNumber }) {
  if (!email) {
    console.warn(`⚠ No se envía email porque el cliente no tiene correo (ticket #${ticketNumber})`);
    return;
  }

  const subject = `Tu ticket #${ticketNumber} fue creado con éxito`;

  // htmlBody:
  // Texto amigable que recibe el cliente. Tenés placeholders:
  // - ${nombre ? nombre : ''}          → personalización con nombre si lo tenemos.
  // - ${ticketNumber}                  → número de ticket.
  // - ${FOLLOW_LINK}                   → link para tracking.
  //
  // IMPORTANTE:
  // FOLLOW_LINK debería ser una URL pública donde el cliente puede chequear estado
  // ingresando su DNI/CUIT + número de ticket.
  //
  const htmlBody = `
    <p>Hola ${nombre ? nombre : ''},</p>

    <p>Tu ticket <strong>#${ticketNumber}</strong> fue creado correctamente.</p>

    <p>Podés seguir el estado de tu reparación haciendo clic en el siguiente enlace:</p>
    <p><a href="${FOLLOW_LINK}" target="_blank">${FOLLOW_LINK}</a></p>

    <p>En la página de seguimiento ingresá:</p>
    <ul>
      <li>Tu número de ticket: <strong>${ticketNumber}</strong></li>
      <li>Tu DNI / CUIT</li>
    </ul>

    <p>Gracias por confiar en <strong>KutterCraft</strong> 🙌</p>
  `;

  // mailOptions:
  // 'from': mostramos un nombre amigable + el correo real que envía.
  //         Ej: "KutterCraft" <soporte@tudominio.com>
  //
  // IMPORTANTE: algunos proveedores (Gmail) pueden mostrar algo como:
  //   "enviado en nombre de ..." si FROM_NAME no coincide con el dominio del MAIL_USER.
  //
  const mailOptions = {
    from: `"${FROM_NAME || 'KutterCraft'}" <${MAIL_USER}>`,
    to: email,
    subject,
    html: htmlBody,
  };

  // Envío real del correo:
  await transporter.sendMail(mailOptions);

  console.log(`✅ Mail enviado a ${email} para ticket #${ticketNumber}`);
}


// ============ 5. Buscar datos del cliente y mandar el mail ============
//
// handleNewTicket(newTicketRow)
// -----------------------------
// Esta función recibe el "payload.new" de Supabase Realtime cuando se inserta
// una nueva fila en la tabla "tickets_mian".
//
// Hace:
//   1. Loguea cuál ticket apareció y de qué cliente viene.
//   2. Busca la info del cliente en la tabla 'cliente' (JOIN manual).
//   3. Arma el nombre completo.
//   4. Llama a sendTicketEmail() para notificar al cliente.
//
// Cosas a notar:
// - .maybeSingle() devuelve null si no hay match, en vez de tirar error,
//   lo cual está bueno para no romper el flujo.
// - Usás un try/catch general para que un error en un ticket no mate el watcher.
//
async function handleNewTicket(newTicketRow) {
  try {
    const ticketNumber = newTicketRow.ticket;     // ej: 1042 (tu número legible para el cliente)
    const clienteId    = newTicketRow.cliente_id; // FK a cliente.id

    console.log(`🎫 Nuevo ticket detectado: ${ticketNumber} (cliente_id: ${clienteId})`);

    // Obtenemos datos del cliente:
    // Seleccionamos nombre, apellido y correo_electronico.
    //
    // IMPORTANTE:
    // - Este código asume que la tabla se llama 'cliente' y que las columnas
    //   son nombre, apellido, correo_electronico.
    // - Si tu modelo real usa otros nombres, hay que alinearlo.
    //
    const { data: clienteData, error: clienteErr } = await supabase
      .from('cliente')
      .select('nombre, apellido, correo_electronico')
      .eq('id', clienteId)
      .maybeSingle(); // devuelve 1 objeto o null

    if (clienteErr) {
      console.error("❌ Error buscando cliente:", clienteErr.message);
      return;
    }
    if (!clienteData) {
      console.warn(`⚠ No se encontró el cliente con id ${clienteId}`);
      return;
    }

    // Armamos nombre completo amigable:
    //   - combinamos nombre + apellido
    //   - comprimimos espacios extra (por si alguno viene vacío/null)
    const fullName = [clienteData.nombre || '', clienteData.apellido || '']
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Mandar el mail final:
    await sendTicketEmail({
      email: clienteData.correo_electronico,
      nombre: fullName,
      ticketNumber,
    });

  } catch (err) {
    // Este catch protege contra cualquier error inesperado dentro de handleNewTicket
    // (por ejemplo supabase caído, nodemailer tiró error, etc).
    console.error("❌ Error en handleNewTicket:", err);
  }
}


// ============ 6. Suscripción Realtime + reconexión ============
//
// Supabase Realtime te deja escuchar eventos Postgres en vivo.
// Acá escuchamos INSERT en la tabla "tickets_mian".
//
// Flujo:
// - subscribeRealtime() crea un canal 'tickets-listener'.
// - Le decimos que nos notifique en cada INSERT.
// - En cada INSERT llama a handleNewTicket(payload.new).
//
// Además:
// - Guardamos la referencia en `channel` para poder detectar si se cierra.
// - Si el canal se cierra o hay error, programamos un reintento con setTimeout.
//   (Esto está pensado para que el watcher se recupere solo si hay un corte de red
//   o un reinicio del servicio realtime de Supabase).
//

// Guardamos referencia global al canal (fuera de la función) para poder re-suscribir
// en caso de caída:
let channel = null;

async function subscribeRealtime() {
  console.log("👀 Escuchando nuevos tickets en tiempo real...");

  channel = supabase
    .channel('tickets-listener') // nombre interno del canal de realtime
    .on(
      'postgres_changes',
      {
        event: 'INSERT',     // sólo nos importan los INSERTs
        schema: 'public',    // esquema de la tabla
        table: 'tickets_mian', // ⚠ ojo con el nombre de la tabla: 'tickets_mian'
      },
      async (payload) => {
        // payload.new = la fila recién insertada en la tabla
        await handleNewTicket(payload.new);
      }
    )
    .subscribe((status) => {
      // Este callback se ejecuta cuando cambia el estado de la suscripción
      // (por ejemplo 'SUBSCRIBED', 'CLOSED', etc., según versión de supabase-js).
      console.log("📡 Estado canal Realtime:", status);
    });

  // Listener opcional:
  // Detecta si el canal se cierra inesperadamente.
  // Según las versiones de @supabase/supabase-js, .on('close') y .on('error')
  // pueden comportarse distinto; acá estás agregando fallback simple.
  //
  channel.on('close', () => {
    console.warn('⚠ Canal Realtime cerrado. Reintentando en 5s...');
    setTimeout(() => {
      subscribeRealtime(); // volvemos a suscribir
    }, 5000);
  });

  // Listener de error en el canal:
  // Si hay un error de conexión / auth / etc., lo logueás y programás reintento.
  channel.on('error', (err) => {
    console.error('❌ Error en canal Realtime:', err);
    console.warn('🔄 Reintentando suscripción en 5s...');
    setTimeout(() => {
      subscribeRealtime();
    }, 5000);
  });
}


// Arrancar el watcher inmediatamente.
// En un entorno productivo, este archivo se ejecuta con Node (ej: `node watchTickets.js`)
// y queda corriendo en background escuchando inserts.
//
// Si querés usar PM2, por ejemplo:
//   pm2 start watchTickets.js --name watch-tickets
//
subscribeRealtime();
