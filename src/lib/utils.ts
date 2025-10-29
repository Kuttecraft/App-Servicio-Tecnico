/**
 * utils.ts
 *
 * Conjunto de utilidades de formato y parsing usadas en la app:
 *  - Fechas
 *  - Booleanos legibles
 *  - Capitalización
 *  - Moneda ARS (parseo flexible y formateo)
 *
 * Todo está pensado para UI: mostrarle al usuario algo limpio a partir
 * de datos que pueden venir rotos, incompletos o en formatos distintos.
 */

/**
 * Devuelve siempre MM/DD/YYYY a partir de un string de fecha.
 *
 * Reglas:
 *  1. Si viene en formato "MM/DD/YYYY", "M/D/YYYY", "MM-DD-YYYY", etc. → lo normaliza.
 *  2. Si viene en formato ISO "YYYY-MM-DD" o "YYYY-MM-DDTHH:mm" → lo convierte a MM/DD/YYYY.
 *  3. Si no lo puede interpretar de forma segura, devuelve el string original.
 *
 * Importante:
 * - NO usa `new Date(...)` para evitar problemas de timezone/reordenamiento
 *   (por ejemplo, que "2025-10-29" pase a mostrarse como el día anterior
 *   si se corre en otra zona horaria).
 *
 * @param input Fecha en string o null/undefined.
 * @returns string formateado "MM/DD/YYYY" o '—' si no hay valor.
 */
export function formatearFecha(input?: string | null): string {
  if (!input) return '—';
  const s = String(input).trim();

  // 1) Detectar MM/DD/YYYY o M/D/YYYY (se permite / o - como separador)
  //    Opcionalmente puede venir con hora después (ej: "10/29/2025 13:00")
  let m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:[ T].*)?$/);
  if (m) {
    const mm = m[1].padStart(2, '0');
    const dd = m[2].padStart(2, '0');
    const yyyy = m[3];
    return `${mm}/${dd}/${yyyy}`;
  }

  // 2) Detectar ISO/SQL style: YYYY-MM-DD (opcional hora después)
  //    Lo volvemos MM/DD/YYYY
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T].*)?$/);
  if (m) {
    const yyyy = m[1], mm = m[2], dd = m[3];
    return `${mm}/${dd}/${yyyy}`;
  }

  // 3) No lo pudimos normalizar sin riesgo → devolvemos tal cual
  //    (preferimos no inventar un orden ambiguo tipo DD/MM vs MM/DD)
  return s;
}

/**
 * Convierte un booleano o string equivalente en texto legible "Sí" / "No".
 *
 * Reglas:
 *  - true  → "Sí"
 *  - false → "No"
 *  - "sí", "si" (cualquier mayúscula/minúscula) → "Sí"
 *  - "no" → "No"
 *  - Cualquier otra cosa → "No" (fallback conservador)
 *
 * @param valor boolean | string
 * @returns "Sí" o "No"
 */
export function booleanATexto(valor: boolean | string): string {
  if (typeof valor === 'boolean') return valor ? 'Sí' : 'No';

  if (typeof valor === 'string') {
    const v = valor.trim().toLowerCase();
    if (v === 'sí' || v === 'si') return 'Sí';
    if (v === 'no') return 'No';
  }

  return 'No';
}

/**
 * Capitaliza la primera letra de un string.
 *
 * Ejemplo:
 *   capitalizar("juan") → "Juan"
 *   capitalizar("pÉREZ") → "PÉREZ" (no tocamos el resto)
 *
 * @param str string
 * @returns string con la primera letra en mayúscula
 */
export function capitalizar(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/* =========================
   💰 Utilidades de moneda ARS
   ========================= */

/**
 * Verifica si un string numérico parece estar usando `sep` como separador de miles.
 *
 * Ejemplos válidos:
 *   "1,234"
 *   "12,345"
 *   "1,234,567"
 *   "1.234"
 *   "1.234.567"
 *
 * Criterios:
 *  - Se parte el string por ese separador.
 *  - Todos los grupos intermedios y el último tienen exactamente 3 dígitos.
 *  - El primer grupo tiene 1-3 dígitos.
 *
 * Si eso se cumple → asumimos que `sep` está siendo usado para miles.
 * Si no → probablemente `sep` no representa miles (capaz es decimal).
 *
 * @param s string numérico original (ej: "1.234,56", "12,5")
 * @param sep separador a evaluar, ',' o '.'
 * @returns true si parece formato de miles, false si no
 */
function esPatronMiles(s: string, sep: ',' | '.'): boolean {
  const partes = s.split(sep);
  if (partes.length <= 1) return false;

  // último grupo debe tener exactamente 3 dígitos (ej: "1.234" → "234")
  const ultimo = partes[partes.length - 1];
  if (!/^\d{3}$/.test(ultimo)) return false;

  // todos los grupos intermedios también deben ser de 3 dígitos
  for (let i = 1; i < partes.length - 1; i++) {
    if (!/^\d{3}$/.test(partes[i])) return false;
  }

  // el primer bloque puede tener 1-3 dígitos (ej: "1", "12", "123")
  return /^\d{1,3}$/.test(partes[0]);
}

/**
 * parseNumeroAR
 * --------------------------------------------
 * Intenta parsear un string (o número) que representa un monto de dinero
 * en formato "argentino/español/mixto" y devolverlo como número JS.
 *
 * Soporta entradas como:
 *   "18200"        → 18200
 *   "18,200"       → 18200
 *   "18.200"       → 18200
 *   "1.820,50"     → 1820.5   (formato europeo: . = miles, , = decimales)
 *   "1,820.50"     → 1820.5   (formato inglés/US: , = miles, . = decimales)
 *   "$ 20.000"     → 20000
 *   "  $1.234,00 " → 1234
 *
 * Reglas internas:
 * - Limpia todo lo que no sea dígitos, coma, punto o signo '-'.
 * - Detecta si tenés coma y punto a la vez → el ÚLTIMO separador se toma como decimal.
 * - Si sólo hay coma o sólo hay punto, adivina si es miles o decimal usando esPatronMiles().
 * - Devuelve `null` si no es parseable en un número finito.
 *
 * @param input cualquier cosa (string, number, etc.)
 * @returns number normalizado (ej: 1820.5) o null si no se pudo interpretar
 */
export function parseNumeroAR(input: any): number | null {
  if (input == null) return null;
  let s = String(input).trim();
  if (!s) return null;

  // Dejamos únicamente dígitos, coma, punto y signo menos.
  s = s.replace(/[^0-9.,-]/g, '');

  const commaCount = (s.match(/,/g) || []).length;
  const dotCount   = (s.match(/\./g) || []).length;

  if (commaCount > 0 && dotCount > 0) {
    // Caso "mixto": Ej "1.234,56" o "1,234.56"
    //
    // Regla:
    //  - El ÚLTIMO separador que aparezca se interpreta como separador decimal.
    //  - El otro se considera separador de miles (se elimina).
    //
    const lastP = s.lastIndexOf('.');
    const lastC = s.lastIndexOf(',');
    const decimalSep: '.' | ',' = lastP > lastC ? '.' : ',';
    const milesSep:   '.' | ',' = decimalSep === '.' ? ',' : '.';

    // Quitamos separador de miles
    s = s.split(milesSep).join('');

    // Si el decimal es coma, la pasamos a punto para Number()
    if (decimalSep === ',') {
      s = s.replace(',', '.');
    }
  } else if (commaCount > 0 && dotCount === 0) {
    // Solo hay comas.
    // Puede ser miles ("12,345") o decimal ("12,5").
    if (esPatronMiles(s, ',')) {
      // Ej "12,345" → "12345"
      s = s.split(',').join('');
    } else {
      // Ej "12,5" → "12.5"
      s = s.replace(',', '.');
    }
  } else if (dotCount > 0 && commaCount === 0) {
    // Solo hay puntos.
    // Puede ser miles ("12.345") o decimal ("12.5").
    if (esPatronMiles(s, '.')) {
      // Ej "12.345" → "12345"
      s = s.split('.').join('');
    } else {
      // "12.5" se deja tal cual, porque '.' ya sirve como decimal en JS
    }
  }

  const n = Number(s);
  return isFinite(n) ? n : null;
}

/**
 * Formatea un número como ARS usando Intl.NumberFormat('es-AR'),
 * devolviendo una string tipo "$ 1.234" o "$ 1.234,50".
 *
 * - Si el número no tiene parte decimal (por ejemplo 20000),
 *   se muestra sin decimales.
 *
 * - Si el número tiene parte decimal (por ejemplo 1820.5),
 *   se muestran 2 decimales.
 *
 * Acepta valores sucios tipo strings con "$", ".", "," porque primero
 * los pasa por parseNumeroAR().
 *
 * @param value cualquier valor numérico o string numérico.
 * @returns string formateada como moneda ARS, o '' si no se pudo formatear.
 */
export function formatARS(value: any): string {
  const n = parseNumeroAR(value);
  if (n == null) return '';

  // Detectar si hay decimales "reales":
  // Comparamos n*100 redondeado con n redondeado*100,
  // si difieren => tiene parte decimal significativa.
  const hasDecimals =
    Math.round(n * 100) !== Math.round(n) * 100;

  const min = hasDecimals ? 2 : 0;
  const max = hasDecimals ? 2 : 0;

  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: min,
    maximumFractionDigits: max,
  }).format(n);
}

/**
 * Compat: forma rápida de formatear a moneda ARS listo para UI.
 *
 * Intenta formatear el valor con formatARS().  
 * Si no se puede (string vacío, null, etc.), devuelve "—".
 *
 * @param valor número o string tipo "$1.234,50"
 * @returns string con formato ARS listo para mostrar al usuario
 */
export function formatearMoneda(valor: number | string): string {
  const s = formatARS(valor);
  return s || '—';
}
