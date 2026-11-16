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
