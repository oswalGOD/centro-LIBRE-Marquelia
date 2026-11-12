// Modo captura de datos: el equipo queda fijo en el formulario de registro de una actividad para que
// las usuarias se registren solas. Solo se sale con el PIN del perfil que lo activó.
// El estado se guarda en el dispositivo: si se recarga o se cierra la app, el modo sigue activo.

const CLAVE = "clm-kiosko";

/** { perfilId, actividadId } si el modo está activo; si no, null. */
export function estado() {
  try {
    const x = JSON.parse(localStorage.getItem(CLAVE));
    return x && x.perfilId && x.actividadId ? x : null;
  } catch (e) { return null; }
}

export function activar(perfil, actividadId) {
  try { localStorage.setItem(CLAVE, JSON.stringify({ perfilId: perfil.id, actividadId, desde: Date.now() })); } catch (e) {}
}

export function desactivar() {
  try { localStorage.removeItem(CLAVE); } catch (e) {}
}
