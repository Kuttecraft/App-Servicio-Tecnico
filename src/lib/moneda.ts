/**
 * moneda.ts
 * ------------------------------------------------------------
 * Utilidades de formato y conversión para valores monetarios en ARS.
 * 
 * Incluye:
 *  - fmtARS0(): Formatea un número como moneda argentina (sin decimales)
 *  - toInt(): Convierte un valor genérico a número entero seguro
 * 
 * Ambas funciones están diseñadas para ser defensivas y soportar entradas
 * que puedan venir de formularios, consultas o strings con números.
 * ------------------------------------------------------------
 */

/**
 * Formatea un número como moneda argentina (ARS) sin decimales.
 *
 * Ejemplo:
 *   fmtARS0(1500) → "$ 1.500"
 *
 * @param n - Número a formatear. Si es null/undefined, se usa 0 por defecto.
 * @returns string con formato de moneda según 'es-AR'.
 */
export function fmtARS0(n: number): string {
  // `(n ?? 0)` asegura que si n es null o undefined, use 0.
  return (n ?? 0).toLocaleString('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0, // sin decimales
    maximumFractionDigits: 0, // sin decimales
  });
}

/**
 * Convierte un valor desconocido a un entero seguro.
 *
 * Ejemplo:
 *   toInt("42.8")   → 42
 *   toInt("abc")    → NaN
 *   toInt(undefined)→ NaN
 *
 * @param v - Valor genérico (string, number, etc.)
 * @returns Entero truncado si es numérico válido, o NaN si no lo es.
 */
export function toInt(v: unknown): number {
  const n = Number(v);
  // Retorna solo si el número es finito (no Infinity, no NaN).
  return Number.isFinite(n) ? Math.trunc(n) : NaN;
}
