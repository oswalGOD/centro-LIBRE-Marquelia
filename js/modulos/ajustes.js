// Ajustes del dispositivo, respaldo y restauración de datos, e instalación de la app.

import * as db from "../core/db.js";
import { esCoordinadora, cambiarPin, pinValido, verificarPin } from "../core/auth.js";
import { hoy, prefijoFolio } from "../core/catalogos.js";
import { $, esc, aviso, errores, descargar, dobleToque, plural } from "../core/ui.js";
import * as nube from "../core/sync.js";

export const VERSION_APP = "0.9.0";

let eventoInstalar = null;
addEventListener("beforeinstallprompt", e => { e.preventDefault(); eventoInstalar = e; });

async function vista(ctx) {
  const { yo, pintar } = ctx;
  const coord = esCoordinadora(yo);
  const codigo = await db.leerMeta("codigoDispositivo", "A");
  const ultimoRespaldo = await db.leerMeta("ultimoRespaldo");
  const [acts, usuarias, asis] = await Promise.all(["actividades", "usuarias", "asistencias"].map(a => db.todos(a)));
  const persistente = await navigator.storage?.persisted?.();
  await nube.actualizarEstado();
  const e = nube.estado;
  const avisoLetra = await db.leerMeta("avisoLetra");
  const estimado = await navigator.storage?.estimate?.();
  const instalada = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  const c = pintar("Ajustes", `
    ${instalada ? "" : `<section class="panel stack">
      <h2 class="h3">Instalar en este dispositivo</h2>
      <p class="hint">${ios ? "En iPad o iPhone: abre esta página en Safari, toca el botón Compartir y elige “Agregar a pantalla de inicio”." : "Instálala para abrirla como cualquier app y usarla sin internet."}</p>
      ${ios ? "" : `<div class="actions"><button class="btn primary" id="instalar">Instalar app</button></div>`}
    </section>`}

    <section class="panel stack" id="sincronizacion">
      <h2 class="h3">Sincronización entre dispositivos</h2>
      ${e.conectada ? `
        <dl class="facts">
          <div><dt>Cuenta del Centro</dt><dd>${esc(e.cuenta)}</dd></div>
          <div><dt>Estado</dt><dd>${e.sinInternet ? `<span class="chip">Sin internet</span>` : e.error ? `<span class="chip warn">Con error</span>` : `<span class="chip ok">Activa</span>`}</dd></div>
          <div><dt>Cambios por enviar</dt><dd>${e.pendientes}</dd></div>
          <div><dt>Última sincronización</dt><dd>${e.ultima ? new Date(e.ultima).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" }) : "Todavía no"}</dd></div>
        </dl>
        ${e.error ? `<div class="issues">${esc(e.error)}</div>` : ""}
        ${avisoLetra ? `<div class="issues"><b>Otro dispositivo también usa la letra ${esc(codigo)} en sus folios.</b> ${coord ? "Cambia la letra de este dispositivo abajo, en Folios." : "Pide a la Coordinadora que cambie la letra de este dispositivo."}</div>` : ""}
        <p class="hint">Se sincroniza sola al abrir la app, al volver el internet, unos segundos después de cada cambio y cada 5 minutos.</p>
        <div class="actions"><button class="btn primary" id="sincronizar">Sincronizar ahora</button>
          ${coord ? `<button class="btn ghost danger" id="desconectar">Desconectar este dispositivo</button>` : ""}</div>`
      : coord ? `
        <p class="hint">Conecta este dispositivo con la cuenta del Centro para compartir perfiles, usuarias y actividades con las demás tabletas y computadoras.</p>
        <div class="grid">
          <div class="field"><label for="n-correo">Correo de la cuenta del Centro</label><input id="n-correo" type="email" autocomplete="username"></div>
          <div class="field"><label for="n-clave">Contraseña</label><input id="n-clave" type="password" autocomplete="current-password"></div>
        </div>
        <div id="errNube"></div>
        <div class="actions"><button class="btn primary" id="conectar">Conectar y sincronizar</button></div>`
      : `<p class="hint">Este dispositivo no está conectado. Pide a la Coordinadora que lo conecte desde Ajustes con la cuenta del Centro.</p>`}
    </section>

    <section class="panel stack">
      <h2 class="h3">Datos en este dispositivo</h2>
      <dl class="facts">
        <div><dt>Actividades</dt><dd>${acts.length}</dd></div>
        <div><dt>Usuarias</dt><dd>${usuarias.length}</dd></div>
        <div><dt>Registros de asistencia</dt><dd>${asis.length}</dd></div>
        <div><dt>Espacio usado</dt><dd>${estimado ? `${(estimado.usage / 1048576).toFixed(1)} MB` : "No disponible"}</dd></div>
        <div><dt>Almacenamiento protegido</dt><dd>${persistente ? `<span class="chip ok">Sí</span>` : `<span class="chip warn">No</span>`}</dd></div>
        <div><dt>Último respaldo</dt><dd>${ultimoRespaldo ? new Date(ultimoRespaldo).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" }) : `<span class="chip warn">Nunca</span>`}</dd></div>
      </dl>
      <p class="hint">${e.conectada ? "Los datos también se guardan en la cuenta del Centro." : "Mientras no esté activa la sincronización, los datos viven solo en este dispositivo."}${coord ? " Descarga un respaldo al terminar cada actividad y guárdalo en otro lugar (USB, correo o nube)." : " La Coordinadora es quien descarga los respaldos, porque incluyen datos de todas las actividades."}</p>
      ${coord ? `<div class="actions">
        <button class="btn primary" id="respaldo">Descargar respaldo</button>
        <label class="btn" for="restaurar">Restaurar desde respaldo</label><input type="file" id="restaurar" accept="application/json,.json" class="visually-hidden">
      </div>` : ""}
      <div id="restaurarConfirma"></div>
    </section>

    ${coord ? `<section class="panel stack">
      <h2 class="h3">Folios</h2>
      <div class="grid" id="f">
        <div class="field"><label for="codigo">Letra de este dispositivo</label><input id="codigo" class="upper" maxlength="1" value="${esc(codigo)}"></div>
      </div>
      <p class="hint">El folio toma el mes y el año de la actividad y lleva un consecutivo por mes, p. ej. <b class="mono">${prefijoFolio(hoy())}-${esc(codigo)}001</b>. Usa una letra distinta en cada tableta o computadora.</p>
      <div id="errFolio"></div>
      <div class="actions"><button class="btn" id="guardarFolio">Guardar</button></div>
    </section>` : ""}

    <section class="panel stack">
      <h2 class="h3">Mi PIN</h2>
      <div class="grid">
        <div class="field"><label for="pinActual">PIN actual</label><input id="pinActual" type="password" inputmode="numeric" maxlength="6" autocomplete="current-password"></div>
        <div class="field"><label for="pinNuevo">PIN nuevo</label><input id="pinNuevo" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password"></div>
      </div>
      <div id="errPin"></div>
      <div class="actions"><button class="btn" id="cambiarPin">Cambiar mi PIN</button></div>
    </section>
    <p class="hint">Versión ${VERSION_APP} · <a href="#/desarrollo">Opciones para desarrolladores</a></p>
  `);

  $("#sincronizar", c)?.addEventListener("click", async ev => {
    ev.target.disabled = true;
    ev.target.textContent = "Sincronizando…";
    try {
      const r = await nube.sincronizar();
      aviso(r.recibidos ? `Sincronizado · ${plural(r.recibidos, "cambio recibido", "cambios recibidos")}` : "Todo está al día");
    } catch {}
    vista(ctx);
  });
  $("#conectar", c)?.addEventListener("click", async ev => {
    ev.target.disabled = true;
    ev.target.textContent = "Conectando…";
    try {
      await nube.conectar($("#n-correo", c).value, $("#n-clave", c).value);
      await nube.sincronizar();
      aviso("Dispositivo conectado y sincronizado");
      vista(ctx);
    } catch (err) {
      errores($("#errNube", c), [err.message]);
      ev.target.disabled = false;
      ev.target.textContent = "Conectar y sincronizar";
    }
  });
  const desconectar = $("#desconectar", c);
  if (desconectar) dobleToque(desconectar, "Toca otra vez para desconectar", async () => {
    await nube.desconectar();
    aviso("Dispositivo desconectado. Los datos siguen guardados aquí.");
    vista(ctx);
  });

  $("#instalar", c)?.addEventListener("click", async () => {
    if (!eventoInstalar) return aviso("Usa el menú del navegador y elige “Instalar app” o “Agregar a pantalla de inicio”.");
    eventoInstalar.prompt();
    await eventoInstalar.userChoice;
    eventoInstalar = null;
  });

  $("#respaldo", c)?.addEventListener("click", async () => {
    const datos = await db.exportar();
    descargar(`respaldo-centro-libre-${hoy()}.json`, JSON.stringify(datos));
    await db.escribirMeta("ultimoRespaldo", Date.now());
    aviso("Respaldo descargado");
    vista(ctx);
  });

  $("#restaurar", c)?.addEventListener("change", async ev => {
    const caja = $("#restaurarConfirma", c);
    let respaldo;
    try {
      respaldo = JSON.parse(await ev.target.files[0].text());
      if (respaldo.app !== "centro-libre-marquelia") throw new Error();
      if ((respaldo.version || 1) < 2) respaldo = { ...respaldo, version: 2, datos: db.convertirV1(respaldo.datos) };
    } catch {
      return errores(caja, ["El archivo no es un respaldo de esta app."]);
    }
    const n = a => (respaldo.datos[a] || []).filter(x => !x.borrado).length;
    caja.innerHTML = `<div class="confirm"><span>El respaldo del ${new Date(respaldo.exportado).toLocaleDateString("es-MX")} tiene ${plural(n("actividades"), "actividad", "actividades")} y ${plural(n("usuarias"), "usuaria", "usuarias")}. Reemplazará todo lo que hay en este dispositivo.</span><button class="btn danger" id="siRestaurar">Reemplazar datos</button></div>`;
    dobleToque($("#siRestaurar", caja), "Toca otra vez para confirmar", async () => {
      await db.importar(respaldo);
      aviso("Datos restaurados");
      ctx.recargar();
    });
  });

  $("#guardarFolio", c)?.addEventListener("click", async () => {
    const l = $("#codigo", c).value.trim().toUpperCase();
    const e = [];
    if (!/^[A-Z]$/.test(l)) e.push("La letra del dispositivo debe ser una sola letra.");
    errores($("#errFolio", c), e);
    if (e.length) return;
    if (l !== codigo) await db.escribirMeta("avisoLetra", false);
    await db.escribirMeta("codigoDispositivo", l);
    aviso("Folios actualizados");
    vista(ctx);
  });

  $("#cambiarPin", c).onclick = async () => {
    const actual = $("#pinActual", c).value, nuevo = $("#pinNuevo", c).value;
    const e = [];
    if (!(await verificarPin(yo, actual))) e.push("El PIN actual no es correcto.");
    if (!pinValido(nuevo)) e.push("El PIN nuevo debe tener de 4 a 6 números.");
    errores($("#errPin", c), e);
    if (e.length) return;
    await cambiarPin(yo, nuevo);
    aviso("Tu PIN se actualizó");
    vista(ctx);
  };
}

export default {
  menu: [{ href: "#/ajustes", texto: "Ajustes", activa: /^#\/ajustes/ }],
  rutas: [[/^#\/ajustes$/, vista]],
};
