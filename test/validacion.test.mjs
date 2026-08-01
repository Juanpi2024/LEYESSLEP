import test from "node:test";
import assert from "node:assert/strict";
import { revisarRespuesta } from "../validacion.mjs";

test("acepta una orientación general sin datos específicos", () => {
  const { segura } = revisarRespuesta(
    "Orientación general: la Ley 21.109 es el estatuto principal de los asistentes de la educación."
  );
  assert.equal(segura, true);
});

test("acepta los artículos que sí están en la base verificada", () => {
  for (const texto of [
    "El artículo 3 de la Ley 21.109 remite supletoriamente al Código del Trabajo.",
    "Los artículos 49 a 58 de la Ley 21.040 regulan el Consejo Local.",
    "El artículo tercero establece la aplicación supletoria.",
  ]) {
    assert.equal(revisarRespuesta(texto).segura, true, texto);
  }
});

test("bloquea un artículo que la base verificada no respalda", () => {
  const { segura, motivos } = revisarRespuesta(
    "El artículo 27 de la Ley 21.109 te concede diez días de permiso."
  );
  assert.equal(segura, false);
  assert.ok(motivos.some((motivo) => motivo.includes("articulo no verificado: 27")));
});

test("distingue el artículo 49 del cuadragésimo noveno transitorio", () => {
  // Es exactamente la confusión que detectó la revisión legal del 30 de julio.
  const permanente = revisarRespuesta("El artículo 49 describe la función del Consejo Local.");
  const transitorio = revisarRespuesta(
    "El artículo cuadragésimo noveno transitorio regula la instalación del Consejo."
  );

  assert.equal(permanente.segura, true);
  assert.equal(transitorio.segura, false);
  assert.ok(transitorio.motivos.some((motivo) => motivo.includes("transitorio")));
});

test("bloquea montos, porcentajes y plazos inventados", () => {
  const casos = [
    ["Te corresponde un bono de $50.000.", "monto"],
    ["El aumento fue de 4,5 UF.", "monto"],
    ["Tienes derecho a un 30% de recargo.", "porcentaje"],
    ["El plazo para reclamar es de 30 días.", "plazo"],
    ["Debes presentarlo dentro de 6 meses.", "plazo"],
  ];

  for (const [texto, esperado] of casos) {
    const { segura, motivos } = revisarRespuesta(texto);
    assert.equal(segura, false, texto);
    assert.ok(motivos.some((motivo) => motivo.startsWith(esperado)), `${texto} -> ${motivos}`);
  }
});

test("no confunde la duración verificada del cargo con un plazo inventado", () => {
  const { segura } = revisarRespuesta("Los cargos del Consejo Local duran 3 años.");
  assert.equal(segura, true);
});

test("no confunde el número de una ley con un número de artículo", () => {
  const { segura } = revisarRespuesta(
    "La Ley 21.819 modificó la Ley 21.040 y la Ley 21.809 rige desde julio."
  );
  assert.equal(segura, true);
});
