// Red de seguridad sobre la salida del asistente.
//
// Las instrucciones del sistema prohiben inventar articulos, montos y plazos,
// pero una instruccion no es una garantia: el modelo puede desviarse igual.
// Este modulo revisa la respuesta ANTES de mostrarla y, ante cualquier dato
// que la base verificada no respalde, prefiere no responder y derivar a
// LeyChile. En campana, una captura del asistente afirmando un derecho que no
// existe es un dano que no se repara.

// Articulos que la base verificada de este asistente respalda:
// Ley 21.109 art. 3, Ley 21.040 arts. 49 a 58, Ley 21.819 arts. 50 y 51.
// Cualquier otro numero de articulo es, por definicion, no verificado.
const ARTICULOS_VERIFICADOS = new Set([3, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58]);

const ORDINALES_BASE = {
  primero: 1, segundo: 2, tercero: 3, cuarto: 4, quinto: 5,
  sexto: 6, septimo: 7, octavo: 8, noveno: 9, decimo: 10,
  undecimo: 11, duodecimo: 12,
  vigesimo: 20, trigesimo: 30, cuadragesimo: 40, quincuagesimo: 50,
};

const sinAcentos = (texto) =>
  texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// "cuadragesimo noveno" -> 49; "tercero" -> 3
const ordinalANumero = (expresion) => {
  const palabras = expresion.trim().split(/\s+/);
  let total = 0;
  for (const palabra of palabras) {
    const valor = ORDINALES_BASE[palabra];
    if (valor === undefined) return null;
    total += valor;
  }
  return total || null;
};

const PATRONES_DE_RIESGO = [
  // La base verificada no contiene ningun monto ni porcentaje.
  { nombre: "monto", regex: /\$\s?\d|\d+\s*(?:pesos|uf\b|utm\b)/i },
  { nombre: "porcentaje", regex: /\d+\s*%/ },
  // Tampoco contiene plazos. "tres anos" de duracion del cargo si esta
  // verificado, por eso no se revisan los anos.
  { nombre: "plazo", regex: /\d+\s*(?:d[ií]as?|meses|semanas?)\b/i },
];

/**
 * Revisa una respuesta del asistente.
 * @returns {{segura: boolean, motivos: string[]}}
 */
export const revisarRespuesta = (respuesta) => {
  const motivos = [];
  const texto = String(respuesta ?? "");
  const normalizado = sinAcentos(texto);

  const registrarArticulo = (numero, contexto) => {
    if (/transitori/.test(contexto)) {
      // La revision legal del 30 de julio detecto justamente esta confusion:
      // el articulo cuadragesimo noveno transitorio no es el articulo 49.
      motivos.push(`articulo transitorio no verificado: ${numero ?? "sin numero"}`);
      return;
    }
    if (numero === null || !ARTICULOS_VERIFICADOS.has(numero)) {
      motivos.push(`articulo no verificado: ${numero ?? "ilegible"}`);
    }
  };

  // Articulos escritos con numeros: "articulo 27", "articulos 49 a 58".
  const conNumeros = /articulos?\s+(\d{1,3})(?:\s*(?:a|al|y)\s*(\d{1,3}))?/g;
  for (const coincidencia of normalizado.matchAll(conNumeros)) {
    const contexto = normalizado.slice(coincidencia.index, coincidencia.index + coincidencia[0].length + 30);
    registrarArticulo(Number(coincidencia[1]), contexto);
    if (coincidencia[2]) registrarArticulo(Number(coincidencia[2]), contexto);
  }

  // Articulos escritos con palabras: "articulo tercero", "articulo
  // cuadragesimo noveno transitorio".
  const conPalabras = /articulos?\s+((?:[a-z]+)(?:\s+(?:primero|segundo|tercero|cuarto|quinto|sexto|septimo|octavo|noveno))?)/g;
  for (const coincidencia of normalizado.matchAll(conPalabras)) {
    const expresion = coincidencia[1];
    if (/^\d/.test(expresion)) continue; // ya cubierto arriba
    const primeraPalabra = expresion.split(/\s+/)[0];
    if (!(primeraPalabra in ORDINALES_BASE)) continue; // "articulo de", "articulo que"...
    const contexto = normalizado.slice(coincidencia.index, coincidencia.index + coincidencia[0].length + 30);
    registrarArticulo(ordinalANumero(expresion), contexto);
  }

  for (const { nombre, regex } of PATRONES_DE_RIESGO) {
    if (regex.test(texto)) motivos.push(`${nombre} sin respaldo en la base verificada`);
  }

  return { segura: motivos.length === 0, motivos: [...new Set(motivos)] };
};

export const RESPUESTA_DE_RESGUARDO = `Orientación general: no puedo confirmar ese dato con la base verificada de esta guía, y prefiero no arriesgar una cifra, un plazo o un artículo equivocado.

Esta guía solo orienta sobre el marco general: cuál es el estatuto principal de los asistentes de la educación, qué hace el Consejo Local y dónde está el texto vigente de cada norma.

Qué conviene revisar: el texto vigente de la norma en LeyChile y, si se trata de tu situación particular, la unidad jurídica del SLEP, tu organización gremial o la Dirección del Trabajo, según corresponda. Conserva siempre los antecedentes por escrito.

Fuente oficial sugerida: Ley 21.109 y Ley 21.040, en los enlaces a LeyChile disponibles en esta página.`;
