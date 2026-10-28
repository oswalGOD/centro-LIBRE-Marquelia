# Lector de texto (Tesseract) para «Escanear INE»

Copias sin cambios, para que la lectura funcione sin internet:

- `tesseract.min.js`, `worker.min.js`: [tesseract.js](https://github.com/naptha/tesseract.js) 7.0.0, Apache-2.0 (ver `LICENSE-tesseract.js.txt`).
- `tesseract-core-simd-lstm.wasm.js`, `tesseract-core-lstm.wasm.js`: tesseract.js-core 7.0.0, Apache-2.0 (motor [Tesseract OCR](https://github.com/tesseract-ocr/tesseract), Apache-2.0).
- `eng.traineddata.gz`: modelo inglés `4.0.0_best_int` de [tessdata](https://github.com/tesseract-ocr/tessdata_best), Apache-2.0, empaquetado por `@tesseract.js-data/eng` 1.0.0.
