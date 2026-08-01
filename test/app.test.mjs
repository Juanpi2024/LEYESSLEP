import test from "node:test";
import assert from "node:assert/strict";
import app from "../server.mjs";

async function withServer(run) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address();

  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

test("la portada identifica la guía y enlaza a las fuentes oficiales", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl);
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /Guía Normativa SLEP/);
    assert.match(html, /Información general, no asesoría jurídica/);
    assert.match(html, /idNorma=1111237/);
    assert.match(html, /idNorma=1123513/);
    assert.match(html, /idNorma=1224471/);
    assert.match(html, /Consulta tus dudas en lenguaje sencillo/);
    assert.match(html, /assistant\.js/);
    assert.doesNotMatch(html, /Búsqueda inteligente con IA/);
  });
});

test("los recursos de compatibilidad existen y fuerzan una URL actualizada", async () => {
  await withServer(async (baseUrl) => {
    const [scriptResponse, styleResponse] = await Promise.all([
      fetch(`${baseUrl}/app.js`),
      fetch(`${baseUrl}/styles.css`),
    ]);
    const script = await scriptResponse.text();

    assert.equal(scriptResponse.status, 200);
    assert.match(scriptResponse.headers.get("content-type"), /javascript/);
    assert.match(script, /actualizacion/);
    assert.equal(styleResponse.status, 200);
    assert.match(styleResponse.headers.get("content-type"), /css/);
  });
});

test("la API antigua queda retirada con una explicación segura", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/articulos`);
    const body = await response.json();

    assert.equal(response.status, 410);
    assert.match(body.mensaje, /LeyChile/);
  });
});

test("el asistente valida consultas y protege el servicio sin clave local", async () => {
  await withServer(async (baseUrl) => {
    const invalidResponse = await fetch(`${baseUrl}/api/consultar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pregunta: "no" }),
    });
    assert.equal(invalidResponse.status, 400);

    const unavailableResponse = await fetch(`${baseUrl}/api/consultar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pregunta: "¿Cuál es nuestro estatuto principal?" }),
    });
    assert.equal(unavailableResponse.status, 503);
  });
});

test("el estado informa la fecha y que no reproduce artículos", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/estado`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.revisado_el, "2026-07-30");
    assert.equal(body.reproduce_articulos, false);
  });
});
