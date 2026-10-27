// Catálogos del formato oficial y utilidades de CURP, edades y fechas.

export const ROLES = ["Coordinadora", "Psicóloga", "Abogada"];

export const GRUPOS = [
  ["A", "Sin categoría"],
  ["B", "Indígenas"],
  ["C", "Con discapacidad"],
  ["D", "Afrodescendientes"],
  ["E", "Migrantes"],
];

// [letra, etiqueta, edad mínima, edad máxima]
export const RANGOS = [
  ["A", "Menores de 15", 0, 14],
  ["B", "15 a 19", 15, 19],
  ["C", "20 a 29", 20, 29],
  ["D", "30 a 39", 30, 39],
  ["E", "40 a 49", 40, 49],
  ["F", "50 a 59", 50, 59],
  ["G", "60 a 69", 60, 69],
  ["H", "70 y más", 70, 999],
];

export const SEXOS = [["M", "Mujer"], ["H", "Hombre"], ["Otro", "Otro"]];

export const TIPOS_ACTIVIDAD = ["Taller", "Plática", "Asesoría jurídica", "Atención psicológica", "Grupo de apoyo", "Jornada comunitaria", "Capacitación", "Reunión"];

export const ESTADOS = {
  AS: "Aguascalientes", BC: "Baja California", BS: "Baja California Sur", CC: "Campeche", CL: "Coahuila", CM: "Colima",
  CS: "Chiapas", CH: "Chihuahua", DF: "Ciudad de México", DG: "Durango", GT: "Guanajuato", GR: "Guerrero", HG: "Hidalgo",
  JC: "Jalisco", MC: "Estado de México", MN: "Michoacán", MS: "Morelos", NT: "Nayarit", NL: "Nuevo León", OC: "Oaxaca",
  PL: "Puebla", QT: "Querétaro", QR: "Quintana Roo", SP: "San Luis Potosí", SL: "Sinaloa", SR: "Sonora", TC: "Tabasco",
  TS: "Tamaulipas", TL: "Tlaxcala", VZ: "Veracruz", YN: "Yucatán", ZS: "Zacatecas", NE: "Nacida(o) en el extranjero",
};

const CURP_RE = /^[A-Z][AEIOUX][A-Z]{2}\d{6}[HMX][A-Z]{2}[B-DF-HJ-NP-TV-Z]{3}[A-Z0-9]\d$/;

export const limpiarCurp = s => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Devuelve fecha de nacimiento, sexo y estado contenidos en la CURP, o null si no es válida. */
export function leerCurp(valor) {
  const c = limpiarCurp(valor);
  if (!CURP_RE.test(c)) return null;
  const siglo = /\d/.test(c[16]) ? 1900 : 2000;
  const fnac = `${siglo + Number(c.slice(4, 6))}-${c.slice(6, 8)}-${c.slice(8, 10)}`;
  const d = new Date(fnac + "T12:00");
  if (isNaN(d) || d.toISOString().slice(0, 10) !== fnac) return null;
  return { fnac, sexo: { H: "H", M: "M", X: "Otro" }[c[10]], lugar: ESTADOS[c.slice(11, 13)] || "" };
}

export function edad(fnac, referencia) {
  if (!fnac) return null;
  const n = new Date(fnac + "T12:00");
  const r = new Date((referencia || hoy()) + "T12:00");
  let e = r.getFullYear() - n.getFullYear();
  if (r.getMonth() < n.getMonth() || (r.getMonth() === n.getMonth() && r.getDate() < n.getDate())) e--;
  return e;
}

export const rangoDe = e => (e == null || e < 0 ? null : (RANGOS.find(r => e >= r[2] && e <= r[3]) || RANGOS[0])[0]);
export const etiquetaRango = letra => RANGOS.find(r => r[0] === letra)?.[1] || "";
export const etiquetaGrupo = letra => GRUPOS.find(g => g[0] === letra)?.[1] || "";
export const etiquetaSexo = v => SEXOS.find(s => s[0] === v)?.[1] || "";

export const hoy = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
export const fechaCorta = f => (f ? f.split("-").reverse().join("/") : "");
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export const fechaLarga = f => (f ? `${Number(f.slice(8, 10))} ${MESES[Number(f.slice(5, 7)) - 1]} ${f.slice(0, 4)}` : "");
export const mesCorto = f => MESES[Number(f.slice(5, 7)) - 1];

export const normalizar = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
