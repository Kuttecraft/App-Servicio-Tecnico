import type { APIRoute } from 'astro';
import PdfPrinter from 'pdfmake';
import type { TDocumentDefinitions, TableCell, Alignment } from 'pdfmake/interfaces';
import { supabase } from '../../lib/supabase';
import { fmtARS0, toInt } from '../../lib/moneda';
import { fileURLToPath } from 'node:url';

/**
 * Endpoint GET /api/presupuestoPdf?ticket_id=123
 *
 * 📄 Qué hace:
 * - Genera un PDF del presupuesto asociado a un ticket dado.
 * - Incluye datos de:
 *    • Empresa
 *    • Cliente
 *    • Equipo
 *    • Ítems del presupuesto (repuestos usados en la reparación)
 *    • Totales con IVA (solo si el usuario es admin)
 *
 * 🔐 Seguridad:
 * - Determina si el perfil (ctx.locals.perfil) es admin.
 *   - Si es admin → muestra precios unitarios, subtotal, IVA y total.
 *   - Si NO es admin → genera versión "técnico": sólo lista repuestos y cantidades, sin plata.
 *
 * 🔁 Flujo interno:
 * 1. Lee `ticket_id` del querystring.
 * 2. Busca ticket en `tickets_mian`.
 * 3. Busca datos del cliente (`cliente`) y de la impresora (`impresoras`).
 * 4. Busca el presupuesto más reciente (`presupuestos` con ese ticket).
 * 5. Trae los ítems del presupuesto (`presupuesto_repuestos`) con:
 *      - repuesto_id
 *      - cantidad
 *      - precio_unit (snapshot en el momento del presupuesto)
 *    y cruza contra `repuestos_csv` para obtener el nombre del repuesto.
 * 6. Calcula subtotal / IVA / total (si corresponde).
 * 7. Arma el documento pdfmake (docDefinition).
 * 8. Renderiza el PDF en memoria y responde un attachment .pdf descargable.
 *
 * 📤 Respuesta:
 * - 200 → PDF binario con Content-Type application/pdf
 * - 400 → ticket_id inválido
 * - 500 → error al generar
 *
 * 📄 Nombre del archivo:
 *   "Presupuesto_<Cliente>_<Ticket>.pdf"
 */

// === Fuentes Roboto que usa pdfmake ===
// pdfmake necesita paths absolutos a las fuentes TrueType.
const fonts = {
  Roboto: {
    normal:      fileURLToPath(new URL('../../lib/pdf/fonts/Roboto-Regular.ttf', import.meta.url)),
    bold:        fileURLToPath(new URL('../../lib/pdf/fonts/Roboto-Bold.ttf', import.meta.url)),
    italics:     fileURLToPath(new URL('../../lib/pdf/fonts/Roboto-Italic.ttf', import.meta.url)),
    bolditalics: fileURLToPath(new URL('../../lib/pdf/fonts/Roboto-BoldItalic.ttf', import.meta.url)),
  }
};
const printer = new PdfPrinter(fonts);

/**
 * safe(s):
 * Devuelve string seguro (sin null/undefined).
 */
function safe(s?: string | null) { return (s ?? '').toString(); }

/**
 * todayISO():
 * Fecha actual en ISO (YYYY-MM-DDTHH:mm:ss.sssZ) como fallback.
 * Se usa si el presupuesto no tiene fecha_presupuesto.
 */
function todayISO() { return new Date().toISOString(); }

/**
 * right(text):
 * Helper para celdas alineadas a la derecha en tablas PDF.
 */
const right = (text: unknown): TableCell => ({
  text: String(text ?? ''),
  alignment: 'right' as Alignment
});

// Márgenes comunes reutilizables
const PAGE_MARGINS = [40, 60, 40, 60] as [number, number, number, number];
const M_BOTTOM_12  = [0, 0, 0, 12] as [number, number, number, number];
const M_TOP_12     = [0, 12, 0, 0] as [number, number, number, number];
const M_BOTTOM_6   = [0, 0, 0, 6]  as [number, number, number, number];

export const GET: APIRoute = async (ctx) => {
  try {
    // ============================================================
    // 1️⃣ Chequeo de permisos y parámetros
    // ============================================================

    // Perfil del usuario actual (inyectado en locals por middleware)
    // isAdmin = true si rol es 'admin' o flag admin=true
    const perfil = (ctx.locals as any)?.perfil as { rol?: string; admin?: boolean } | undefined;
    const isAdmin = (perfil?.rol === 'admin') || (perfil?.admin === true);

    // showPrices determina si mostramos precios en el PDF
    const showPrices = isAdmin;

    // ticket_id es obligatorio
    const ticketId = toInt(ctx.url.searchParams.get('ticket_id'));
    if (!ticketId) {
      return new Response('ticket_id inválido', { status: 400 });
    }

    // ============================================================
    // 2️⃣ Obtener el ticket base
    // ============================================================
    //
    // Tomamos los datos mínimos:
    //   - id / ticket (número de ticket legible)
    //   - cliente_id (fk a cliente)
    //   - impresora_id (fk a impresoras)
    //   - fecha_de_reparacion y estado (por si se quieren mostrar luego)
    //
    const { data: tk, error: tkErr } = await supabase
      .from('tickets_mian')
      .select('id, ticket, cliente_id, impresora_id, fecha_de_reparacion, estado')
      .eq('id', ticketId)
      .single();

    if (tkErr || !tk) throw tkErr ?? new Error('No se encontró ticket');

    // ============================================================
    // 3️⃣ Obtener datos de cliente e impresora
    // ============================================================

    // Cliente: nombre comercial / nombre+apellido / DNI o CUIT / contacto
    const { data: cli } = await supabase
      .from('cliente')
      .select('cliente, nombre, apellido, dni_cuit, whatsapp, correo_electronico')
      .eq('id', tk.cliente_id)
      .maybeSingle();

    // Impresora asociada al ticket: modelo, máquina, número de serie
    const { data: imp } = await supabase
      .from('impresoras')
      .select('modelo, maquina, numero_de_serie')
      .eq('id', tk.impresora_id)
      .maybeSingle();

    // ============================================================
    // 4️⃣ Obtener el presupuesto más reciente de ese ticket
    // ============================================================
    //
    // Buscamos `presupuestos` por ticket_id, ordenado desc por id.
    // Tomamos el más nuevo (limit 1).
    //
    const { data: presuRows } = await supabase
      .from('presupuestos')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('id', { ascending: false })
      .limit(1);

    const presupuesto = Array.isArray(presuRows) ? presuRows[0] : null;
    const presuId = presupuesto?.id ?? null;

    // Usamos la fecha del presupuesto. Si no hay, usamos now como fallback.
    const fechaPresupuesto = safe(presupuesto?.fecha_presupuesto) || todayISO();

    // ============================================================
    // 5️⃣ Cargar ítems del presupuesto
    // ============================================================
    //
    // Para cada ítem en `presupuesto_repuestos`:
    //   - repuesto_id
    //   - cantidad
    //   - precio_unit (snapshot numérico guardado en ese momento)
    //
    // Luego cruzamos para obtener el nombre legible del repuesto desde
    // `repuestos_csv` → "Componentes presupuestados".
    //
    type Item = { componente: string; cantidad: number; unit: number };
    let items: Item[] = [];

    if (presuId) {
      const { data: pr } = await supabase
        .from('presupuesto_repuestos')
        .select('repuesto_id, cantidad, precio_unit')
        .eq('presupuesto_id', presuId);

      const ids = (pr ?? []).map(r => r.repuesto_id);
      const nombres: Record<number, string> = {};

      // Traemos los nombres de repuestos en una sola query
      if (ids.length) {
        const { data: rep } = await supabase
          .from('repuestos_csv')
          .select('id, "Componentes presupuestados"')
          .in('id', ids);

        // Mapeamos id → nombre legible
        for (const r of (rep ?? [])) {
          // @ts-ignore porque la columna tiene espacios
          nombres[r.id] = (r['Componentes presupuestados'] ?? '') as string;
        }
      }

      // Armamos el array items que se usa para la tabla del PDF
      items = (pr ?? []).map(r => ({
        componente: nombres[r.repuesto_id] ?? '',
        cantidad: r.cantidad ?? 1,
        unit: Number(r.precio_unit ?? 0) || 0, // precio_unit: guardado como número entero (ej: 12300)
      }));
    }

    const hasItems = items.length > 0;

    // ============================================================
    // 6️⃣ Calcular totales (solo si showPrices === true)
    // ============================================================
    //
    // subtotal = sum(precio_unit * cantidad)
    // iva      = 21% del subtotal (redondeado)
    // total    = subtotal + iva
    //
    const subtotal = showPrices
      ? items.reduce((a, it) => a + it.unit * it.cantidad, 0)
      : 0;

    const iva = showPrices
      ? Math.round(subtotal * 0.21)
      : 0;

    const total = showPrices
      ? subtotal + iva
      : 0;

    // ============================================================
    // 7️⃣ Datos de cabecera: empresa / cliente / equipo
    // ============================================================

    // Datos fijos de la empresa que van en el encabezado del PDF
    const empresa = {
      nombre: 'KUTTERCRAFT',
      linea1: 'kuttercraft@gmail.com - www.kuttercraft.com',
      linea2: 'Juncal 1506 (1824) - Lanús - Argentina',
      linea3: '1150572793 - IVA Responsable Inscripto',
      cuit: 'CUIT: 20-34052719-5',
    };

    // Cliente: intentamos primero "cliente" (razón social / nombre de la ficha),
    // si no, concatenamos nombre+apellido.
    const nombreCli =
      cli?.cliente ||
      [cli?.nombre, cli?.apellido].filter(Boolean).join(' ');

    const cuitCli = safe(cli?.dni_cuit);
    const correo = safe(cli?.correo_electronico) || '-';
    const telefono = safe(cli?.whatsapp) || '-';

    // Datos del equipo asociado (impresora)
    const modelo = imp?.modelo || imp?.maquina || '-';
    const nroSerie = imp?.numero_de_serie || '-';

    // ============================================================
    // 8️⃣ Construir tabla de ítems para pdfmake
    // ============================================================
    //
    // Estructura:
    //   [ Repuesto | Cant. | P.Unit | Importe ]
    //
    // Si NO se muestran precios (técnico no admin), la tabla sólo tiene:
    //   [ Repuesto | Cant. ]
    //
    const tableBody: TableCell[][] = [];

    // Fila de encabezado de la tabla
    const headRow: TableCell[] = [
      { text: 'Repuesto', bold: true },
      { text: 'Cant.', alignment: 'right' as Alignment, bold: true },
    ];
    if (showPrices) {
      headRow.push(
        { text: 'P. Unit.', alignment: 'right' as Alignment, bold: true },
        { text: 'Importe', alignment: 'right' as Alignment, bold: true },
      );
    }
    tableBody.push(headRow);

    // Filas de ítems
    for (const it of items) {
      const row: TableCell[] = [
        { text: it.componente || '' },
        right(it.cantidad),
      ];

      if (showPrices) {
        row.push(
          right(fmtARS0(it.unit)),                   // precio unitario
          right(fmtARS0(it.unit * it.cantidad)),     // importe = unit * cantidad
        );
      }

      tableBody.push(row);
    }

    // Caso sin ítems → mostramos mensaje placeholder
    if (!hasItems) {
      tableBody.push([
        {
          text: 'Sin repuestos seleccionados',
          italics: true,
          colSpan: showPrices ? 4 : 2,
        },
        {},
        ...(showPrices ? [{}, {}] : [])
      ]);
    }

    // ============================================================
    // 9️⃣ Armar definición del PDF (pdfmake docDefinition)
    // ============================================================
    //
    // - pageMargins: márgenes globales
    // - defaultStyle: fuente base y tamaño
    // - content: array de bloques (encabezado, datos cliente/equipo, tabla items, totales)
    // - styles: estilos reutilizables (h1, h2, bigRight, box)
    //
    const docDefinition: TDocumentDefinitions = {
      pageMargins: PAGE_MARGINS,
      defaultStyle: { font: 'Roboto', fontSize: 10 },
      content: [
        // --------------------------------------------------------
        // Encabezado con datos de la empresa + info del presupuesto
        // --------------------------------------------------------
        {
          columns: [
            [
              { text: empresa.nombre, style: 'h1' },
              { text: empresa.linea1 },
              { text: empresa.linea2 },
              { text: empresa.linea3 },
              { text: empresa.cuit },
            ],
            [
              { text: 'PRESUPUESTO', style: 'bigRight' },
              {
                text: `Ticket #${tk.ticket ?? tk.id}`,
                alignment: 'right' as Alignment
              },
              {
                text: `Fecha: ${new Date(fechaPresupuesto).toLocaleDateString('es-AR')}`,
                alignment: 'right' as Alignment
              },
            ],
          ],
          columnGap: 20,
          margin: M_BOTTOM_12,
        },

        // --------------------------------------------------------
        // Datos del cliente y del equipo
        // --------------------------------------------------------
        {
          style: 'box',
          table: {
            widths: ['*', '*'],
            body: [
              [{ text: 'Cliente', bold: true }, { text: nombreCli || '—' }],
              [{ text: 'CUIT / DNI', bold: true }, { text: cuitCli || '—' }],
              [{ text: 'Correo electrónico', bold: true }, { text: correo }],
              [{ text: 'Teléfono', bold: true }, { text: telefono }],
              [{ text: 'Equipo', bold: true }, { text: `Modelo: ${modelo}` }],
              [{ text: 'Número de serie', bold: true }, { text: nroSerie }],
            ] as TableCell[][]
          },
          layout: 'lightHorizontalLines',
          margin: M_BOTTOM_12,
        },

        // --------------------------------------------------------
        // Tabla de repuestos / ítems
        // --------------------------------------------------------
        { text: 'Repuestos', style: 'h2', margin: M_BOTTOM_6 },
        {
          table: {
            headerRows: 1,
            widths: (showPrices ? ['*', 40, 70, 70] : ['*', 40]) as (number | string)[],
            body: tableBody
          },
          layout: 'lightHorizontalLines',
        },

        // --------------------------------------------------------
        // Totales con IVA (solo admins ven precios)
        // Caso técnico (sin precios): mensaje genérico
        // --------------------------------------------------------
        ...(showPrices
          ? [
              {
                columns: [
                  {
                    text: 'Observaciones: Precios válidos hasta la fecha indicada.',
                    italics: true
                  },
                  {
                    width: 220,
                    table: {
                      widths: ['*', '*'],
                      body: [
                        [
                          { text: 'Subtotal', bold: true },
                          right(fmtARS0(subtotal))
                        ],
                        [
                          { text: 'IVA (21%)', bold: true },
                          right(fmtARS0(iva))
                        ],
                        [
                          { text: 'Total', bold: true },
                          right(fmtARS0(total))
                        ],
                      ] as TableCell[][]
                    },
                    layout: 'noBorders' as const
                  }
                ],
                margin: M_TOP_12,
              }
            ]
          : [
              {
                text: 'Observaciones: Documento informativo sin precios (vista técnico).',
                italics: true,
                margin: M_TOP_12
              }
            ]
        ),
      ],
      styles: {
        h1: { fontSize: 16, bold: true },
        h2: { fontSize: 12, bold: true },
        bigRight: {
          fontSize: 18,
          bold: true,
          alignment: 'right' as Alignment
        },
        box: {}
      }
    };

    // ============================================================
    // 🔟 Generar el PDF en memoria
    // ============================================================
    //
    // pdfmake devuelve un stream estilo PDFKit.
    // Lo acumulamos en `chunks` hasta finalizar.
    //
    const pdfDoc = printer.createPdfKitDocument(docDefinition);
    const chunks: Buffer[] = [];

    await new Promise<void>((resolve, reject) => {
      pdfDoc.on('data', (d: Buffer) => chunks.push(d));
      pdfDoc.on('end', () => resolve());
      pdfDoc.on('error', reject);
      pdfDoc.end();
    });

    const pdfBuffer = Buffer.concat(chunks);

    // ============================================================
    // 1️⃣1️⃣ Armar nombre de archivo sugerido
    // ============================================================
    //
    // Ejemplo:
    //   Presupuesto_Juan_Perez_1234.pdf
    //
    const clienteNom = (nombreCli || 'Cliente')
      .replace(/[^\w\s]/g, '')    // saca símbolos raros
      .replace(/\s+/g, '_');      // espacios -> _

    const filename = `Presupuesto_${clienteNom}_${tk.ticket ?? tk.id}.pdf`;

    // ============================================================
    // 1️⃣2️⃣ Enviar respuesta binaria (attachment)
    // ============================================================
    return new Response(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`
      }
    });
  } catch (e: any) {
    // ============================================================
    // ❌ Error global
    // ============================================================
    console.error('presupuestoPdf error:', e?.message || e);
    return new Response('Error al generar PDF', { status: 500 });
  }
};
