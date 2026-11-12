// Botones de icono con etiqueta corta y menú desplegable «⋯», compartidos por todos los módulos.
// Todo icono lleva texto visible debajo y aria-label, porque en iPad y celular no hay texto emergente.

import { esc } from "./ui.js";

const TRAZOS = {
  editar: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  repetir: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  mas: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  mas2: '<path d="M12 5v14M5 12h14"/>',
  formato: '<path d="M7 9V4h10v5M7 17H5a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2"/><rect x="7" y="14" width="10" height="6"/>',
  captura: '<path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4"/><rect x="9" y="9" width="6" height="6" rx="1"/>',
  camara: '<path d="M4 8h3l1.6-2.5h6.8L17 8h3v11H4z"/><circle cx="12" cy="13.5" r="3.4"/>',
  galeria: '<rect x="4" y="5" width="16" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M5 18l5-5 4 4 2-2 3 3"/>',
  eliminar: '<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13M10 11v6M14 11v6"/>',
  cerrar: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  reordenar: '<path d="M8 4v16M8 20l-3-3M8 20l3-3M16 20V4M16 4l-3 3M16 4l3 3"/>',
  guardar: '<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>',
  anterior: '<path d="M15 5l-7 7 7 7"/>',
  siguiente: '<path d="M9 5l7 7-7 7"/>',
  salir: '<path d="M6 6l12 12M18 6L6 18"/>',
  filtros: '<path d="M4 6h16M7 12h10M10 18h4"/>',
  escaner: '<rect x="4" y="4" width="6" height="6"/><rect x="14" y="4" width="6" height="6"/><rect x="4" y="14" width="6" height="6"/><path d="M14 14h2v2h-2zM18 18h2M18 14v2"/>',
  identificacion: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="9" cy="12" r="2"/><path d="M14 10h4M14 14h4"/>',
  llave: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3M14 9l2 2"/>',
  apagar: '<path d="M12 3v8M7 6.5a8 8 0 1 0 10 0"/>',
  activar: '<circle cx="12" cy="12" r="8"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/>',
  descargar: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
  reabrir: '<path d="M4 12a8 8 0 1 0 3-6.2M4 4v4h4"/>',
};

export const icono = (nombre, tam = 22) =>
  `<svg viewBox="0 0 24 24" width="${tam}" height="${tam}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${TRAZOS[nombre] || ""}</svg>`;

/**
 * Botón de icono con su etiqueta debajo. Con `href` es un enlace; sin él, un botón.
 * opciones: id, clase ("primary", "danger", "quieto" sin borde), href, extra (atributos adicionales).
 */
export function botonIcono(nombre, etiqueta, { id = "", clase = "", href = "", extra = "", titulo = etiqueta } = {}) {
  const cuerpo = `${icono(nombre)}<span class="ib-et">${esc(etiqueta)}</span>`;
  const comun = `class="ib ${clase}" aria-label="${esc(titulo)}" title="${esc(titulo)}" ${id ? `id="${id}"` : ""} ${extra}`;
  return href ? `<a ${comun} href="${esc(href)}">${cuerpo}</a>` : `<button type="button" ${comun}>${cuerpo}</button>`;
}

/** Botón «Más» con su menú. Cada opción: { id, icono, texto, clase }. Devuelve el HTML; después llame a conectarMenus(contenedor). */
export function menuMas(opciones, { etiqueta = "Más" } = {}) {
  if (!opciones.length) return "";
  return `<span class="ib-menu">
    <button type="button" class="ib quieto" data-menu aria-haspopup="menu" aria-expanded="false" aria-label="${esc(etiqueta)}" title="${esc(etiqueta)}">${icono("mas")}<span class="ib-et">${esc(etiqueta)}</span></button>
    <span class="ib-lista" role="menu" hidden>${opciones.map(o => `<button type="button" role="menuitem" class="${o.clase || ""}" id="${o.id}">${icono(o.icono, 20)}${esc(o.texto)}</button>`).join("")}</span>
  </span>`;
}

/** Hace que los menús «Más» del contenedor abran y cierren (toque fuera o Escape). */
export function conectarMenus(raiz) {
  raiz.querySelectorAll("[data-menu]").forEach(b => {
    const lista = b.nextElementSibling;
    const cerrar = () => { lista.hidden = true; b.setAttribute("aria-expanded", "false"); document.removeEventListener("click", fuera, true); document.removeEventListener("keydown", tecla); };
    const fuera = e => { if (!lista.contains(e.target) && !b.contains(e.target)) cerrar(); };
    const tecla = e => { if (e.key === "Escape") { cerrar(); b.focus(); } };
    b.addEventListener("click", () => {
      if (!lista.hidden) return cerrar();
      lista.hidden = false;
      b.setAttribute("aria-expanded", "true");
      lista.querySelector("button")?.focus();
      document.addEventListener("click", fuera, true);
      document.addEventListener("keydown", tecla);
    });
    lista.addEventListener("click", e => { const x = e.target.closest("button"); if (x && !x.dataset.armado) cerrar(); }); // una opción que pide confirmar deja el menú abierto
  });
}
