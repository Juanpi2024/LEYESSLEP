/**
 * procesar_leyes.js
 * ═══════════════════════════════════════════════════════════════
 * Script para procesar las Leyes 21.040 y 21.109 (PDFs) y generar
 * un archivo JSON estructurado con artículos, jerarquía, resúmenes
 * y embeddings vectoriales.
 *
 * Uso:
 *   set OPENAI_API_KEY=sk-proj-...
 *   node procesar_leyes.js
 *
 * Dependencias: pdfjs-dist, openai
 * ═══════════════════════════════════════════════════════════════
 */

const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");

// ─── Configuración ──────────────────────────────────────────────
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error("❌ Error: Define la variable de entorno OPENAI_API_KEY");
  console.error("   Ejemplo: set OPENAI_API_KEY=sk-proj-...");
  process.exit(1);
}

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

const PDF_FILES = [
  { path: path.join(__dirname, "Ley-21040_24-NOV-2017.pdf"), ley: "21.040" },
  { path: path.join(__dirname, "Ley-21109_02-OCT-2018.pdf"), ley: "21.109" },
];

const OUTPUT_FILE = path.join(__dirname, "leyes_procesadas.json");

const CHAT_MODEL = "gpt-4o-mini";
const EMBEDDING_MODEL = "text-embedding-3-small";

// ─── Funciones auxiliares ───────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Lee un PDF con pdfjs-dist y devuelve el texto completo.
 * Reconstruye líneas usando las posiciones Y de los items.
 */
async function leerPDF(filePath) {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

  const data = new Uint8Array(fs.readFileSync(filePath));
  const doc = await pdfjsLib.getDocument({ data }).promise;

  let textoCompleto = "";

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();

    // Agrupar items por posición Y para reconstruir líneas
    let lastY = null;
    let lineText = "";

    for (const item of content.items) {
      if (item.str === undefined) continue;

      const y = item.transform ? item.transform[5] : null;

      if (lastY !== null && y !== null && Math.abs(y - lastY) > 2) {
        // Nueva línea
        textoCompleto += lineText.trimEnd() + "\n";
        lineText = "";
      }

      lineText += item.str;
      lastY = y;
    }

    // Última línea de la página
    if (lineText.trim()) {
      textoCompleto += lineText.trimEnd() + "\n";
    }

    textoCompleto += "\n"; // Separador entre páginas
  }

  return textoCompleto;
}

/**
 * Divide texto en chunks respetando saltos de línea
 */
function dividirTexto(texto, maxChars = 12000) {
  const chunks = [];
  let inicio = 0;
  while (inicio < texto.length) {
    let fin = Math.min(inicio + maxChars, texto.length);
    if (fin < texto.length) {
      const ultimoSalto = texto.lastIndexOf("\n", fin);
      if (ultimoSalto > inicio) {
        fin = ultimoSalto + 1;
      }
    }
    chunks.push(texto.slice(inicio, fin));
    inicio = fin;
  }
  return chunks;
}

/**
 * Usa GPT-4o-mini para extraer artículos de un chunk de texto legal.
 */
async function extraerArticulosConGPT(chunk, leyNumero, chunkIndex, totalChunks) {
  const systemPrompt = `Eres un asistente jurídico experto en legislación educativa chilena. Tu tarea es analizar texto extraído de un PDF de la Ley ${leyNumero} y extraer TODOS los artículos que encuentres en este fragmento.

REGLAS CRÍTICAS:
1. PRESERVA EL TEXTO COMPLETO de cada artículo, palabra por palabra, incluyendo incisos, letras (a, b, c...), numerales y cualquier sub-estructura. NO OMITAS NI MODIFIQUES NADA.
2. Identifica la jerarquía: a qué Título y Párrafo pertenece cada artículo según el contexto.
3. Detecta si es "Transitorio" (artículos bajo "ARTÍCULOS TRANSITORIOS" o "DISPOSICIONES TRANSITORIAS").
4. Genera un resumen_breve de máximo 2 oraciones que capture la esencia del artículo.
5. Los artículos comienzan con patrones como "Artículo 1.-", "Artículo 2°.-", "Artículo primero.-", etc.

FORMATO DE RESPUESTA (JSON estricto):
{
  "articulos": [
    {
      "numero_articulo": "1",
      "titulo": "Título I" | null,
      "parrafo": "Párrafo 1°" | null,
      "es_transitorio": false,
      "texto_completo": "Artículo 1.- El texto completo...",
      "resumen_breve": "Resumen corto."
    }
  ]
}

Si no encuentras artículos, responde: {"articulos": []}`;

  const userPrompt = `Fragmento ${chunkIndex + 1} de ${totalChunks} de la Ley ${leyNumero}:

---
${chunk}
---

Extrae todos los artículos de este fragmento. Recuerda: TEXTO COMPLETO sin omitir nada.`;

  let intentos = 0;
  const maxIntentos = 3;

  while (intentos < maxIntentos) {
    try {
      const response = await openai.chat.completions.create({
        model: CHAT_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.05,
        max_tokens: 16000,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0].message.content.trim();
      const parsed = JSON.parse(content);

      // Normalizar: buscar el array de artículos
      if (Array.isArray(parsed)) return parsed;
      if (parsed.articulos && Array.isArray(parsed.articulos)) return parsed.articulos;

      const keys = Object.keys(parsed);
      const arrayKey = keys.find((k) => Array.isArray(parsed[k]));
      if (arrayKey) return parsed[arrayKey];

      return [];
    } catch (error) {
      intentos++;
      console.log(`  ⚠️  Error en chunk ${chunkIndex + 1}, intento ${intentos}/${maxIntentos}: ${error.message}`);
      if (intentos < maxIntentos) {
        await sleep(3000 * intentos);
      }
    }
  }

  console.log(`  ❌ Falló la extracción del chunk ${chunkIndex + 1} tras ${maxIntentos} intentos`);
  return [];
}

/**
 * Genera un embedding para un texto
 */
async function generarEmbedding(texto) {
  const textoTruncado = texto.slice(0, 30000);
  let intentos = 0;
  const maxIntentos = 3;

  while (intentos < maxIntentos) {
    try {
      const response = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: textoTruncado,
      });
      return response.data[0].embedding;
    } catch (error) {
      intentos++;
      console.log(`    ⚠️  Error embedding, intento ${intentos}/${maxIntentos}: ${error.message}`);
      if (intentos < maxIntentos) await sleep(2000 * intentos);
    }
  }
  return [];
}

/**
 * Deduplicar artículos por número, conservando el más completo
 */
function deduplicarArticulos(articulos) {
  const mapa = new Map();
  for (const art of articulos) {
    const clave = `${art.numero_articulo}_${art.es_transitorio ? "T" : "P"}`;
    if (!mapa.has(clave)) {
      mapa.set(clave, art);
    } else {
      const existente = mapa.get(clave);
      if ((art.texto_completo || "").length > (existente.texto_completo || "").length) {
        mapa.set(clave, art);
      }
    }
  }
  return Array.from(mapa.values());
}

// ─── Función principal ──────────────────────────────────────────
async function main() {
  console.log("");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  📜 Procesador de Leyes SLEP — Leyes 21.040 y 21.109");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("");

  const resultadoFinal = [];
  let idGlobal = 1;

  for (const pdfInfo of PDF_FILES) {
    console.log(`📄 Procesando Ley ${pdfInfo.ley}: ${path.basename(pdfInfo.path)}`);
    console.log("─".repeat(55));

    // 1. Leer PDF
    console.log("  📖 Leyendo PDF...");
    let textoCompleto;
    try {
      textoCompleto = await leerPDF(pdfInfo.path);
    } catch (error) {
      console.log(`  ❌ Error leyendo PDF: ${error.message}`);
      continue;
    }
    console.log(`  ✅ PDF leído: ${textoCompleto.length.toLocaleString()} caracteres, OK`);

    // 2. Dividir en chunks
    const chunks = dividirTexto(textoCompleto, 10000);
    console.log(`  📦 Dividido en ${chunks.length} fragmentos`);

    // 3. Extraer artículos con GPT
    console.log(`  🤖 Extrayendo artículos con ${CHAT_MODEL}...`);
    let todosLosArticulos = [];

    for (let i = 0; i < chunks.length; i++) {
      console.log(`    → Fragmento ${i + 1}/${chunks.length}...`);
      const articulos = await extraerArticulosConGPT(chunks[i], pdfInfo.ley, i, chunks.length);
      console.log(`      ✓ Encontrados: ${articulos.length} artículos`);
      todosLosArticulos.push(...articulos);

      // Rate limiting entre chunks
      if (i < chunks.length - 1) {
        await sleep(1000);
      }
    }

    // 4. Deduplicar
    const articulosUnicos = deduplicarArticulos(todosLosArticulos);
    console.log(`  🔄 Artículos únicos tras deduplicación: ${articulosUnicos.length}`);

    // 5. Generar embeddings
    console.log(`  🧮 Generando embeddings con ${EMBEDDING_MODEL}...`);

    for (let i = 0; i < articulosUnicos.length; i++) {
      const art = articulosUnicos[i];
      const textoParaEmbedding = `Ley ${pdfInfo.ley} - Artículo ${art.numero_articulo}: ${art.texto_completo}`;

      console.log(`    → Embedding ${i + 1}/${articulosUnicos.length} (Art. ${art.numero_articulo})`);
      const embedding = await generarEmbedding(textoParaEmbedding);

      resultadoFinal.push({
        id: idGlobal++,
        ley: pdfInfo.ley,
        numero_articulo: art.numero_articulo,
        titulo: art.titulo || null,
        parrafo: art.parrafo || null,
        es_transitorio: art.es_transitorio || false,
        texto_completo: art.texto_completo,
        resumen_breve: art.resumen_breve,
        embedding: embedding,
      });

      // Rate limiting entre embeddings
      if (i < articulosUnicos.length - 1) {
        await sleep(200);
      }
    }

    console.log(`  ✅ Ley ${pdfInfo.ley} completada: ${articulosUnicos.length} artículos\n`);
  }

  // 6. Guardar resultado
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  💾 Guardando ${resultadoFinal.length} artículos en ${path.basename(OUTPUT_FILE)}...`);

  const salida = {
    metadata: {
      generado_el: new Date().toISOString(),
      modelo_analisis: CHAT_MODEL,
      modelo_embeddings: EMBEDDING_MODEL,
      dimension_embeddings: resultadoFinal[0]?.embedding?.length || 0,
      total_articulos: resultadoFinal.length,
      leyes: PDF_FILES.map((p) => p.ley),
      nota: "Texto completo preservado íntegramente para consulta oficial de profesionales de educación.",
    },
    articulos: resultadoFinal,
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(salida, null, 2), "utf-8");

  console.log("  ✅ Archivo guardado correctamente");
  console.log("═══════════════════════════════════════════════════════════");

  // Resumen
  console.log("");
  console.log("📊 RESUMEN FINAL:");
  const porLey = {};
  let transitorios = 0;
  for (const art of resultadoFinal) {
    porLey[art.ley] = (porLey[art.ley] || 0) + 1;
    if (art.es_transitorio) transitorios++;
  }
  for (const [ley, count] of Object.entries(porLey)) {
    console.log(`   Ley ${ley}: ${count} artículos`);
  }
  console.log(`   Artículos transitorios: ${transitorios}`);
  console.log(`   Total general: ${resultadoFinal.length} artículos`);
  console.log(`   Dimensión embeddings: ${salida.metadata.dimension_embeddings}`);
  console.log(`   Archivo: ${OUTPUT_FILE}`);
  console.log("");
  console.log("✨ ¡Proceso completado exitosamente!");
  console.log("");
}

// ─── Ejecutar ───────────────────────────────────────────────────
main().catch((error) => {
  console.error("\n❌ Error fatal:", error.message);
  console.error(error.stack);
  process.exit(1);
});
