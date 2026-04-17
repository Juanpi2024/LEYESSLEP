import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const mainDataPath = path.join(__dirname, "leyes_procesadas.json");
const newDataPath = path.join(__dirname, "ley_convivencia.json");

try {
  const mainData = JSON.parse(fs.readFileSync(mainDataPath, "utf-8"));
  const newData = JSON.parse(fs.readFileSync(newDataPath, "utf-8"));

  // Check if laws are already merged to avoid duplicates
  if (mainData.metadata.leyes.includes("Convivencia Escolar / 21.128")) {
    console.log("⚠️ La ley de convivencia ya fue combinada anteriormente.");
    process.exit(0);
  }

  // Update metadata
  mainData.metadata.leyes.push(...newData.metadata.leyes);
  mainData.metadata.total_articulos += newData.metadata.total_articulos;
  
  // Calculate max id in mainData to avoid ID collision
  let maxId = 0;
  for (const art of mainData.articulos) {
    if (art.id > maxId) maxId = art.id;
  }

  // Append items and adjust IDs
  for (const art of newData.articulos) {
    maxId++;
    art.id = maxId;
    mainData.articulos.push(art);
  }

  fs.writeFileSync(mainDataPath, JSON.stringify(mainData, null, 2), "utf-8");
  console.log(`✅ ¡Leyes combinadas con éxito! Total de artículos sumados a leyes_procesadas.json: ${mainData.articulos.length}`);
} catch (e) {
  console.error("❌ Error combinando las leyes:", e.message);
}
