import test from "node:test";
import assert from "node:assert/strict";
import app, { setClienteAsistente, reiniciarLimites } from "../server.mjs";

// Cliente falso: los tests nunca deben llamar a la API real ni depender de
// que la maquina tenga (o no) OPENAI_API_KEY configurada.
const clienteFalso = (respuesta = "Orientación general: texto de prueba.") => ({
  responses: {
    create: async () => ({ output_text: respuesta }),
  },
});

const consultar = (baseUrl, pregunta, cabeceras = {}) =>
  fetch(`${baseUrl}/api/consultar`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...cabeceras },
    body: JSON.stringify({ pregunta }),
  });

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

test("el asistente rechaza consultas demasiado cortas", async () => {
  reiniciarLimites();
  setClienteAsistente(clienteFalso());

  await withServer(async (baseUrl) => {
    const response = await consultar(baseUrl, "no");
    assert.equal(response.status, 400);
  });
});

test("el asistente responde con aviso y fuentes cuando hay servicio", async () => {
  reiniciarLimites();
  setClienteAsistente(clienteFalso());

  await withServer(async (baseUrl) => {
    const response = await consultar(baseUrl, "¿Cuál es nuestro estatuto principal?");
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.match(body.respuesta, /Orientación general/);
    assert.match(body.aviso, /no constituye asesoría jurídica/);
    assert.ok(body.fuentes["Ley 21.109"]);
  });
});

test("el asistente avisa cuando no hay servicio configurado", async () => {
  reiniciarLimites();
  setClienteAsistente(null);

  await withServer(async (baseUrl) => {
    const response = await consultar(baseUrl, "¿Cuál es nuestro estatuto principal?");
    assert.equal(response.status, 503);
  });
});

test("el asistente descarta una respuesta con datos inventados", async () => {
  reiniciarLimites();
  setClienteAsistente(
    clienteFalso("Orientación general: el artículo 27 te concede un bono de $80.000 en 15 días.")
  );

  await withServer(async (baseUrl) => {
    const response = await consultar(baseUrl, "¿Tengo derecho a un bono?");
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.resguardo, true);
    assert.doesNotMatch(body.respuesta, /27|80\.000|15 días/);
    assert.match(body.respuesta, /no puedo confirmar ese dato/);
  });
});

test("el asistente corta las consultas seguidas desde una misma IP", async () => {
  reiniciarLimites();
  setClienteAsistente(clienteFalso());

  await withServer(async (baseUrl) => {
    const permitidas = [];
    for (let intento = 0; intento < 5; intento += 1) {
      const response = await consultar(baseUrl, "¿Qué hace el Consejo Local?");
      permitidas.push(response.status);
    }
    assert.deepEqual(permitidas, [200, 200, 200, 200, 200]);

    const bloqueada = await consultar(baseUrl, "¿Qué hace el Consejo Local?");
    const body = await bloqueada.json();

    assert.equal(bloqueada.status, 429);
    assert.match(body.error, /Espera un minuto/);
  });
});

test("el asistente solo atiende consultas desde la propia guía", async () => {
  reiniciarLimites();
  setClienteAsistente(clienteFalso());

  await withServer(async (baseUrl) => {
    const response = await consultar(baseUrl, "¿Cuál es nuestro estatuto principal?", {
      Origin: "https://sitio-que-copia-la-guia.example",
    });

    assert.equal(response.status, 403);
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
