/** Convierte una fecha ISO a formato DD/MM/AAAA HH:mm (Argentina) */
export function formatearFecha(fechaISO: string): string {
  const f = new Date(fechaISO);
  return f.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'America/Argentina/Buenos_Aires'
  });
}



/** Convierte true/false o string "Sí"/"No" en 'Sí' / 'No' para visualización */
export function booleanATexto(valor: boolean | string): string {
  if (typeof valor === 'boolean') {
    return valor ? 'Sí' : 'No';
  }
  if (typeof valor === 'string') {
    const v = valor.trim().toLowerCase();
    if (v === 'sí' || v === 'si') return 'Sí';
    if (v === 'no') return 'No';
  }
  // Si llega cualquier otra cosa (null, undefined, string vacío)
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
