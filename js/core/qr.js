// Código QR generado en el dispositivo (sin servicios externos), con la biblioteca qrcode-generator (MIT, js/vendor/qrcode.js).

import qrcode from "../vendor/qrcode.js";

/** Imagen PNG (data URL) del QR de `texto`, con corrección de errores M y margen de 2 módulos. */
export function qrPNG(texto, { modulo = 8, margen = 2 } = {}) {
  const qr = qrcode(0, "M");
  qr.addData(texto);
  qr.make();
  const n = qr.getModuleCount();
  const lado = (n + margen * 2) * modulo;
  const lienzo = document.createElement("canvas");
  lienzo.width = lienzo.height = lado;
  const g = lienzo.getContext("2d");
  g.fillStyle = "#fff";
  g.fillRect(0, 0, lado, lado);
  g.fillStyle = "#000";
  for (let f = 0; f < n; f++) for (let c = 0; c < n; c++) if (qr.isDark(f, c)) g.fillRect((c + margen) * modulo, (f + margen) * modulo, modulo, modulo);
  return lienzo.toDataURL("image/png");
}
