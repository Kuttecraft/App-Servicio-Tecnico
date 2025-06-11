/** Convierte una fecha ISO a formato DD/MM/AAAA HH:mm (Argentina) */
export function formatearFecha(fechaISO: string): string {
  const f = new Date(fechaISO);
  return f.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Convierte true/false en 'Sí' / 'No' para visualización */
export function booleanATexto(valor: boolean): string {
  return valor ? 'Sí' : 'No';
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
