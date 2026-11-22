// Componentes de interfaz compartidos por varios módulos (ver plan-diseno-unificado.md).

import { esc } from "./ui.js";
import { botonIcono, icono } from "./iconos.js";
import { normalizar, etiquetaSexo, edad } from "./catalogos.js";

const iniciales = u => u.nombre.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("");

/** Estado vacío: qué falta y cómo resolverlo. */
export const estadoVacio = (titulo, texto = "") => `<div class="empty"><b>${esc(titulo)}</b>${texto ? `<p>${esc(texto)}</p>` : ""}</div>`;

/**
 * Selector de usuaria con buscador. No muestra a nadie hasta escribir `minimo` letras; entonces salen
 * como máximo `max` tarjetas con un aviso «Mostrando 5 de N».
 * Opciones:
 *  - usuarias: lista donde buscar.
 *  - elegida: usuaria ya elegida al abrir (con `fija: true` no se puede cambiar).
 *  - persistente: true (por defecto) deja una tarjeta con la elegida y «Cambiar»; false solo avisa por onElegir y limpia el buscador.
 *  - minimo, max, etiqueta, placeholder, id (del campo de búsqueda).
 *  - campos(u): texto donde se busca (por defecto nombre y CURP).
 *  - detalle(u): texto de edad que se muestra (por defecto la edad de hoy).
 *  - sinResultados: texto cuando no hay coincidencias.
 *  - onElegir(u|null): se llama al elegir y al limpiar.
 * Devuelve { elegida() }.
 */
export function selectorUsuaria(caja, opc) {
  const { usuarias, persistente = true, minimo = 2, max = 5, etiqueta = "Usuaria", placeholder = "Buscar por nombre o CURP", id = "n-buscar", fija = false } = opc;
  const campos = opc.campos || (u => `${u.nombre} ${u.curp || ""}`);
  const detalle = opc.detalle || (u => (u.fnac ? `${edad(u.fnac)} años` : ""));
  const sinResultados = opc.sinResultados || "No hay coincidencias.";
  let elegida = opc.elegida || null;

  caja.innerHTML = `<label${fija ? "" : ` for="${id}"`}>${esc(etiqueta)}</label>
    ${fija ? "" : `<div class="buscar-fila"><input type="search" id="${id}" placeholder="${esc(placeholder)}" autocomplete="off">${persistente ? botonIcono("editar", "Cambiar", { id: `${id}-cambiar`, clase: "quieto", extra: "hidden" }) : ""}</div>`}
    <div class="sel-zona"></div>`;
  const zona = caja.querySelector(".sel-zona"), entrada = caja.querySelector(`#${id}`), cambiar = caja.querySelector(`#${id}-cambiar`);

  const pintarElegida = () => {
    zona.innerHTML = `<div class="elegida"><span class="avatar grande" aria-hidden="true">${esc(iniciales(elegida))}</span>
      <span class="body"><span class="name">${esc(elegida.nombre)}</span><span class="mono">${esc(elegida.curp || "Sin CURP")}</span><span class="edad">${esc(detalle(elegida) || "Edad no registrada")}</span></span></div>`;
    if (cambiar) cambiar.hidden = false;
  };
  const sugerir = () => {
    const texto = normalizar(entrada.value).trim();
    if (texto.length < minimo) { zona.innerHTML = persistente ? `<p class="hint">Aún no se muestra ninguna usuaria.</p>` : ""; return; }
    const q = texto.split(/\s+/);
    const hallados = usuarias.filter(u => q.every(w => normalizar(campos(u)).includes(w)));
    zona.innerHTML = hallados.length
      ? `<div class="list">${hallados.slice(0, max).map(u => `<a class="row" href="#" data-id="${esc(u.id)}"><span class="body"><span class="name">${esc(u.nombre)}</span><span class="meta"><span class="mono">${esc(u.curp || "Sin CURP")}</span><span>${esc(detalle(u))}</span><span>${esc(etiquetaSexo(u.sexo))}</span></span></span></a>`).join("")}</div>
        <p class="hint">${hallados.length > max ? `Mostrando ${max} de ${hallados.length}; siga escribiendo para acotar.` : hallados.length === 1 ? "1 coincidencia. Tóquela para elegirla." : `${hallados.length} coincidencias. Toque una para elegirla.`}</p>`
      : `<p class="hint">${esc(sinResultados)}</p>`;
  };

  if (entrada) {
    entrada.addEventListener("input", () => {
      if (persistente && elegida) { elegida = null; opc.onElegir?.(null); }
      if (cambiar) cambiar.hidden = true;
      sugerir();
    });
    zona.addEventListener("click", ev => {
      const fila = ev.target.closest("[data-id]");
      if (!fila) return;
      ev.preventDefault();
      const u = usuarias.find(x => x.id === fila.dataset.id);
      entrada.value = "";
      if (persistente) { elegida = u; pintarElegida(); } else zona.innerHTML = "";
      opc.onElegir?.(u);
    });
    cambiar?.addEventListener("click", () => { elegida = null; entrada.value = ""; cambiar.hidden = true; opc.onElegir?.(null); sugerir(); entrada.focus(); });
  }
  if (elegida) pintarElegida(); else sugerir();
  return { elegida: () => elegida };
}

/** Botón «Filtros» con un contador de filtros activos. Va en la barra de búsqueda; el panel `.filters#filtros` se pliega con `conectarFiltros`. */
export const botonFiltros = () => `<span class="ib-badge"><button type="button" class="ib" id="verFiltros" aria-expanded="false" aria-controls="filtros" aria-label="Filtros" title="Filtros">${icono("filtros")}<span class="ib-et">Filtros</span></button><b id="nFiltros" hidden></b></span>`;

/** Conecta el botón «Filtros» con el panel plegable. Devuelve { contar(n) } para actualizar el contador. */
export function conectarFiltros(raiz) {
  const boton = raiz.querySelector("#verFiltros"), caja = raiz.querySelector("#filtros"), marca = raiz.querySelector("#nFiltros");
  boton?.addEventListener("click", () => {
    caja.hidden = !caja.hidden;
    boton.setAttribute("aria-expanded", String(!caja.hidden));
  });
  return {
    contar(n) {
      if (!boton) return;
      marca.textContent = n;
      marca.hidden = !n;
      boton.setAttribute("aria-label", n ? `Filtros: ${n === 1 ? "1 activo" : `${n} activos`}` : "Filtros");
    },
  };
}

/**
 * Calendario de mes (regla 5.2): una cuadrícula de 7 columnas con un punto en los días ocupados.
 * `opc`: { mes: "AAAA-MM", marcados: Set de "AAAA-MM-DD", elegido, hoy, onElegir(fecha) }.
 * Los días son botones con etiqueta completa para lectores de pantalla.
 */
export function calendarioMes(caja, { mes, marcados, elegido, hoy, onElegir }) {
  const [a, m] = mes.split("-").map(Number);
  const f = (d) => `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const vacios = (new Date(a, m - 1, 1).getDay() + 6) % 7;
  const dias = new Date(a, m, 0).getDate();
  const nombre = d => new Date(`${f(d)}T12:00`).toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
  const celdas = [
    ...Array.from({ length: vacios }, () => `<span class="cal-vacio" aria-hidden="true"></span>`),
    ...Array.from({ length: dias }, (_, i) => {
      const fecha = f(i + 1), ocupado = marcados.has(fecha);
      return `<button type="button" class="cal-dia${fecha === elegido ? " elegido" : ""}${fecha === hoy ? " hoy" : ""}${ocupado ? " ocupado" : ""}" data-fecha="${fecha}" aria-pressed="${fecha === elegido}" aria-label="${esc(nombre(i + 1))}${ocupado ? ", con citas" : ""}">${i + 1}</button>`;
    }),
  ];
  caja.innerHTML = `<div class="cal-mes" role="group" aria-label="Calendario del mes">${["L", "M", "M", "J", "V", "S", "D"].map(d => `<span class="cal-sem" aria-hidden="true">${d}</span>`).join("")}${celdas.join("")}</div>`;
  caja.querySelectorAll(".cal-dia").forEach(b => b.addEventListener("click", () => onElegir(b.dataset.fecha)));
}

/**
 * Línea de tiempo (regla 5.1): lo más reciente arriba. Cada punto lleva fecha, tipo (con icono y etiqueta) y una línea de texto.
 * `items`: [{ fecha (texto ya formateado), tipo, icono, clase, titulo, texto, href, id, acciones (HTML) }]. Con `href`, el título abre el detalle.
 */
export function lineaTiempo(items, { etiqueta = "Línea de tiempo" } = {}) {
  return `<ol class="linea" aria-label="${esc(etiqueta)}">${items.map(i => `
    <li class="linea-item"${i.id ? ` data-id="${esc(i.id)}"` : ""}>
      <span class="linea-punto" aria-hidden="true">${icono(i.icono || "agenda")}</span>
      <div class="linea-cuerpo">
        <div class="linea-cab"><b>${esc(i.fecha)}</b><span class="chip ${esc(i.clase || "")}">${esc(i.tipo)}</span></div>
        ${i.titulo ? `<div class="linea-titulo">${i.href ? `<a href="${esc(i.href)}">${esc(i.titulo)}</a>` : esc(i.titulo)}</div>` : ""}
        ${i.texto ? `<p class="nota-texto">${esc(i.texto)}</p>` : ""}
        ${i.acciones ? `<div class="icon-row">${i.acciones}</div>` : ""}
      </div>
    </li>`).join("")}</ol>`;
}

/**
 * Paginación de una lista ya dibujada. Funciona sobre el DOM: oculta las filas que no corresponden
 * a la página actual y respeta las que otro filtro ya ocultó con el atributo `hidden`.
 * Opciones:
 *  - selector: filas a paginar dentro de `raiz` (por defecto «.row»).
 *  - porPagina: filas por página (20 por defecto). Los controles solo aparecen si hay más.
 *  - dentro: true pone los controles al final de `raiz` (para contenedores que se redibujan);
 *    false (por defecto) los pone justo después.
 *  - singular, plural: nombre de lo que se lista, para el resumen («87 usuarias»).
 * Devuelve { refrescar(reiniciar = true) }: llámela después de cada filtro o búsqueda.
 */
export function paginar(raiz, { selector = ".row", porPagina = 20, dentro = false, singular = "registro", plural = "registros" } = {}) {
  if (!raiz) return { refrescar() {} };
  let pagina = 1;
  const nav = document.createElement("nav");
  nav.className = "paginacion no-print";
  nav.setAttribute("aria-label", "Paginación");
  nav.hidden = true;
  if (dentro) raiz.append(nav); else raiz.after(nav);
  const filas = () => [...raiz.querySelectorAll(selector)].filter(r => !r.hidden);
  function refrescar(reiniciar = true) {
    if (reiniciar) pagina = 1;
    const todas = [...raiz.querySelectorAll(selector)];
    const visibles = todas.filter(r => !r.hidden);
    const paginas = Math.max(1, Math.ceil(visibles.length / porPagina));
    pagina = Math.min(pagina, paginas);
    const desde = (pagina - 1) * porPagina, hasta = desde + porPagina;
    todas.forEach(r => r.removeAttribute("data-pag"));
    visibles.forEach((r, i) => { if (i < desde || i >= hasta) r.setAttribute("data-pag", "fuera"); });
    // Encabezados y grupos que quedaron sin filas en esta página.
    raiz.querySelectorAll(".list, section.panel[data-par]").forEach(g => {
      if (g === raiz) return;
      const hay = [...g.querySelectorAll(selector)].some(r => !r.hidden && !r.hasAttribute("data-pag")) || (g.matches(selector) && !g.hidden && !g.hasAttribute("data-pag"));
      g.toggleAttribute("data-pag", !hay && visibles.length > 0);
      const t = g.previousElementSibling;
      if (t && /^H[23]$/.test(t.tagName)) t.toggleAttribute("data-pag", !hay && visibles.length > 0);
    });
    nav.hidden = visibles.length <= porPagina;
    if (nav.hidden) { nav.innerHTML = ""; return; }
    const n = visibles.length;
    nav.innerHTML = `${botonIcono("anterior", "Anterior", { clase: "quieto", extra: `data-pg="-1" ${pagina === 1 ? "disabled" : ""}` })}
      <p class="paginacion-info" role="status" aria-live="polite"><b>Página ${pagina} de ${paginas}</b><span>${desde + 1} a ${Math.min(hasta, n)} de ${n} ${n === 1 ? singular : plural}</span></p>
      ${botonIcono("siguiente", "Siguiente", { clase: "quieto", extra: `data-pg="1" ${pagina === paginas ? "disabled" : ""}` })}`;
  }
  nav.addEventListener("click", e => {
    const b = e.target.closest("[data-pg]");
    if (!b || b.disabled) return;
    pagina += Number(b.dataset.pg);
    refrescar(false);
    (filas().find(r => !r.hasAttribute("data-pag")) || raiz).scrollIntoView({ block: "start", behavior: "smooth" });
  });
  refrescar();
  return { refrescar };
}
