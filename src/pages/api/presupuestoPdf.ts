import type { APIRoute } from 'astro';
import PdfPrinter from 'pdfmake';
import type { TDocumentDefinitions, TableCell, Alignment } from 'pdfmake/interfaces';
import { supabase } from '../../lib/supabase';
import { fmtARS0, toInt } from '../../lib/moneda';
import { fileURLToPath } from 'node:url';

// === Fuentes Roboto ===
const fonts = {
  Roboto: {
    normal:      fileURLToPath(new URL('../../lib/pdf/fonts/Roboto-Regular.ttf', import.meta.url)),
    bold:        fileURLToPath(new URL('../../lib/pdf/fonts/Roboto-Bold.ttf', import.meta.url)),
    italics:     fileURLToPath(new URL('../../lib/pdf/fonts/Roboto-Italic.ttf', import.meta.url)),
    bolditalics: fileURLToPath(new URL('../../lib/pdf/fonts/Roboto-BoldItalic.ttf', import.meta.url)),
  }
};
const printer = new PdfPrinter(fonts);

function safe(s?: string | null) { return (s ?? '').toString(); }
function todayISO() { return new Date().toISOString(); }
const right = (text: unknown): TableCell => ({ text: String(text ?? ''), alignment: 'right' as Alignment });

const PAGE_MARGINS = [40, 60, 40, 60] as [number, number, number, number];
const M_BOTTOM_12  = [0, 0, 0, 12] as [number, number, number, number];
const M_TOP_12     = [0, 12, 0, 0] as [number, number, number, number];
const M_BOTTOM_6   = [0, 0, 0, 6]  as [number, number, number, number];

export const GET: APIRoute = async (ctx) => {
  try {
    const perfil = (ctx.locals as any)?.perfil as { rol?: string; admin?: boolean } | undefined;
    const isAdmin = (perfil?.rol === 'admin') || (perfil?.admin === true);
    const showPrices = isAdmin;

    const ticketId = toInt(ctx.url.searchParams.get('ticket_id'));
    if (!ticketId) {
      return new Response('ticket_id inválido', { status: 400 });
    }

    // === Ticket ===
    const { data: tk, error: tkErr } = await supabase
      .from('tickets_mian')
      .select('id, ticket, cliente_id, impresora_id, fecha_de_reparacion, estado')
      .eq('id', ticketId)
      .single();
    if (tkErr || !tk) throw tkErr ?? new Error('No se encontró ticket');

    // === Cliente / Impresora ===
    const { data: cli } = await supabase
      .from('cliente')
      .select('cliente, nombre, apellido, dni_cuit, whatsapp, correo_electronico')
      .eq('id', tk.cliente_id)
      .maybeSingle();

    const { data: imp } = await supabase
      .from('impresoras')
      .select('modelo, maquina, numero_de_serie')
      .eq('id', tk.impresora_id)
      .maybeSingle();

    // === Presupuesto (último) ===
    const { data: presuRows } = await supabase
      .from('presupuestos')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('id', { ascending: false })
      .limit(1);

    const presupuesto = Array.isArray(presuRows) ? presuRows[0] : null;
    const presuId = presupuesto?.id ?? null;
    const fechaPresupuesto = safe(presupuesto?.fecha_presupuesto) || todayISO();

    // === Ítems ===
    type Item = { componente: string; cantidad: number; unit: number };
    let items: Item[] = [];

    if (presuId) {
      const { data: pr } = await supabase
        .from('presupuesto_repuestos')
        .select('repuesto_id, cantidad, precio_unit')
        .eq('presupuesto_id', presuId);

      const ids = (pr ?? []).map(r => r.repuesto_id);
      const nombres: Record<number, string> = {};

      if (ids.length) {
        const { data: rep } = await supabase
          .from('repuestos_csv')
          .select('id, "Componentes presupuestados"')
          .in('id', ids);
        for (const r of (rep ?? [])) {
          // @ts-ignore columna con espacios
          nombres[r.id] = (r['Componentes presupuestados'] ?? '') as string;
        }
      }

      items = (pr ?? []).map(r => ({
        componente: nombres[r.repuesto_id] ?? '',
        cantidad: r.cantidad ?? 1,
        unit: Number(r.precio_unit ?? 0) || 0,
      }));
    }

    const hasItems = items.length > 0;
    const subtotal = showPrices ? items.reduce((a, it) => a + it.unit * it.cantidad, 0) : 0;
    const iva = showPrices ? Math.round(subtotal * 0.21) : 0;
    const total = showPrices ? subtotal + iva : 0;

    // === Empresa ===
    const empresa = {
      nombre: 'KUTTERCRAFT',
      linea1: 'kuttercraft@gmail.com - www.kuttercraft.com',
      linea2: 'Juncal 1506 (1824) - Lanús - Argentina',
      linea3: '1150572793 - IVA Responsable Inscripto',
      cuit: 'CUIT: 20-34052719-5',
    };

    // === Cliente ===
    const nombreCli = cli?.cliente || [cli?.nombre, cli?.apellido].filter(Boolean).join(' ');
    const cuitCli = safe(cli?.dni_cuit);
    const correo = safe(cli?.correo_electronico) || '-';
    const telefono = safe(cli?.whatsapp) || '-';

    // === Equipo ===
    const modelo = imp?.modelo || imp?.maquina || '-';
    const nroSerie = imp?.numero_de_serie || '-';

    // === Tabla de ítems ===
    const tableBody: TableCell[][] = [];
    const headRow: TableCell[] = [
      { text: 'Repuesto', bold: true },
      { text: 'Cant.', alignment: 'right' as Alignment, bold: true },
    ];
    if (showPrices) headRow.push(
      { text: 'P. Unit.', alignment: 'right' as Alignment, bold: true },
      { text: 'Importe', alignment: 'right' as Alignment, bold: true },
    );
    tableBody.push(headRow);

    for (const it of items) {
      const row: TableCell[] = [
        { text: it.componente || '' },
        right(it.cantidad),
      ];
      if (showPrices) {
        row.push(
          right(fmtARS0(it.unit)),
          right(fmtARS0(it.unit * it.cantidad)),
        );
      }
      tableBody.push(row);
    }

    if (!hasItems) {
      tableBody.push([
        { text: 'Sin repuestos seleccionados', italics: true, colSpan: showPrices ? 4 : 2 },
        {}, ...(showPrices ? [{}, {}] : [])
      ]);
    }

    // === Documento PDF ===
    const docDefinition: TDocumentDefinitions = {
      pageMargins: PAGE_MARGINS,
      defaultStyle: { font: 'Roboto', fontSize: 10 },
      content: [
        // Encabezado
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
              { text: `Ticket #${tk.ticket ?? tk.id}`, alignment: 'right' as Alignment },
              { text: `Fecha: ${new Date(fechaPresupuesto).toLocaleDateString('es-AR')}`, alignment: 'right' as Alignment },
            ],
          ],
          columnGap: 20,
          margin: M_BOTTOM_12,
        },

        // Cliente
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

        // Ítems
        { text: 'Repuestos', style: 'h2', margin: M_BOTTOM_6 },
        {
          table: {
            headerRows: 1,
            widths: (showPrices ? ['*', 40, 70, 70] : ['*', 40]) as (number | string)[],
            body: tableBody
          },
          layout: 'lightHorizontalLines',
        },

        // Totales (solo admin)
        ...(showPrices ? [
          {
            columns: [
              { text: 'Observaciones: Precios válidos hasta la fecha indicada.', italics: true },
              {
                width: 220,
                table: {
                  widths: ['*', '*'],
                  body: [
                    [{ text: 'Subtotal', bold: true }, right(fmtARS0(subtotal))],
                    [{ text: 'IVA (21%)', bold: true }, right(fmtARS0(iva))],
                    [{ text: 'Total', bold: true }, right(fmtARS0(total))],
                  ] as TableCell[][]
                },
                layout: 'noBorders' as const
              }
            ],
            margin: M_TOP_12,
          }
        ] : [
          { text: 'Observaciones: Documento informativo sin precios (vista técnico).', italics: true, margin: M_TOP_12 }
        ]),
      ],
      styles: {
        h1: { fontSize: 16, bold: true },
        h2: { fontSize: 12, bold: true },
        bigRight: { fontSize: 18, bold: true, alignment: 'right' as Alignment },
        box: {}
      }
    };

    // === Crear PDF ===
    const pdfDoc = printer.createPdfKitDocument(docDefinition);
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      pdfDoc.on('data', (d: Buffer) => chunks.push(d));
      pdfDoc.on('end', () => resolve());
      pdfDoc.on('error', reject);
      pdfDoc.end();
    });
    const pdfBuffer = Buffer.concat(chunks);

    // === Nombre del archivo ===
    const clienteNom = (nombreCli || 'Cliente').replace(/[^\w\s]/g, '').replace(/\s+/g, '_');
    const filename = `Presupuesto_${clienteNom}_${tk.ticket ?? tk.id}.pdf`;

    return new Response(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`
      }
    });
  } catch (e: any) {
    console.error('presupuestoPdf error:', e?.message || e);
    return new Response('Error al generar PDF', { status: 500 });
  }
};
