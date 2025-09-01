/** Devuelve siempre MM/DD/AAAA (sin hora). No usa `new Date()` para evitar reordenamientos. */
export function formatearFecha(input?: string | null): string {
  if (!input) return '—';
  const s = String(input).trim();

  // 1) MM/DD/YYYY o M/D/YYYY (con / o -)
  let m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:[ T].*)?$/);
  if (m) {
    const mm = m[1].padStart(2, '0');
    const dd = m[2].padStart(2, '0');
    const yyyy = m[3];
    return `${mm}/${dd}/${yyyy}`;
  }

  // 2) ISO o YYYY-MM-DD → MM/DD/YYYY
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T].*)?$/);
  if (m) {
    const yyyy = m[1], mm = m[2], dd = m[3];
    return `${mm}/${dd}/${yyyy}`;
  }

  // 3) Caso ambiguo con barras: dejamos tal cual (evita malinterpretar)
  return s;
}

/** Convierte true/false o string "Sí"/"No" en 'Sí' / 'No' para visualización */
export function booleanATexto(valor: boolean | string): string {
  if (typeof valor === 'boolean') return valor ? 'Sí' : 'No';
  if (typeof valor === 'string') {
    const v = valor.trim().toLowerCase();
    if (v === 'sí' || v === 'si') return 'Sí';
    if (v === 'no') return 'No';
  }
  return 'No';
}

/** Capitaliza la primera letra de un string */
export function capitalizar(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/** Formatea un número como moneda en ARS */
export function formatearMoneda(valor: number | string): string {
  const num = typeof valor === 'string' ? parseFloat(valor) : valor;
  return num.toLocaleString('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
  });
}
