// js/scanner.js
import { showToast } from './utils.js';

let scanner = null;
let scanning = false;
let pendingCallback = null;

function getEl(id) {
  return document.getElementById(id);
}

function setStatus(text) {
  const status = getEl('barcodeScannerStatus');
  if (status) status.textContent = text;
}

function setManualEntryVisible(visible, value = '') {
  const manualBox = getEl('barcodeManualBox');
  const manualInput = getEl('barcodeManualInput');
  if (manualBox) manualBox.style.display = visible ? 'flex' : 'none';
  if (manualInput) {
    if (value) manualInput.value = value;
    if (visible) setTimeout(() => manualInput.focus(), 0);
  }
}

function getFormatsToSupport() {
  const formats = window.Html5QrcodeSupportedFormats;
  if (!formats) return undefined;
  return [
    formats.QR_CODE,
    formats.EAN_13,
    formats.EAN_8,
    formats.UPC_A,
    formats.UPC_E,
    formats.CODE_128,
    formats.CODE_39,
    formats.ITF,
    formats.DATA_MATRIX
  ].filter(Boolean);
}

function canUseCamera() {
  const host = window.location.hostname;
  return window.isSecureContext || host === 'localhost' || host === '127.0.0.1';
}

async function stopScanner({ hideModal = true, resetCallback = true, clearReader = true } = {}) {
  const activeScanner = scanner;
  scanning = false;
  if (resetCallback) pendingCallback = null;
  scanner = null;
  if (activeScanner) {
    try {
      await activeScanner.stop();
    } catch {
      // The scanner may already be stopped by the library.
    }
    if (clearReader) {
      try {
        await activeScanner.clear();
      } catch {
        // Clearing is best effort; stale DOM is replaced before each start.
      }
    }
  }
  if (hideModal) {
    const modal = getEl('barcodeScannerModal');
    if (modal) modal.style.display = 'none';
    setManualEntryVisible(false);
  }
}

function createScanner() {
  return new window.Html5Qrcode('barcodeScannerReader', {
    formatsToSupport: getFormatsToSupport(),
    verbose: false
  });
}

function getNativeBarcodeFormats() {
  return [
    'ean_13',
    'ean_8',
    'upc_a',
    'upc_e',
    'code_128',
    'code_39',
    'itf',
    'qr_code',
    'data_matrix'
  ];
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('failed to read image'));
    reader.readAsDataURL(file);
  });
}

async function loadImageFromFile(file) {
  const src = await readFileAsDataUrl(file);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('failed to load image'));
    img.src = src;
  });
}

async function createOcrCanvas(file) {
  const img = await loadImageFromFile(file);
  const scale = Math.max(2, Math.min(4, Math.ceil(1400 / Math.max(img.naturalWidth || img.width, 1))));
  const width = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
  const height = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    const boosted = gray < 170 ? Math.max(0, gray * 0.55) : Math.min(255, 235 + (gray - 170) * 0.3);
    data[i] = boosted;
    data[i + 1] = boosted;
    data[i + 2] = boosted;
    data[i + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

function isValidEan13(code) {
  if (!/^\d{13}$/.test(code)) return false;
  const digits = code.split('').map(Number);
  const sum = digits.slice(0, 12).reduce((total, digit, index) => (
    total + digit * (index % 2 === 0 ? 1 : 3)
  ), 0);
  return (10 - (sum % 10)) % 10 === digits[12];
}

function isValidEan8(code) {
  if (!/^\d{8}$/.test(code)) return false;
  const digits = code.split('').map(Number);
  const sum = digits.slice(0, 7).reduce((total, digit, index) => (
    total + digit * (index % 2 === 0 ? 3 : 1)
  ), 0);
  return (10 - (sum % 10)) % 10 === digits[7];
}

function isValidUpcA(code) {
  if (!/^\d{12}$/.test(code)) return false;
  const digits = code.split('').map(Number);
  const sum = digits.slice(0, 11).reduce((total, digit, index) => (
    total + digit * (index % 2 === 0 ? 3 : 1)
  ), 0);
  return (10 - (sum % 10)) % 10 === digits[11];
}

function findBarcodeCandidate(text) {
  const digitRuns = String(text || '').match(/\d[\d\s-]{5,}\d/g) || [];
  const normalizedRuns = digitRuns
    .map(value => value.replace(/\D/g, ''))
    .filter(value => value.length >= 8);
  const compact = String(text || '').replace(/\D/g, '');
  if (compact.length >= 8) normalizedRuns.push(compact);

  const guesses = [];
  const seen = new Set();
  for (const run of normalizedRuns) {
    for (const length of [13, 12, 8]) {
      for (let start = 0; start <= run.length - length; start++) {
        const candidate = run.slice(start, start + length);
        if (!seen.has(candidate)) {
          seen.add(candidate);
          guesses.push(candidate);
        }
      }
    }
  }

  const validated = guesses.find(code => isValidEan13(code) || isValidUpcA(code) || isValidEan8(code));
  const guess = validated || guesses.find(code => code.length === 13 || code.length === 12) || guesses[0] || '';
  return { code: validated || '', guess };
}

async function decodeImageWithNativeDetector(file) {
  if (!('BarcodeDetector' in window)) return '';
  try {
    let formats = getNativeBarcodeFormats();
    if (typeof window.BarcodeDetector.getSupportedFormats === 'function') {
      const supported = await window.BarcodeDetector.getSupportedFormats();
      formats = formats.filter(format => supported.includes(format));
    }
    if (!formats.length) return '';

    const detector = new window.BarcodeDetector({ formats });
    const bitmap = await createImageBitmap(file);
    try {
      const results = await detector.detect(bitmap);
      return String(results?.[0]?.rawValue || '').trim();
    } finally {
      if (typeof bitmap.close === 'function') bitmap.close();
    }
  } catch (error) {
    console.debug('Native barcode detector failed:', error);
    return '';
  }
}

async function decodeImageWithHtml5Qrcode(file) {
  if (!window.Html5Qrcode) return '';
  scanner = createScanner();
  scanning = true;
  try {
    return String(await scanner.scanFile(file, true) || '').trim();
  } catch (error) {
    console.debug('html5-qrcode image scan failed:', error);
    return '';
  } finally {
    scanning = false;
  }
}

async function decodeImageWithQuagga(file) {
  if (!window.Quagga) return '';
  try {
    const src = await readFileAsDataUrl(file);
    return new Promise((resolve) => {
      window.Quagga.decodeSingle({
        src,
        locate: true,
        numOfWorkers: 0,
        inputStream: {
          size: 1600,
          singleChannel: false
        },
        decoder: {
          readers: [
            'ean_reader',
            'ean_8_reader',
            'upc_reader',
            'upc_e_reader',
            'code_128_reader',
            'code_39_reader',
            'i2of5_reader'
          ]
        }
      }, (result) => {
        resolve(String(result?.codeResult?.code || '').trim());
      });
    });
  } catch (error) {
    console.debug('Quagga image scan failed:', error);
    return '';
  }
}

async function decodeDigitsWithTesseract(file) {
  if (!window.Tesseract) return { code: '', guess: '' };
  try {
    const ocrCanvas = await createOcrCanvas(file);
    const result = await window.Tesseract.recognize(ocrCanvas, 'eng', {
      workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/worker.min.js',
      corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@7.0.0/tesseract-core.wasm.js',
      langPath: 'https://tessdata.projectnaptha.com/4.0.0',
      tessedit_char_whitelist: '0123456789',
      preserve_interword_spaces: '1'
    });
    return findBarcodeCandidate(result?.data?.text || '');
  } catch (error) {
    console.debug('Tesseract OCR failed:', error);
    return { code: '', guess: '' };
  }
}

async function scanImageFile(file) {
  if (!file) return;
  if (!window.Html5Qrcode && !window.BarcodeDetector && !window.Quagga && !window.Tesseract) {
    showToast('扫码库加载失败，请检查网络后重试');
    return;
  }
  const callback = pendingCallback;
  setStatus('正在识别图片...');

  if (scanner) {
    await stopScanner({ hideModal: false, resetCallback: false, clearReader: true });
  }

  const reader = getEl('barcodeScannerReader');
  if (reader) reader.innerHTML = '';

  try {
    let code = await decodeImageWithNativeDetector(file);
    if (!code) code = await decodeImageWithHtml5Qrcode(file);
    if (scanner) await stopScanner({ hideModal: false, resetCallback: false, clearReader: false });
    if (!code) code = await decodeImageWithQuagga(file);
    if (!code) {
      setStatus('条码线未识别，正在尝试读取条码下方数字...');
      const ocrResult = await decodeDigitsWithTesseract(file);
      code = ocrResult.code;
      if (!code && ocrResult.guess) {
        setStatus('识别到疑似数字，但校验不确定。请确认后使用。');
        setManualEntryVisible(true, ocrResult.guess);
        showToast('请确认识别出的数字');
        return;
      }
    }
    if (!code) throw new Error('empty scan result');
    if (navigator.vibrate) navigator.vibrate(80);
    await stopScanner();
    if (callback) callback(code);
  } catch (error) {
    console.error('Image scan failed:', error);
    scanning = false;
    setStatus('图片没有读出条码，不是因为商品未录入。请换清晰近照，或手动输入条码。');
    setManualEntryVisible(true);
    showToast('未识别到条码');
  }
}

async function startWithFallback(html5QrCode, config) {
  try {
    await html5QrCode.start({ facingMode: 'environment' }, config, handleScanSuccess);
    return;
  } catch (firstError) {
    let cameras = [];
    try {
      cameras = await window.Html5Qrcode.getCameras();
    } catch {
      throw firstError;
    }
    if (!cameras.length) throw firstError;
    await html5QrCode.start(cameras[0].id, config, handleScanSuccess);
  }
}

async function handleScanSuccess(decodedText) {
  const code = String(decodedText || '').trim();
  if (!scanning || !code) return;
  const callback = pendingCallback;
  if (navigator.vibrate) navigator.vibrate(80);
  await stopScanner();
  if (callback) callback(code);
}

export function initBarcodeScanner() {
  const modal = getEl('barcodeScannerModal');
  const cancelBtn = getEl('cancelScannerBtn');
  const closeBtn = getEl('closeScannerBtn');
  const scanImageBtn = getEl('scanImageBtn');
  const imageInput = getEl('barcodeImageInput');
  const manualInput = getEl('barcodeManualInput');
  const useManualBtn = getEl('useManualBarcodeBtn');
  if (cancelBtn) cancelBtn.addEventListener('click', stopScanner);
  if (closeBtn) closeBtn.addEventListener('click', stopScanner);
  if (useManualBtn) {
    useManualBtn.addEventListener('click', async () => {
      const code = String(manualInput?.value || '').trim();
      if (!code) {
        showToast('请输入条码');
        return;
      }
      const callback = pendingCallback;
      await stopScanner();
      if (callback) callback(code);
    });
  }
  if (manualInput) {
    manualInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') useManualBtn?.click();
    });
  }
  if (scanImageBtn && imageInput) {
    scanImageBtn.addEventListener('click', () => imageInput.click());
    imageInput.addEventListener('change', async (event) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      await scanImageFile(file);
    });
  }
  if (modal) {
    modal.addEventListener('click', (event) => {
      if (event.target === modal) stopScanner();
    });
  }
  window.addEventListener('barcodeScannerCloseRequested', stopScanner);
}

export async function openBarcodeScanner({ title = '摄像头扫码', status = '请将条码放入取景框', onScan } = {}) {
  if (!window.Html5Qrcode) {
    showToast('扫码库加载失败，请检查网络后重试');
    return;
  }

  await stopScanner();

  const modal = getEl('barcodeScannerModal');
  const titleEl = getEl('barcodeScannerTitle');
  const reader = getEl('barcodeScannerReader');
  if (!modal || !reader) return;

  if (titleEl) titleEl.textContent = title;
  reader.innerHTML = '';
  modal.style.display = 'flex';
  setManualEntryVisible(false);

  pendingCallback = typeof onScan === 'function' ? onScan : null;
  if (!canUseCamera()) {
    setStatus('当前环境不能打开摄像头，请使用 HTTPS/localhost，或直接选择图片扫码');
    setManualEntryVisible(true);
    return;
  }

  setStatus('正在启动摄像头...');
  scanning = true;
  scanner = createScanner();

  const config = {
    fps: 12,
    qrbox: (viewfinderWidth, viewfinderHeight) => {
      const maxWidth = Math.max(140, viewfinderWidth - 24);
      const maxHeight = Math.max(100, viewfinderHeight - 24);
      const width = Math.min(Math.max(Math.floor(viewfinderWidth * 0.86), 180), maxWidth, 360);
      const height = Math.min(Math.max(Math.floor(viewfinderHeight * 0.42), 100), maxHeight, 180);
      return { width, height };
    },
    aspectRatio: 1.7777778
  };

  try {
    await startWithFallback(scanner, config);
    setStatus(status);
  } catch (error) {
    console.error('Camera scan failed:', error);
    await stopScanner();
    showToast('无法打开摄像头，请确认已授权并使用 HTTPS');
  }
}
