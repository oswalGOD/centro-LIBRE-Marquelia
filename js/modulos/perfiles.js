// Perfiles de las integrantes del Centro que usan la app. Solo la Coordinadora puede dar de alta, cambiar PIN o desactivar.

import * as db from "../core/db.js";
import { ROLES } from "../core/catalogos.js";
import { crearPerfil, cambiarPin, pinValido } from "../core/auth.js";
import { $, $$, esc, aviso, errores, leerCampos } from "../core/ui.js";

async function vista(ctx) {
  const { yo, pintar } = ctx;
  const lista = (await db.todos("usuarias")).sort((a, b) => b.activa - a.activa || ROLES.indexOf(a.rol) - ROLES.indexOf(b.rol));
  const coordinadorasActivas = lista.filter(u => u.activa && u.rol === "Coordinadora").length;

  const c = pintar("Perfiles", `
    <div class="list">${lista.map(u => `
      <div class="row user ${u.activa ? "" : "inactive"}" data-id="${u.id}">
        <span class="avatar" aria-hidden="true">${esc(u.nombre[0])}</span>
        <span class="body"><span class="name">${esc(u.nombre)}${u.id === yo.id ? " (tú)" : ""}</span><span class="meta"><span>${esc(u.rol)}</span>${u.activa ? "" : `<span class="chip">Desactivado</span>`}</span></span>
        <span class="end actions">
          <button class="btn small ghost" data-accion="pin">Cambiar PIN</button>
          ${u.activa && !(u.rol === "Coordinadora" && coordinadorasActivas === 1) ? `<button class="btn small ghost danger" data-accion="desactivar">Desactivar</button>` : ""}
          ${u.activa ? "" : `<button class="btn small ghost" data-accion="activar">Activar</button>`}
        </span>
        <div class="pin-form span-all" hidden>
          <div class="field"><label for="pin-${u.id}">PIN nuevo de 4 a 6 números</label><input id="pin-${u.id}" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password"></div>
          <button class="btn small primary" data-accion="guardarPin">Guardar PIN</button>
        </div>
      </div>`).join("")}</div>
    <section class="panel stack">
      <h2 class="h3">Agregar perfil</h2>
      <div class="grid" id="f">
        <div class="field span-2"><label for="u-nombre">Nombre completo</label><input id="u-nombre" data-campo="nombre" autocomplete="off"></div>
        <div class="field"><label for="u-rol">Rol</label><select id="u-rol" data-campo="rol">${ROLES.map(r => `<option ${r === "Psicóloga" ? "selected" : ""}>${r}</option>`).join("")}</select></div>
        <div class="field"><label for="u-pin">PIN inicial de 4 a 6 números</label><input id="u-pin" data-campo="pin" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password"></div>
      </div>
      <div id="err"></div>
      <div class="actions"><button class="btn primary" id="agregar">Agregar perfil</button></div>
      <p class="hint">Cada perfil entra con su nombre y su PIN. La Psicóloga y la Abogada solo ven las actividades que crean o facilitan; la Coordinadora ve todas.</p>
    </section>
  `);

  $$(".row.user", c).forEach(fila => {
    const u = lista.find(x => x.id === fila.dataset.id);
    fila.addEventListener("click", async ev => {
      const accion = ev.target.closest("[data-accion]")?.dataset.accion;
      if (accion === "pin") { $(".pin-form", fila).hidden = false; $("input", fila).focus(); }
      if (accion === "guardarPin") {
        const pin = $("input", fila).value;
        if (!pinValido(pin)) return aviso("El PIN debe tener de 4 a 6 números");
        await cambiarPin(u, pin);
        aviso(`PIN de ${u.nombre.split(" ")[0]} actualizado`);
        vista(ctx);
      }
      if (accion === "desactivar" || accion === "activar") {
        await db.guardar("usuarias", { ...u, activa: accion === "activar" });
        aviso(accion === "activar" ? "Perfil activado" : "Perfil desactivado. Ya no podrá entrar.");
        if (u.id === yo.id) return ctx.recargar();
        vista(ctx);
      }
    });
  });

  $("#agregar", c).onclick = async () => {
    const d = leerCampos($("#f", c));
    const e = [];
    if (d.nombre.split(/\s+/).filter(Boolean).length < 2) e.push("Escribe nombre y apellido.");
    if (!pinValido(d.pin)) e.push("El PIN debe tener de 4 a 6 números.");
    errores($("#err", c), e);
    if (e.length) return;
    await crearPerfil(d);
    aviso(`${d.nombre.split(" ")[0]} ya puede entrar con su PIN`);
    vista(ctx);
  };
}

export default {
  menu: [{ href: "#/perfiles", texto: "Perfiles", activa: /^#\/perfiles/, soloCoordinadora: true }],
  rutas: [[/^#\/perfiles$/, vista, { soloCoordinadora: true }]],
};
