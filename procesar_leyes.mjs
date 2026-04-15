/**
 * procesar_leyes.mjs — v3 con log a archivo
 * ═══════════════════════════════════════════════════════════════
 * Extrae artículos de Leyes 21.040 y 21.109, genera embeddings.
 * Escribe logs a procesar_log.txt para depuración.
 * ═══════════════════════════════════════════════════════════════
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import OpenAI from "openai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Log a archivo y consola
const LOG_FILE = path.join(__dirname, "procesar_log.txt");
fs.writeFileSync(LOG_FILE, `=== Inicio: ${new Date().toISOString()} ===\n`);

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  fs.appendFileSync(LOG_FILE, line + "\n");
  console.log(msg);
}

// ─── Configuración ──────────────────────────────────────────────
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  log("❌ Error: Define OPENAI_API_KEY");
  process.exit(1);
}

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const CHAT_MODEL = "gpt-4o-mini";
const EMBEDDING_MODEL = "text-embedding-3-small";
const OUTPUT_FILE = path.join(__dirname, "leyes_procesadas.json");

const PDF_FILES = [
  { ruta: path.join(__dirname, "Ley-21040_24-NOV-2017.pdf"), ley: "21.040" },
  { ruta: path.join(__dirname, "Ley-21109_02-OCT-2018.pdf"), ley: "21.109" },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Lectura de PDF ─────────────────────────────────────────────

async function leerPDF(filePath) {
  const data = new Uint8Array(fs.readFileSync(filePath));
  const doc = await getDocument({ data }).promise;
  let textoCompleto = "";

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    let lastY = null;
    let lineText = "";

    for (const item of content.items) {
      if (item.str === undefined) continue;
      const y = item.transform ? item.transform[5] : null;
      if (lastY !== null && y !== null && Math.abs(y - lastY) > 2) {
        textoCompleto += lineText.trimEnd() + "\n";
        lineText = "";
      }
      lineText += item.str;
      lastY = y;
    }
    if (lineText.trim()) textoCompleto += lineText.trimEnd() + "\n";
    textoCompleto += "\n";
  }
  return textoCompleto;
}

// ─── Chunks ─────────────────────────────────────────────────────

function dividirTexto(texto, maxChars = 10000) {
  const chunks = [];
  let inicio = 0;
  while (inicio < texto.length) {
    let fin = Math.min(inicio + maxChars, texto.length);
    if (fin < texto.length) {
      const s = texto.lastIndexOf("\n", fin);
      if (s > inicio) fin = s + 1;
    }
    chunks.push(texto.slice(inicio, fin));
    inicio = fin;
  }
  return chunks;
}

// ─── GPT Extracción ─────────────────────────────────────────────

async function extraerArticulosConGPT(chunk, leyNumero, idx, total) {
  const systemPrompt = `Eres un asistente jurídico experto en legislación educativa chilena. Analiza texto de la Ley ${leyNumero} y extrae TODOS los artículos.

REGLAS CRÍTICAS:
1. PRESERVA EL TEXTO COMPLETO de cada artículo palabra por palabra. Incluye incisos, letras, numerales y toda sub-estructura. NO OMITAS NI MODIFIQUES NADA.
2. Identifica Título y Párrafo según el contexto del documento.
3. Detecta si es "Transitorio" (bajo "ARTÍCULOS TRANSITORIOS" o "DISPOSICIONES TRANSITORIAS").
4. Genera resumen_breve de máximo 2 oraciones.
5. Los artículos comienzan con "Artículo N.-", "Artículo N°.-", "Artículo primero", etc.

Responde SOLO con JSON:
{"articulos": [{"numero_articulo":"1","titulo":"Título I","parrafo":null,"es_transitorio":false,"texto_completo":"Artículo 1.- ...","resumen_breve":"..."}]}

Si no hay artículos: {"articulos": []}`;

  for (let intento = 1; intento <= 3; intento++) {
    try {
      const resp = await openai.chat.completions.create({
        model: CHAT_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Fragmento ${idx + 1}/${total} de Ley ${leyNumero}:\n\n${chunk}\n\nExtrae TODOS los artículos con texto COMPLETO.` },
        ],
        temperature: 0.05,
        max_tokens: 16000,
        response_format: { type: "json_object" },
      });

      const parsed = JSON.parse(resp.choices[0].message.content);
      if (Array.isArray(parsed)) return parsed;
      if (parsed.articulos && Array.isArray(parsed.articulos)) return parsed.articulos;
      const arrKey = Object.keys(parsed).find((k) => Array.isArray(parsed[k]));
      return arrKey ? parsed[arrKey] : [];
    } catch (err) {
      log(`  ⚠️  Chunk ${idx + 1} intento ${intento}/3: ${err.message}`);
      if (intento < 3) await sleep(3000 * intento);
    }
  }
  return [];
}

// ─── Embeddings ─────────────────────────────────────────────────

async function generarEmbedding(texto) {
  for (let i = 1; i <= 3; i++) {
    try {
      const resp = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: texto.slice(0, 30000),
      });
      return resp.data[0].embedding;
    } catch (err) {
      log(`    ⚠️  Embedding intento ${i}/3: ${err.message}`);
      if (i < 3) await sleep(2000 * i);
    }
  }
  return [];
}

// ─── Deduplicación ──────────────────────────────────────────────

function deduplicar(articulos) {
  const mapa = new Map();
  for (const a of articulos) {
    const key = `${a.numero_articulo}_${a.es_transitorio ? "T" : "P"}`;
    const ex = mapa.get(key);
    if (!ex || (a.texto_completo || "").length > (ex.texto_completo || "").length) {
      mapa.set(key, a);
    }
  }
  return [...mapa.values()];
}

// ─── MAIN ───────────────────────────────────────────────────────

try {
  log("═══════════════════════════════════════════════════════════");
  log("  📜 Procesador de Leyes SLEP — v3");
  log("═══════════════════════════════════════════════════════════");

  const resultados = [];
  let idGlobal = 1;

  for (const pdfInfo of PDF_FILES) {
    log(`📄 Ley ${pdfInfo.ley}: ${path.basename(pdfInfo.ruta)}`);

    log("  📖 Leyendo PDF...");
    let texto;
    try {
      texto = await leerPDF(pdfInfo.ruta);
    } catch (err) {
      log(`  ❌ Error PDF: ${err.message}`);
      continue;
    }
    log(`  ✅ ${texto.length.toLocaleString()} caracteres`);

    const chunks = dividirTexto(texto, 10000);
    log(`  📦 ${chunks.length} fragmentos`);

    log(`  🤖 Extrayendo artículos...`);
    let todos = [];
    for (let i = 0; i < chunks.length; i++) {
      log(`    → Fragmento ${i + 1}/${chunks.length}`);
      const arts = await extraerArticulosConGPT(chunks[i], pdfInfo.ley, i, chunks.length);
      log(`      ✓ ${arts.length} artículos encontrados`);
      todos.push(...arts);
      if (i < chunks.length - 1) await sleep(1000);
    }

    const unicos = deduplicar(todos);
    log(`  🔄 ${unicos.length} artículos únicos`);

    log(`  🧮 Generando ${unicos.length} embeddings...`);
    for (let i = 0; i < unicos.length; i++) {
      const a = unicos[i];
      if (i % 10 === 0 || i === unicos.length - 1) {
        log(`    → Embedding ${i + 1}/${unicos.length}`);
      }
      const emb = await generarEmbedding(
        `Ley ${pdfInfo.ley} - Artículo ${a.numero_articulo}: ${a.texto_completo}`
      );
      resultados.push({
        id: idGlobal++,
        ley: pdfInfo.ley,
        numero_articulo: a.numero_articulo,
        titulo: a.titulo || null,
        parrafo: a.parrafo || null,
        es_transitorio: a.es_transitorio || false,
        texto_completo: a.texto_completo,
        resumen_breve: a.resumen_breve,
        embedding: emb,
      });
      if (i < unicos.length - 1) await sleep(200);
    }

    log(`  ✅ Ley ${pdfInfo.ley}: ${unicos.length} artículos OK`);
  }

  // Guardar
  log(`💾 Guardando ${resultados.length} artículos...`);

  const salida = {
    metadata: {
      generado_el: new Date().toISOString(),
      modelo_analisis: CHAT_MODEL,
      modelo_embeddings: EMBEDDING_MODEL,
      dimension_embeddings: resultados[0]?.embedding?.length || 0,
      total_articulos: resultados.length,
      leyes: PDF_FILES.map((p) => p.ley),
      nota: "Texto completo preservado íntegramente para consulta oficial de profesionales de educación.",
    },
    articulos: resultados,
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(salida, null, 2), "utf-8");

  log("✅ Archivo guardado: " + OUTPUT_FILE);

  // Resumen
  const porLey = {};
  let trans = 0;
  for (const a of resultados) {
    porLey[a.ley] = (porLey[a.ley] || 0) + 1;
    if (a.es_transitorio) trans++;
  }
  log("📊 RESUMEN:");
  for (const [ley, n] of Object.entries(porLey)) log(`   Ley ${ley}: ${n} artículos`);
  log(`   Transitorios: ${trans}`);
  log(`   Total: ${resultados.length}`);
  log(`   Dimensión: ${salida.metadata.dimension_embeddings}`);
  log("✨ ¡Completado!");

} catch (err) {
  log(`❌ Error fatal: ${err.message}`);
  log(err.stack);
  process.exit(1);
}
