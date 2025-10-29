// scripts/watchTickets.js
import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';
import 'dotenv/config';

// ============ 1. ENV VARS (usamos tus nombres del .env tal cual) ============
const {
  PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE,
  MAIL_USER,
  MAIL_PASS,
  FOLLOW_LINK,
  FROM_NAME,
} = process.env;

// sanity checks
if (!PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
  console.error("❌ Faltan credenciales de Supabase (PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE)");
  process.exit(1);
}
if (!MAIL_USER || !MAIL_PASS) {
  console.error("❌ Faltan credenciales de correo (MAIL_USER / MAIL_PASS)");
  process.exit(1);
}

// ============ 2. Crear cliente de Supabase ============
const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ============ 3. Configurar transporte SMTP (Gmail) ============
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: MAIL_USER,
    pass: MAIL_PASS,
  },
});

// ============ 4. Función para mandar el mail ============
async function sendTicketEmail({ email, nombre, ticketNumber }) {
  if (!email) {
    console.warn(`⚠ No se envía email porque el cliente no tiene correo (ticket #${ticketNumber})`);
    return;
  }

  const subject = `Tu ticket #${ticketNumber} fue creado con éxito`;

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

  const mailOptions = {
    from: `"${FROM_NAME || 'KutterCraft'}" <${MAIL_USER}>`,
    to: email,
    subject,
    html: htmlBody,
  };

  await transporter.sendMail(mailOptions);
  console.log(`✅ Mail enviado a ${email} para ticket #${ticketNumber}`);
}

// ============ 5. Buscar datos del cliente y mandar el mail ============
async function handleNewTicket(newTicketRow) {
  try {
    const ticketNumber = newTicketRow.ticket;     // ej: 1042
    const clienteId    = newTicketRow.cliente_id; // FK a cliente.id

    console.log(`🎫 Nuevo ticket detectado: ${ticketNumber} (cliente_id: ${clienteId})`);

    // Buscamos info del cliente
    const { data: clienteData, error: clienteErr } = await supabase
      .from('cliente')
      .select('nombre, apellido, correo_electronico')
      .eq('id', clienteId)
      .maybeSingle();

    if (clienteErr) {
      console.error("❌ Error buscando cliente:", clienteErr.message);
      return;
    }
    if (!clienteData) {
      console.warn(`⚠ No se encontró el cliente con id ${clienteId}`);
      return;
    }

    const fullName = [clienteData.nombre || '', clienteData.apellido || '']
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    await sendTicketEmail({
      email: clienteData.correo_electronico,
      nombre: fullName,
      ticketNumber,
    });

  } catch (err) {
    console.error("❌ Error en handleNewTicket:", err);
  }
}

// ============ 6. Suscripción Realtime + reconexión ============

// Guardamos referencia para poder re-suscribir si se cae
let channel = null;

async function subscribeRealtime() {
  console.log("👀 Escuchando nuevos tickets en tiempo real...");

  channel = supabase
    .channel('tickets-listener')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'tickets_mian',
      },
      async (payload) => {
        // payload.new es la fila nueva en tickets_mian
        await handleNewTicket(payload.new);
      }
    )
    .subscribe((status) => {
      console.log("📡 Estado canal Realtime:", status);
    });

  // opcional: monitoreo para ver si el canal se cierra
  channel.on('close', () => {
    console.warn('⚠ Canal Realtime cerrado. Reintentando en 5s...');
    setTimeout(() => {
      subscribeRealtime();
    }, 5000);
  });

  // opcional: monitoreo de errores en el canal
  channel.on('error', (err) => {
    console.error('❌ Error en canal Realtime:', err);
    console.warn('🔄 Reintentando suscripción en 5s...');
    setTimeout(() => {
      subscribeRealtime();
    }, 5000);
  });
}

// Arrancar el watcher
subscribeRealtime();
