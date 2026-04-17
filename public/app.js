/**
 * app.js — Frontend de la App de Leyes SLEP
 * Maneja navegación, carga de artículos, búsqueda y modal
 */

// ─── Estado Global ──────────────────────────────────────────────
let datosLeyes = {};         // { "21.040": [...], "21.109": [...] }
let leyActual = null;
let articulosTodos = [];

const NOMBRES_LEY = {
  "21.040": "Sistema de Educación Pública",
  "21.109": "Estatuto Asistentes de la Educación",
  "Convivencia Escolar / 21.128": "Nueva Ley de Convivencia Escolar (21.809)",
};

// ─── Inicialización ─────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  crearParticulas();
  cargarDatos();

  // Enter en búsqueda global
  document.getElementById("busqueda-global-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") buscarGlobal();
  });

  // Enter en búsqueda de ley
  document.getElementById("busqueda-ley-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") buscarEnLey();
  });

  // Enter en refinar búsqueda
  document.getElementById("busqueda-refinar-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") refinarBusqueda();
  });

  // Escape cierra modal
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") cerrarModal();
  });
});

// ─── Partículas decorativas ─────────────────────────────────────
function crearParticulas() {
  const container = document.getElementById("particulas");
  for (let i = 0; i < 30; i++) {
    const p = document.createElement("div");
    p.className = "particula";
    p.style.left = Math.random() * 100 + "%";
    p.style.animationDelay = Math.random() * 8 + "s";
    p.style.animationDuration = 6 + Math.random() * 6 + "s";
    container.appendChild(p);
  }
}

// ─── Cargar datos desde API ─────────────────────────────────────
async function cargarDatos() {
  try {
    const resp = await fetch("/api/articulos");
    const data = await resp.json();
    articulosTodos = data.articulos;

    // Separar por ley
    datosLeyes["21.040"] = data.articulos.filter((a) => a.ley === "21.040");
    datosLeyes["21.109"] = data.articulos.filter((a) => a.ley === "21.109");
    datosLeyes["Convivencia Escolar / 21.128"] = data.articulos.filter((a) => a.ley === "Convivencia Escolar / 21.128");

    // Actualizar stats en cards
    actualizarStats("21.040");
    actualizarStats("21.109");
    actualizarStats("Convivencia Escolar / 21.128");
  } catch (err) {
    console.error("Error cargando datos:", err);
  }
}

function actualizarStats(ley) {
  const arts = datosLeyes[ley] || [];
  const trans = arts.filter((a) => a.es_transitorio).length;
  const permanentes = arts.length - trans;

  const leyKey = ley.replace(/[^A-Za-z0-9]/g, "");
  const elArts = document.getElementById(`stat-${leyKey}-arts`);
  const elTrans = document.getElementById(`stat-${leyKey}-trans`);

  if (elArts) animateNumber(elArts, permanentes);
  if (elTrans) animateNumber(elTrans, trans);
}

function animateNumber(el, target) {
  let current = 0;
  const duration = 800;
  const step = target / (duration / 16);
  const timer = setInterval(() => {
    current += step;
    if (current >= target) {
      el.textContent = target;
      clearInterval(timer);
    } else {
      el.textContent = Math.floor(current);
    }
  }, 16);
}

// ─── Navegación entre pantallas ─────────────────────────────────
function mostrarPantalla(id) {
  document.querySelectorAll(".pantalla").forEach((p) => p.classList.remove("activa"));
  document.getElementById(id).classList.add("activa");
  window.scrollTo(0, 0);
}

function volverInicio() {
  mostrarPantalla("pantalla-inicio");
  leyActual = null;
}

// ─── Abrir una ley ──────────────────────────────────────────────
function abrirLey(ley) {
  leyActual = ley;

  // Actualizar navbar
  document.getElementById("nav-ley-badge").textContent = `Ley N° ${ley}`;
  document.getElementById("nav-ley-nombre").textContent = NOMBRES_LEY[ley];

  // Construir sidebar y contenido
  const articulos = datosLeyes[ley] || [];
  construirSidebar(articulos);

  // Mostrar todos por defecto
  renderizarArticulos(articulos, "Todos los artículos");

  mostrarPantalla("pantalla-ley");
}

// ─── Sidebar e Índice Navigational ─────────────────────────────
function construirSidebar(articulos) {
  const container = document.getElementById("sidebar-tabs");
  container.innerHTML = "";

  const estructura = organizarPorTitulo(articulos);

  // Función interna para crear grupo de índice
  const crearGrupoIndice = (titulo, arts) => {
    const grupo = document.createElement("div");
    grupo.className = "indice-grupo";
    
    const header = document.createElement("div");
    header.className = "indice-grupo-header";
    header.innerHTML = `<span>${titulo}</span> <span class="tab-count">${arts.length}</span>`;
    
    // Expand/collapse logic
    header.onclick = () => {
      lista.classList.toggle("colapsado");
      header.classList.toggle("abierto");
    };
    
    const lista = document.createElement("div");
    lista.className = "indice-grupo-lista";
    
    arts.forEach(art => {
      const item = document.createElement("div");
      item.className = "sidebar-indice-item";
      let desc = art.resumen_breve || "";
      if (desc.length > 50) desc = desc.substring(0, 48) + "…";
      
      item.innerHTML = `
        <div class="indice-num">Art. ${art.numero_articulo}</div>
        <div class="indice-desc">${desc}</div>
      `;
      
      item.onclick = (e) => {
        e.stopPropagation();
        document.querySelectorAll(".sidebar-indice-item").forEach(el => el.classList.remove("activo"));
        item.classList.add("activo");
        
        const cardEl = document.getElementById(`articulo-card-${art.id}`);
        if (cardEl) {
          cardEl.scrollIntoView({ behavior: "smooth", block: "start" });
          cardEl.classList.add("highlight");
          setTimeout(() => cardEl.classList.remove("highlight"), 1500);
        }
      };
      lista.appendChild(item);
    });

    grupo.appendChild(header);
    grupo.appendChild(lista);
    return grupo;
  };

  // Agregar grupos al sidebar
  for (const [titulo, arts] of Object.entries(estructura.titulos)) {
    container.appendChild(crearGrupoIndice(titulo, arts));
  }
  if (estructura.transitorios.length > 0) {
    container.appendChild(crearGrupoIndice("Artículos Transitorios", estructura.transitorios));
  }
  if (estructura.sinTitulo.length > 0) {
    container.appendChild(crearGrupoIndice("Otros Artículos", estructura.sinTitulo));
  }
}

function organizarPorTitulo(articulos) {
  const titulos = {};
  const transitorios = [];
  const sinTitulo = [];

  for (const art of articulos) {
    if (art.es_transitorio) {
      transitorios.push(art);
    } else if (art.titulo) {
      if (!titulos[art.titulo]) titulos[art.titulo] = [];
      titulos[art.titulo].push(art);
    } else {
      sinTitulo.push(art);
    }
  }

  return { titulos, transitorios, sinTitulo };
}

// ─── Renderizar artículos ───────────────────────────────────────
function renderizarArticulos(articulos, tituloSeccion) {
  const container = document.getElementById("contenido-principal");
  container.innerHTML = "";

  // Título de sección
  const h2 = document.createElement("h2");
  h2.className = "contenido-titulo-seccion";
  h2.textContent = tituloSeccion;
  container.appendChild(h2);

  if (articulos.length === 0) {
    container.innerHTML += `
      <div class="sin-resultados">
        <div class="sin-resultados-icon">📭</div>
        <h3>No hay artículos en esta sección</h3>
      </div>
    `;
    return;
  }

  // Agrupar por párrafo si existe
  let articulosAgrupados = agruparPorParrafo(articulos);

  for (const grupo of articulosAgrupados) {
    if (grupo.parrafo) {
      const pTitle = document.createElement("div");
      pTitle.className = "contenido-parrafo-titulo";
      pTitle.textContent = grupo.parrafo;
      container.appendChild(pTitle);
    }

    for (const art of grupo.articulos) {
      container.appendChild(crearArticuloCard(art));
    }
  }

  // Scroll al top del contenido
  container.scrollTo(0, 0);
}

function agruparPorParrafo(articulos) {
  const grupos = [];
  let currentParrafo = null;
  let currentGroup = null;

  for (const art of articulos) {
    const p = art.parrafo || null;
    if (p !== currentParrafo || currentGroup === null) {
      currentGroup = { parrafo: p, articulos: [] };
      grupos.push(currentGroup);
      currentParrafo = p;
    }
    currentGroup.articulos.push(art);
  }

  return grupos;
}

function crearArticuloCard(art) {
  const card = document.createElement("div");
  card.className = "articulo-card";
  card.id = `articulo-card-${art.id}`;
  card.onclick = () => abrirModal(art);

  let badgesHTML = "";
  if (art.es_transitorio) {
    badgesHTML += `<span class="badge badge-transitorio">Transitorio</span>`;
  }
  if (art.titulo) {
    badgesHTML += `<span class="badge badge-titulo">${art.titulo}</span>`;
  }
  if (art.parrafo) {
    badgesHTML += `<span class="badge badge-parrafo">${art.parrafo}</span>`;
  }

  const previewTexto = (art.texto_completo || "").substring(0, 250);

  card.innerHTML = `
    <div class="articulo-header">
      <span class="articulo-numero">Artículo ${art.numero_articulo}</span>
      <div class="articulo-badges">${badgesHTML}</div>
    </div>
    <div class="articulo-resumen">${art.resumen_breve || ""}</div>
    <div class="articulo-preview">${previewTexto}…</div>
    <span class="articulo-leer-mas">Leer artículo completo →</span>
  `;

  return card;
}

// ─── Modal ──────────────────────────────────────────────────────
function abrirModal(art) {
  const modal = document.getElementById("modal-overlay");
  const content = document.getElementById("modal-content");

  let badgesHTML = "";
  if (art.es_transitorio) badgesHTML += `<span class="badge badge-transitorio">Transitorio</span>`;
  if (art.titulo) badgesHTML += `<span class="badge badge-titulo">${art.titulo}</span>`;
  if (art.parrafo) badgesHTML += `<span class="badge badge-parrafo">${art.parrafo}</span>`;

  content.innerHTML = `
    <div class="modal-ley-badge">Ley N° ${art.ley} — ${NOMBRES_LEY[art.ley]}</div>
    <h2 class="modal-art-titulo">Artículo ${art.numero_articulo}</h2>
    <div class="modal-jerarquia">${badgesHTML}</div>
    
    <div class="modal-resumen">
      <div class="modal-resumen-label">📝 Resumen</div>
      <div class="modal-resumen-text">${art.resumen_breve || "Sin resumen disponible."}</div>
    </div>
    
    <div class="modal-texto-label">📜 Texto completo del artículo</div>
    <div class="modal-texto-completo">${art.texto_completo || "Texto no disponible."}</div>
  `;

  modal.classList.add("visible");
  document.body.style.overflow = "hidden";
}

function cerrarModal() {
  const modal = document.getElementById("modal-overlay");
  modal.classList.remove("visible");
  document.body.style.overflow = "";
}

// ─── Búsqueda ───────────────────────────────────────────────────
async function buscarGlobal() {
  const query = document.getElementById("busqueda-global-input").value.trim();
  if (!query || query.length < 3) return;
  await ejecutarBusqueda(query, null);
}

async function buscarEnLey() {
  const query = document.getElementById("busqueda-ley-input").value.trim();
  if (!query || query.length < 3) return;
  await ejecutarBusqueda(query, leyActual);
}

async function refinarBusqueda() {
  const query = document.getElementById("busqueda-refinar-input").value.trim();
  if (!query || query.length < 3) return;
  await ejecutarBusqueda(query, null);
}

async function ejecutarBusqueda(query, ley) {
  // Mostrar loading
  document.getElementById("loading-overlay").classList.add("visible");

  try {
    const resp = await fetch("/api/buscar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, ley, limite: 15 }),
    });

    const data = await resp.json();

    // Actualizar vista de búsqueda
    mostrarResultados(query, data);
  } catch (err) {
    console.error("Error en búsqueda:", err);
    alert("Error al buscar. Verifica que el servidor esté corriendo.");
  } finally {
    document.getElementById("loading-overlay").classList.remove("visible");
  }
}

function mostrarResultados(query, data) {
  const headerEl = document.getElementById("resultados-header");
  const listaEl = document.getElementById("resultados-lista");

  document.getElementById("busqueda-query-display").textContent = `"${query}"`;
  document.getElementById("busqueda-refinar-input").value = query;

  const tipoBusqueda = data.tipo === "semantica" ? "🧠 Búsqueda semántica (IA)" : "🔤 Búsqueda por texto";

  headerEl.innerHTML = `
    <h2>Resultados para "${query}"</h2>
    <p>${data.total} artículos encontrados · ${tipoBusqueda}</p>
  `;

  listaEl.innerHTML = "";

  if (data.resultados.length === 0) {
    listaEl.innerHTML = `
      <div class="sin-resultados">
        <div class="sin-resultados-icon">🔍</div>
        <h3>No se encontraron resultados</h3>
        <p>Intenta con otros términos o una pregunta diferente</p>
      </div>
    `;
  } else {
    for (const r of data.resultados) {
      const item = document.createElement("div");
      item.className = "resultado-item";
      item.onclick = () => abrirModal(r);

      const similitudPct = data.tipo === "semantica"
        ? `${(r.similitud * 100).toFixed(1)}% relevancia`
        : `${(r.similitud * 100).toFixed(0)}% coincidencia`;

      let badgesHTML = "";
      if (r.es_transitorio) badgesHTML += `<span class="badge badge-transitorio">Transitorio</span>`;
      if (r.titulo) badgesHTML += `<span class="badge badge-titulo">${r.titulo}</span>`;

      item.innerHTML = `
        <div class="resultado-meta">
          <span class="resultado-ley">Ley ${r.ley}</span>
          <span class="articulo-numero">Art. ${r.numero_articulo}</span>
          <span class="resultado-similitud">✦ ${similitudPct}</span>
          ${badgesHTML}
        </div>
        <div class="articulo-resumen">${r.resumen_breve || ""}</div>
        <div class="resultado-texto-completo">${(r.texto_completo || "").substring(0, 300)}…</div>
        <span class="articulo-leer-mas">Ver artículo completo →</span>
      `;

      listaEl.appendChild(item);
    }
  }

  mostrarPantalla("pantalla-busqueda");
}

// ─── Exponer funciones globales ─────────────────────────────────
window.abrirLey = abrirLey;
window.volverInicio = volverInicio;
window.buscarGlobal = buscarGlobal;
window.buscarEnLey = buscarEnLey;
window.refinarBusqueda = refinarBusqueda;
window.cerrarModal = cerrarModal;
