/**
 * server.mjs — Servidor de la App de Leyes SLEP
 * Sirve el frontend y provee API de búsqueda semántica.
 */

import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import OpenAI from "openai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Cargar datos ───────────────────────────────────────────────
console.log("📖 Cargando leyes_procesadas.json...");
const dataPath = path.join(__dirname, "leyes_procesadas.json");
const rawData = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
console.log(`✅ ${rawData.articulos.length} artículos cargados`);

// Separar por ley (sin embeddings para el frontend, son muy pesados)
const articulosSinEmbedding = rawData.articulos.map(({ embedding, ...rest }) => rest);
const embeddingsPorId = new Map(rawData.articulos.map((a) => [a.id, a.embedding]));

// ─── OpenAI para búsqueda semántica ────────────────────────────
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
let openai = null;
if (OPENAI_API_KEY) {
  openai = new OpenAI({ apiKey: OPENAI_API_KEY });
  console.log("🔑 OpenAI API configurada para búsqueda semántica");
} else {
  console.log("⚠️  Sin OPENAI_API_KEY: búsqueda semántica deshabilitada (solo búsqueda por texto)");
}

// ─── Utilidades ─────────────────────────────────────────────────

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ─── Middleware ─────────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ─── API: Obtener artículos por ley ─────────────────────────────
app.get("/api/articulos/:ley", (req, res) => {
  const ley = req.params.ley;
  const articulos = articulosSinEmbedding.filter((a) => a.ley === ley);
  res.json({
    ley,
    total: articulos.length,
    articulos,
  });
});

// ─── API: Obtener todos los artículos ───────────────────────────
app.get("/api/articulos", (req, res) => {
  res.json({
    metadata: rawData.metadata,
    total: articulosSinEmbedding.length,
    articulos: articulosSinEmbedding,
  });
});

// ─── API: Búsqueda semántica ────────────────────────────────────
app.post("/api/buscar", async (req, res) => {
  const { query, ley, limite = 10 } = req.body;

  if (!query || query.trim().length < 3) {
    return res.status(400).json({ error: "La consulta debe tener al menos 3 caracteres" });
  }

  // Filtrar artículos por ley si se especifica
  let articulosFiltrados = rawData.articulos;
  if (ley) {
    articulosFiltrados = articulosFiltrados.filter((a) => a.ley === ley);
  }

  // Si hay OpenAI, búsqueda semántica
  if (openai) {
    try {
      const embResp = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: query,
      });
      const queryEmbedding = embResp.data[0].embedding;

      const resultados = articulosFiltrados
        .map((art) => ({
          ...art,
          embedding: undefined,
          similitud: cosineSimilarity(queryEmbedding, embeddingsPorId.get(art.id)),
        }))
        .sort((a, b) => b.similitud - a.similitud)
        .slice(0, limite);

      return res.json({
        tipo: "semantica",
        query,
        total: resultados.length,
        resultados,
      });
    } catch (err) {
      console.error("Error en búsqueda semántica:", err.message);
      // Fallback a búsqueda por texto
    }
  }

  // Fallback: búsqueda por texto
  const queryLower = query.toLowerCase();
  const palabras = queryLower.split(/\s+/).filter((p) => p.length > 2);

  const resultados = articulosFiltrados
    .map((art) => {
      const textoLower = (art.texto_completo + " " + art.resumen_breve).toLowerCase();
      let score = 0;
      for (const p of palabras) {
        if (textoLower.includes(p)) score++;
      }
      return { ...art, embedding: undefined, similitud: score / palabras.length };
    })
    .filter((r) => r.similitud > 0)
    .sort((a, b) => b.similitud - a.similitud)
    .slice(0, limite);

  res.json({
    tipo: "texto",
    query,
    total: resultados.length,
    resultados,
  });
});

// ─── Iniciar servidor ───────────────────────────────────────────
app.listen(PORT, () => {
  console.log("");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  🏛️  App Leyes SLEP corriendo en: http://localhost:${PORT}`);
  console.log("═══════════════════════════════════════════════════════");
  console.log("");
});
