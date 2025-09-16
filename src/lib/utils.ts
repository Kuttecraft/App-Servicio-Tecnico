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

/* =========================
   💰 Utilidades de moneda ARS
   ========================= */

/** ¿La cadena usa el separador `sep` como miles? (grupos de 3 a la derecha) */
function esPatronMiles(s: string, sep: ',' | '.'): boolean {
  // ejemplos válidos: "1,234", "12,345", "1,234,567" / "1.234", "1.234.567"
  const partes = s.split(sep);
  if (partes.length <= 1) return false;
  // el último grupo debe tener 3 dígitos; y todos los intermedios también 3
  const ultimo = partes[partes.length - 1];
  if (!/^\d{3}$/.test(ultimo)) return false;
  for (let i = 1; i < partes.length - 1; i++) {
    if (!/^\d{3}$/.test(partes[i])) return false;
  }
  // el primer grupo puede ser 1-3 dígitos (o más, si viniera sucio)
  return /^\d{1,3}$/.test(partes[0]);
}

/** Parsea un string en formato AR/ES/“mixto” a número JS.
 *  Soporta: "18200" -> 18200 ; "18,200" -> 18200 ; "18.200" -> 18200 ;
 *           "1.820,50" -> 1820.5 ; "1,820.50" -> 1820.5 ; "$ 20.000" -> 20000
 */
export function parseNumeroAR(input: any): number | null {
  if (input == null) return null;
  let s = String(input).trim();
  if (!s) return null;

  // Dejar solo dígitos, coma, punto y signo
  s = s.replace(/[^0-9.,-]/g, '');

  const commaCount = (s.match(/,/g) || []).length;
  const dotCount   = (s.match(/\./g) || []).length;

  if (commaCount > 0 && dotCount > 0) {
    // Hay ambos: el ÚLTIMO separador que aparezca es el decimal; el otro es miles
    const lastP = s.lastIndexOf('.');
    const lastC = s.lastIndexOf(',');
    const decimalSep: '.' | ',' = lastP > lastC ? '.' : ',';
    const milesSep: '.' | ','   = decimalSep === '.' ? ',' : '.';
    s = s.split(milesSep).join(''); // quitar miles
    if (decimalSep === ',') s = s.replace(',', '.'); // decimal a punto
  } else if (commaCount > 0 && dotCount === 0) {
    // Solo coma: ¿es miles o decimal?
    if (esPatronMiles(s, ',')) {
      s = s.split(',').join(''); // miles
    } else {
      s = s.replace(',', '.');   // decimal
    }
  } else if (dotCount > 0 && commaCount === 0) {
    // Solo punto: ¿es miles o decimal?
    if (esPatronMiles(s, '.')) {
      s = s.split('.').join(''); // miles
    } else {
      // punto decimal → queda igual
    }
  }
  const n = Number(s);
  return isFinite(n) ? n : null;
}

/** Formatea a pesos ARS con separador de miles (.) y decimales (,).
 *  Si es entero → sin decimales; si tiene decimales → 2 decimales.
 */
export function formatARS(value: any): string {
  const n = parseNumeroAR(value);
  if (n == null) return '';
  const hasDecimals = Math.round(n * 100) !== Math.round(n) * 100;
  const min = hasDecimals ? 2 : 0;
  const max = hasDecimals ? 2 : 0;
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: min,
    maximumFractionDigits: max,
  }).format(n);
}

/** Compat: formatea un número como ARS (acepta strings con $, puntos, comas, etc.) */
export function formatearMoneda(valor: number | string): string {
  const s = formatARS(valor);
  return s || '—';
}
