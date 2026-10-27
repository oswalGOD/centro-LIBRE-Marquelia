// Utilidades de interfaz compartidas por todos los módulos.

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];

export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function aviso(mensaje) {
  let t = $("#toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "toast";
    t.className = "toast";
    t.setAttribute("role", "status");
    document.body.append(t);
  }
  t.textContent = mensaje;
  t.hidden = false;
  clearTimeout(aviso.t);
  aviso.t = setTimeout(() => (t.hidden = true), 2600);
}

/** Botón de confirmación en dos toques, para acciones que borran o cierran algo. */
export function dobleToque(boton, textoConfirmar, accion) {
  const original = boton.textContent;
  boton.addEventListener("click", async () => {
    if (boton.dataset.armado) {
      boton.disabled = true;
      await accion();
      return;
    }
    boton.dataset.armado = "1";
    boton.textContent = textoConfirmar;
    boton.classList.add("armado");
    setTimeout(() => {
      if (!boton.isConnected) return;
      delete boton.dataset.armado;
      boton.textContent = original;
      boton.classList.remove("armado");
    }, 4000);
  });
}

export function errores(contenedor, lista, titulo = "Revisa lo siguiente:") {
  contenedor.innerHTML = lista.length
    ? `<div class="issues" role="alert"><b>${esc(titulo)}</b><ul>${lista.map(e => `<li>${esc(e)}</li>`).join("")}</ul></div>`
    : "";
  if (lista.length) contenedor.scrollIntoView({ block: "nearest" });
}

/** Lee los campos con atributo data-campo dentro de un contenedor. */
export function leerCampos(contenedor) {
  const datos = {};
  $$("[data-campo]", contenedor).forEach(el => (datos[el.dataset.campo] = el.type === "checkbox" ? el.checked : el.value.trim()));
  return datos;
}

export function descargar(nombre, contenido, tipo = "application/json") {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  const a = Object.assign(document.createElement("a"), { href: url, download: nombre });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
