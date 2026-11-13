// Mini tarjetas de resumen que se muestran al inicio de cada módulo: una sola fila, con cifra y etiqueta corta.
// Se calculan con los datos guardados en el dispositivo, por lo que funcionan sin conexión.

import { esc } from "./ui.js";

/**
 * @param {Array<[number|string, string, string?]>} items  [cifra, etiqueta, tono]; el tono opcional es "ok", "warn" o "gold".
 * Se recomiendan de 2 a 4 tarjetas para que quepan en celulares angostos.
 */
export function tarjetas(items, { etiqueta = "Resumen" } = {}) {
  return `<div class="resumen" role="group" aria-label="${esc(etiqueta)}" style="--n:${items.length}">${items.map(([n, et, tono]) =>
    `<div class="rm${tono ? ` ${tono}` : ""}"><b>${esc(n)}</b><span>${esc(et)}</span></div>`).join("")}</div>`;
}
