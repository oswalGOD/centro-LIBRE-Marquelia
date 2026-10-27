// Reglas de acceso por rol.
// La Coordinadora ve y administra todo. La Psicóloga y la Abogada ven
// las actividades que crearon o que facilitan.

import { esCoordinadora } from "./auth.js";

export const puedeVer = (yo, actividad) =>
  esCoordinadora(yo) || actividad.creadaPor === yo.id || actividad.facilitadoraId === yo.id;

export const puedeEditar = (yo, actividad) => puedeVer(yo, actividad) && actividad.estado !== "cerrada";
