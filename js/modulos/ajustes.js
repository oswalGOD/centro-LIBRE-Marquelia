// Ajustes del dispositivo, respaldo y restauración de datos, e instalación de la app.

import * as db from "../core/db.js";
import { esCoordinadora, cambiarPin, pinValido, verificarPin } from "../core/auth.js";
import { hoy, prefijoFolio } from "../core/catalogos.js";
import { $, esc, aviso, errores, descargar, dobleToque, plural, unaVez } from "../core/ui.js";
import * as nube from "../core/sync.js";
import { cifrar, descifrar, estaCifrado } from "../core/cifrado.js";
import { VERSION_APP } from "../core/config.js";

export { VERSION_APP };

let eventoInstalar = null;
addEventListener("beforeinstallprompt", e => { e.preventDefault(); eventoInstalar = e; });

async function vista(ctx) {
  const { yo, pintar } = ctx;
  const coord = esCoordinadora(yo);
  const idDisp = await db.leerMeta("idDispositivo", "A");
  const ultimoRespaldo = await db.leerMeta("ultimoRespaldo");
  const [acts, usuarias, asis] = await Promise.all(["actividades", "usuarias", "asistencias"].map(a => db.todos(a)));
  const persistente = await navigator.storage?.persisted?.();
  await nube.actualizarEstado();
  const e = nube.estado;
  const avisoIdRepetido = await db.leerMeta("avisoIdRepetido");
  const estimado = await navigator.storage?.estimate?.();
  const instalada = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  const c = pintar("Ajustes", `
    ${instalada ? "" : `<section class="panel stack">
      <h2 class="h3">Instalar en este dispositivo</h2>
      <p class="hint">${ios ? "En iPad o iPhone: abra esta página en Safari, toque el botón Compartir y seleccione “Agregar a pantalla de inicio”." : "Instálela para abrirla como cualquier aplicación y utilizarla sin conexión a internet."}</p>
      ${ios ? "" : `<div class="actions"><button class="btn primary" id="instalar">Instalar aplicación</button></div>`}
    </section>`}

    <section class="panel stack" id="sincronizacion">
      <h2 class="h3">Sincronización entre dispositivos</h2>
      ${e.conectada ? `
        <dl class="facts">
          <div><dt>Cuenta del Centro</dt><dd>${esc(e.cuenta)}</dd></div>
          <div><dt>Estado</dt><dd>${e.sinInternet ? `<span class="chip">Sin conexión</span>` : e.error ? `<span class="chip warn">Con error</span>` : `<span class="chip ok">Activa</span>`}</dd></div>
          <div><dt>Cambios por enviar</dt><dd>${e.pendientes}</dd></div>
          <div><dt>Última sincronización</dt><dd>${e.ultima ? new Date(e.ultima).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" }) : "Aún no"}</dd></div>
        </dl>
        ${e.error ? `<div class="issues">${esc(e.error)}</div>` : ""}
        ${nube.avisoReloj() ? `<div class="issues"><b>Verifique la hora del equipo.</b> ${esc(nube.avisoReloj())}</div>` : ""}
        ${avisoIdRepetido ? `<div class="issues"><b>Otro dispositivo también usa el ID ${esc(idDisp)} en sus folios.</b> ${coord ? "Cambie el ID de este dispositivo más abajo, en Folios." : "Solicite a la Coordinadora que cambie el ID de este dispositivo."}</div>` : ""}
        <p class="hint">La sincronización es automática: se realiza al abrir la aplicación, al restablecerse la conexión, unos segundos después de cada cambio y cada 5 minutos.</p>
        <div class="actions"><button class="btn primary" id="sincronizar">Sincronizar ahora</button>
          ${coord ? `<button class="btn ghost danger" id="desconectar">Desconectar este dispositivo</button>` : ""}</div>`
      : coord ? `
        <p class="hint">Conecte este dispositivo con la cuenta del Centro para compartir perfiles, usuarias y actividades con las demás tabletas y computadoras.</p>
        <div class="grid">
          <div class="field"><label for="n-correo">Correo de la cuenta del Centro</label><input id="n-correo" type="email" autocomplete="username"></div>
          <div class="field"><label for="n-clave">Contraseña</label><input id="n-clave" type="password" autocomplete="current-password"></div>
        </div>
        <div id="errNube"></div>
        <div class="actions"><button class="btn primary" id="conectar">Conectar y sincronizar</button></div>`
      : `<p class="hint">Este dispositivo no está conectado. Solicite a la Coordinadora que lo conecte desde Ajustes con la cuenta del Centro.</p>`}
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
      <p class="hint">${e.conectada ? "Los datos también se guardan en la cuenta del Centro." : "Mientras no esté activa la sincronización, los datos se conservan únicamente en este dispositivo."}${coord ? " Descargue un respaldo al terminar cada actividad y consérvelo en otro lugar (USB, correo o nube)." : " Los respaldos los descarga la Coordinadora, ya que incluyen datos de todas las actividades."}</p>
      ${coord ? `<div class="actions">
        <button class="btn primary" id="respaldo">Descargar respaldo</button>
        <label class="btn" for="restaurar">Restaurar desde respaldo</label><input type="file" id="restaurar" accept="application/json,.json" class="visually-hidden">
      </div>
      <div class="stack" id="respaldoForm" hidden>
        <p class="hint">El respaldo contiene CURP, teléfonos y firmas, por lo que se descarga cifrado. Elija una contraseña de al menos 8 caracteres y consérvela en un lugar seguro: <b>sin ella no es posible abrir el respaldo</b>.</p>
        <div class="grid">
          <div class="field"><label for="r-clave">Contraseña del respaldo</label><input id="r-clave" type="password" autocomplete="new-password"></div>
          <div class="field"><label for="r-clave2">Confirme la contraseña</label><input id="r-clave2" type="password" autocomplete="new-password"></div>
        </div>
        <div id="errRespaldo"></div>
        <div class="actions"><button class="btn primary" id="descargarCifrado">Descargar respaldo cifrado</button></div>
      </div>
      <div class="stack" id="abrirForm" hidden>
        <div class="field"><label for="a-clave">Contraseña del respaldo</label><input id="a-clave" type="password" autocomplete="current-password"></div>
        <div class="actions"><button class="btn" id="abrirRespaldo">Abrir respaldo</button></div>
      </div>` : ""}
      <div id="restaurarConfirma"></div>
    </section>

    ${coord ? `<section class="panel stack">
      <h2 class="h3">Folios</h2>
      <div class="grid" id="f">
        <div class="field"><label for="idDisp">ID de este dispositivo</label><input id="idDisp" class="upper" maxlength="1" value="${esc(idDisp)}"></div>
      </div>
      <p class="hint">El folio toma el mes y el año de la actividad y lleva un consecutivo por mes, p. ej. <b class="mono">${prefijoFolio(hoy())}-${esc(idDisp)}001</b>. Utilice un ID (una letra) distinto en cada tableta o computadora.</p>
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
    <p class="hint">Versión ${VERSION_APP}${coord ? ` · <a href="#/desarrollo">Opciones para desarrolladores</a>` : ""}</p>
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
  if (desconectar) dobleToque(desconectar, "Toque nuevamente para desconectar", async () => {
    await nube.desconectar();
    aviso("Dispositivo desconectado. Los datos permanecen guardados en este equipo.");
    vista(ctx);
  });

  $("#instalar", c)?.addEventListener("click", async () => {
    if (!eventoInstalar) return aviso("Utilice el menú del navegador y seleccione “Instalar app” o “Agregar a pantalla de inicio”.");
    eventoInstalar.prompt();
    await eventoInstalar.userChoice;
    eventoInstalar = null;
  });

  $("#respaldo", c)?.addEventListener("click", () => {
    $("#respaldoForm", c).hidden = false;
    $("#r-clave", c).focus();
  });
  $("#descargarCifrado", c)?.addEventListener("click", unaVez(async () => {
    const clave = $("#r-clave", c).value;
    const e = [];
    if (clave.length < 8) e.push("La contraseña debe tener al menos 8 caracteres.");
    else if (clave !== $("#r-clave2", c).value) e.push("Las contraseñas ingresadas no coinciden.");
    errores($("#errRespaldo", c), e);
    if (e.length) return;
    const sobre = await cifrar(JSON.stringify(await db.exportar()), clave);
    descargar(`respaldo-centro-libre-${hoy()}.json`, JSON.stringify(sobre));
    await db.escribirMeta("ultimoRespaldo", Date.now());
    aviso("Respaldo cifrado descargado");
    vista(ctx);
  }));

  $("#restaurar", c)?.addEventListener("change", async ev => {
    const caja = $("#restaurarConfirma", c);
    caja.innerHTML = "";
    $("#abrirForm", c).hidden = true;
    let archivo;
    try {
      archivo = JSON.parse(await ev.target.files[0].text());
      if (archivo.app !== "centro-libre-marquelia") throw new Error();
    } catch {
      return errores(caja, ["El archivo no es un respaldo de esta aplicación."]);
    } finally {
      ev.target.value = "";
    }
    if (!estaCifrado(archivo)) return confirmarRestauracion(archivo); // respaldos de antes de la versión 0.12
    $("#abrirForm", c).hidden = false;
    $("#a-clave", c).value = "";
    $("#a-clave", c).focus();
    $("#abrirRespaldo", c).onclick = unaVez(async () => {
      try {
        const respaldo = JSON.parse(await descifrar(archivo, $("#a-clave", c).value));
        $("#abrirForm", c).hidden = true;
        confirmarRestauracion(respaldo);
      } catch (err) {
        errores(caja, [err.message]);
      }
    });
  });

  function confirmarRestauracion(respaldo) {
    const caja = $("#restaurarConfirma", c);
    if (respaldo?.app !== "centro-libre-marquelia" || !respaldo.datos) return errores(caja, ["El archivo no es un respaldo de esta aplicación."]);
    if ((respaldo.version || 1) < 2) respaldo = { ...respaldo, version: 2, datos: db.convertirV1(respaldo.datos) };
    const n = a => (respaldo.datos[a] || []).filter(x => !x.borrado).length;
    caja.innerHTML = `<div class="confirm"><span>El respaldo del ${new Date(respaldo.exportado).toLocaleDateString("es-MX")} tiene ${plural(n("actividades"), "actividad", "actividades")} y ${plural(n("usuarias"), "usuaria", "usuarias")}. Reemplazará toda la información existente en este dispositivo.</span><button class="btn danger" id="siRestaurar">Reemplazar datos</button></div>`;
    dobleToque($("#siRestaurar", caja), "Toque nuevamente para confirmar", async () => {
      await db.importar(respaldo);
      aviso("Datos restaurados");
      ctx.recargar();
    });
  }

  $("#guardarFolio", c)?.addEventListener("click", async () => {
    const l = $("#idDisp", c).value.trim().toUpperCase();
    const e = [];
    if (!/^[A-Z]$/.test(l)) e.push("El ID del dispositivo debe ser una sola letra (A, B, C…).");
    errores($("#errFolio", c), e);
    if (e.length) return;
    if (l !== idDisp) await db.escribirMeta("avisoIdRepetido", false);
    await db.escribirMeta("idDispositivo", l);
    aviso("Folios actualizados");
    vista(ctx);
  });

  $("#cambiarPin", c).onclick = async () => {
    const actual = $("#pinActual", c).value, nuevo = $("#pinNuevo", c).value;
    const e = [];
    if (!(await verificarPin(yo, actual))) e.push("El PIN actual no es correcto.");
    if (!pinValido(nuevo)) e.push("El PIN nuevo debe tener de 4 a 6 dígitos.");
    errores($("#errPin", c), e);
    if (e.length) return;
    await cambiarPin(yo, nuevo);
    aviso("Su PIN se actualizó");
    vista(ctx);
  };
}

export default {
  menu: [{ href: "#/ajustes", texto: "Ajustes", activa: /^#\/ajustes/ }],
  rutas: [[/^#\/ajustes$/, vista]],
};
