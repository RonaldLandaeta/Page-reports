/**
 * Búsqueda sobre el catálogo local. Son funciones puras que reciben la lista
 * como argumento: así los componentes de cliente las usan sin importar la
 * malla completa y el servidor las reutiliza con el catálogo oficial.
 */

/** Materia tal como la ven el formulario, el chatbot y la API. */
export interface Materia {
  /** Código único de la malla (ej. "FING-02002"). Es lo que viaja a la API. */
  codigo: string;
  /** NRC visible (nroCurso, ej. "02002"). Puede repetirse entre carreras. */
  nrc: string;
  nombre: string;
  horario: string;
}

export interface MateriaIndexada {
  materia: Materia;
  codigo: string;
  nrc: string;
  nombre: string;
  /** Texto normalizado "codigo nrc nombre" para búsquedas parciales. */
  texto: string;
}

export type ResolucionMateria =
  | { tipo: "unica"; materia: Materia }
  | { tipo: "ambigua"; opciones: Materia[] }
  | { tipo: "ninguna" };

/** Minúsculas, sin tildes y sin espacios sobrantes. */
export function normalizarTexto(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function indexarMaterias(lista: Materia[]): MateriaIndexada[] {
  return lista.map((materia) => {
    const codigo = normalizarTexto(materia.codigo);
    const nrc = normalizarTexto(materia.nrc);
    const nombre = normalizarTexto(materia.nombre);

    return {
      materia,
      codigo,
      nrc,
      nombre,
      texto: `${codigo} ${nrc} ${nombre}`,
    };
  });
}

/** Coincidencia exacta de código (único en toda la malla). */
export function encontrarPorCodigo(
  lista: Materia[],
  codigo: string,
): Materia | undefined {
  const buscado = normalizarTexto(codigo);
  if (!buscado) return undefined;

  return lista.find((materia) => normalizarTexto(materia.codigo) === buscado);
}

/** Todas las materias que comparten ese NRC (puede haber varias). */
export function encontrarPorNrc(lista: Materia[], nrc: string): Materia[] {
  const buscado = normalizarTexto(nrc);
  if (!buscado) return [];

  return lista.filter((materia) => normalizarTexto(materia.nrc) === buscado);
}

/**
 * Busca por código, NRC o nombre (parcial, sin tildes). Las coincidencias
 * exactas de código o NRC van primero. Sin consulta devuelve las primeras.
 */
export function filtrarMaterias(
  indice: MateriaIndexada[],
  consulta: string,
  limite: number,
): Materia[] {
  const q = normalizarTexto(consulta);
  const exactas: Materia[] = [];
  const parciales: Materia[] = [];

  for (const item of indice) {
    if (!q) {
      parciales.push(item.materia);
    } else if (item.codigo === q || item.nrc === q) {
      exactas.push(item.materia);
    } else if (item.texto.includes(q)) {
      parciales.push(item.materia);
    }
  }

  return [...exactas, ...parciales].slice(0, limite);
}

/**
 * Resuelve lo que escribió la persona a UNA materia, o avisa que es ambiguo.
 * Nunca elige al azar: un NRC repetido (02002 → FING y TELE) devuelve todas
 * las opciones para que la persona decida.
 */
export function resolverMateria(
  indice: MateriaIndexada[],
  consulta: string,
  limiteOpciones = 8,
): ResolucionMateria {
  const q = normalizarTexto(consulta);
  if (!q) return { tipo: "ninguna" };

  // 1. Código completo: único en la malla.
  const porCodigo = indice.filter((item) => item.codigo === q);
  if (porCodigo.length === 1) {
    return { tipo: "unica", materia: porCodigo[0].materia };
  }

  // 2. NRC exacto: una sola materia, o varias entre carreras.
  const porNrc = indice.filter((item) => item.nrc === q);
  if (porNrc.length === 1) return { tipo: "unica", materia: porNrc[0].materia };
  if (porNrc.length > 1) {
    return {
      tipo: "ambigua",
      opciones: porNrc.slice(0, limiteOpciones).map((item) => item.materia),
    };
  }

  // 3. Nombre completo exacto.
  const porNombre = indice.filter((item) => item.nombre === q);
  if (porNombre.length === 1) {
    return { tipo: "unica", materia: porNombre[0].materia };
  }

  // 4. Coincidencia parcial por código, NRC o nombre.
  const parciales = indice.filter((item) => item.texto.includes(q));
  if (parciales.length === 1) {
    return { tipo: "unica", materia: parciales[0].materia };
  }
  if (parciales.length > 1) {
    return {
      tipo: "ambigua",
      opciones: parciales.slice(0, limiteOpciones).map((item) => item.materia),
    };
  }

  return { tipo: "ninguna" };
}
