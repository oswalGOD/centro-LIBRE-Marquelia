// Pantalla de Inicio: cuadrícula de iconos grandes, uno por módulo.
// Para agregar un módulo nuevo, añade una línea a MODULOS_INICIO (ruta real y roles que lo ven)
// o, mientras se construye, déjalo con estado "proximamente".

import { esCoordinadora } from "../core/auth.js";
import { esc, aviso } from "../core/ui.js";

const svg = d => `<svg viewBox="0 0 24 24" width="44" height="44" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICONOS = {
  asistencia: svg('<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 13l2 2 4-4"/>'),
  comites: svg('<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.4"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M15 14.2c.6-.2 1.3-.2 2-.2 2.2 0 4 1.8 4 4"/>'),
  asesorias: svg('<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/>'),
  estadisticas: svg('<path d="M4 20V4M4 20h16"/><path d="M8 16v-4M12 16V8M16 16v-6"/>'),
  reportes: svg('<path d="M7 3h8l4 4v14H7z"/><path d="M15 3v4h4M10 12h6M10 15h6M10 18h3"/>'),
  usuarias: svg('<circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7"/>'),
  perfiles: svg('<rect x="4" y="5" width="16" height="14" rx="2"/><circle cx="9.5" cy="11" r="2"/><path d="M6.5 16c.5-1.5 1.6-2.2 3-2.2s2.5.7 3 2.2M14.5 10h3M14.5 13h3"/>'),
  ajustes: svg('<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>'),
};

// zona: "principal" (cuadrícula) o "dock" (fila de abajo, módulos de toda la app)
export const MODULOS_INICIO = [
  { id: "asistencia", nombre: "Listas de asistencia", ruta: "#/asistencia", color: "#8c1d4f", zona: "principal" },
  { id: "estadisticas", nombre: "Estadísticas", ruta: "#/estadisticas", color: "#8a6620", zona: "principal" },
  { id: "comites", nombre: "Comités", color: "#2f6f8f", zona: "principal", proximamente: "Aquí se llevará el registro de los comités y sus reuniones." },
  { id: "asesorias", nombre: "Asesorías personales", color: "#4f7a3a", zona: "principal", proximamente: "Aquí se llevará el registro de asesorías individuales." },
  { id: "reportes", nombre: "Reportes", color: "#6b4c9a", zona: "principal", proximamente: "Aquí se armarán los reportes que reúnan la información de todos los módulos." },
  { id: "usuarias", nombre: "Usuarias", ruta: "#/usuarias", color: "#a8552a", zona: "dock" },
  { id: "perfiles", nombre: "Perfiles", ruta: "#/perfiles", color: "#4a4a5a", zona: "dock", soloCoordinadora: true },
  { id: "ajustes", nombre: "Ajustes", ruta: "#/ajustes", color: "#5a5a66", zona: "dock" },
];

const visible = (m, yo) => !m.soloCoordinadora || esCoordinadora(yo);

function icono(m) {
  const cuerpo = `<span class="app-icon" style="--c:${m.color}">${ICONOS[m.icono || m.id]}</span><span class="app-name">${esc(m.nombre)}</span>${m.proximamente ? `<span class="app-soon">Próximamente</span>` : ""}`;
  return m.proximamente
    ? `<button type="button" class="app soon" data-soon="${esc(m.nombre)}: ${esc(m.proximamente)}">${cuerpo}</button>`
    : `<a class="app" href="${esc(m.ruta)}">${cuerpo}</a>`;
}

function inicio({ yo, pintar }) {
  const mios = MODULOS_INICIO.filter(m => visible(m, yo));
  const zona = z => mios.filter(m => m.zona === z).map(icono).join("");
  const c = pintar(`Hola, ${yo.nombre.split(" ")[0]}`, `
    <p class="hint">¿Qué quieres hacer hoy?</p>
    <nav class="app-grid" aria-label="Módulos">${zona("principal")}</nav>
    <nav class="app-grid dock" aria-label="Datos y ajustes">${zona("dock")}</nav>`);
  c.querySelectorAll("[data-soon]").forEach(b => (b.onclick = () => aviso(`${b.dataset.soon} Todavía no está disponible.`)));
}

export default {
  menu: [{ href: "#/", texto: "Inicio", activa: /^#\/$/ }],
  rutas: [[/^#\/$/, inicio]],
};
