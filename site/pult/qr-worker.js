// Decodes camera frames off the main thread where there is no BarcodeDetector (iPhone Safari). jsQR: vendor/README.txt
importScripts('vendor/jsQR.js');
onmessage = (e) => {
  const { id, data, width, height } = e.data;
  let text = null;
  try {
    const found = jsQR(new Uint8ClampedArray(data), width, height, { inversionAttempts: 'dontInvert' });
    if (found && found.data) text = found.data;
  } catch (err) { /* an unreadable frame is just a miss */ }
  postMessage({ id, text });
};
