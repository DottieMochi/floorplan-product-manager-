// js/batchImport.js
import { store, hasPermission } from './store.js';
import { showToast, genId } from './utils.js';
import { pushState, saveDataOnly } from './areaStore.js';
import { refreshCurrentProductGrid, toggleSelectMode } from './productManager.js';

let mapSelectOverlay, mapSelectCanvas, mapSelectCtx;
let pendingMoveProducts = [], pendingSourceAreaId = null;
const NO_PERMISSION_TEXT = '当前身份无权执行此操作';

function requirePermission(key) {
  if (hasPermission(key)) return true;
  showToast(NO_PERMISSION_TEXT);
  return false;
}

export function initMapSelect() {
  mapSelectOverlay = document.getElementById('mapSelectOverlay');
  mapSelectCanvas = document.getElementById('mapSelectCanvas');
  if (mapSelectCanvas) mapSelectCtx = mapSelectCanvas.getContext('2d');
  const closeBtn = document.getElementById('closeMapSelectBtn');
  if (closeBtn) closeBtn.addEventListener('click', closeMapSelect);
  if (mapSelectOverlay) mapSelectOverlay.addEventListener('click', (e) => { if (e.target === mapSelectOverlay) closeMapSelect(); });
  if (mapSelectCanvas) mapSelectCanvas.addEventListener('click', onMapSelectClick);
  window.addEventListener('resize', () => { if (mapSelectOverlay?.style.display === 'flex') resizeMapSelectCanvas(); });
}

function resizeMapSelectCanvas() {
  const wrapper = document.querySelector('#mapSelectOverlay .map-canvas-wrapper');
  if (!wrapper) return;
  const w = wrapper.clientWidth - 20, h = wrapper.clientHeight - 20;
  mapSelectCanvas.width = Math.max(400, w);
  mapSelectCanvas.height = Math.max(300, h);
  drawMapSelect();
}

function drawMapSelect() {
  if (!mapSelectCanvas.width || !mapSelectCanvas.height) return;
  mapSelectCtx.clearRect(0, 0, mapSelectCanvas.width, mapSelectCanvas.height);
  const areas = store.areas;
  if (!areas.length) return;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  areas.forEach(a => {
    minX = Math.min(minX, a.x);
    minY = Math.min(minY, a.y);
    maxX = Math.max(maxX, a.x + a.w);
    maxY = Math.max(maxY, a.y + a.h);
  });
  const worldW = maxX - minX || 100, worldH = maxY - minY || 100;
  let selectScaleX = (mapSelectCanvas.width - 40) / worldW, selectScaleY = (mapSelectCanvas.height - 40) / worldH;
  let selectScale = Math.min(selectScaleX, selectScaleY, 3);
  selectScale = Math.max(0.2, selectScale);
  const selectOffsetX = mapSelectCanvas.width / 2 - (minX + maxX) / 2 * selectScale;
  const selectOffsetY = mapSelectCanvas.height / 2 - (minY + maxY) / 2 * selectScale;
  mapSelectCtx.save();
  mapSelectCtx.translate(selectOffsetX, selectOffsetY);
  mapSelectCtx.scale(selectScale, selectScale);
  const worldLeft = -selectOffsetX / selectScale, worldTop = -selectOffsetY / selectScale;
  mapSelectCtx.strokeStyle = '#ddd';
  mapSelectCtx.lineWidth = 1 / selectScale;
  const grid = 40;
  for (let i = Math.floor(worldLeft / grid) * grid; i <= worldLeft + mapSelectCanvas.width / selectScale + grid; i += grid) {
    mapSelectCtx.beginPath();
    mapSelectCtx.moveTo(i, worldTop);
    mapSelectCtx.lineTo(i, worldTop + mapSelectCanvas.height / selectScale);
    mapSelectCtx.stroke();
  }
  for (let j = Math.floor(worldTop / grid) * grid; j <= worldTop + mapSelectCanvas.height / selectScale + grid; j += grid) {
    mapSelectCtx.beginPath();
    mapSelectCtx.moveTo(worldLeft, j);
    mapSelectCtx.lineTo(worldLeft + mapSelectCanvas.width / selectScale, j);
    mapSelectCtx.stroke();
  }
  areas.forEach(a => {
    mapSelectCtx.fillStyle = a.color;
    mapSelectCtx.fillRect(a.x, a.y, a.w, a.h);
    mapSelectCtx.strokeStyle = a.locked ? '#888' : '#333';
    mapSelectCtx.lineWidth = 2 / selectScale;
    mapSelectCtx.strokeRect(a.x, a.y, a.w, a.h);
    mapSelectCtx.fillStyle = '#fff';
    mapSelectCtx.font = `bold ${14 / selectScale}px "Microsoft YaHei"`;
    mapSelectCtx.textAlign = 'center';
    mapSelectCtx.textBaseline = 'middle';
    mapSelectCtx.fillText(a.name, a.x + a.w / 2, a.y + a.h / 2);
    if (a.locked) {
      mapSelectCtx.font = `${12 / selectScale}px "Microsoft YaHei"`;
      mapSelectCtx.fillStyle = '#888';
      mapSelectCtx.fillText('🔒', a.x + 5 / selectScale, a.y + a.h - 5 / selectScale);
    }
  });
  mapSelectCtx.restore();
}

export function openMapSelect(areaId, products) {
  if (!requirePermission('canMoveProduct')) return;
  pendingSourceAreaId = areaId;
  pendingMoveProducts = products;
  setTimeout(() => resizeMapSelectCanvas(), 50);
  mapSelectOverlay.style.display = 'flex';
}

export function closeMapSelect() {
  mapSelectOverlay.style.display = 'none';
  pendingMoveProducts = [];
  pendingSourceAreaId = null;
}

async function onMapSelectClick(e) {
  if (!requirePermission('canMoveProduct')) {
    closeMapSelect();
    return;
  }
  const rect = mapSelectCanvas.getBoundingClientRect();
  const scaleX = mapSelectCanvas.width / rect.width, scaleY = mapSelectCanvas.height / rect.height;
  let canvasX = (e.clientX - rect.left) * scaleX, canvasY = (e.clientY - rect.top) * scaleY;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  store.areas.forEach(a => {
    minX = Math.min(minX, a.x);
    minY = Math.min(minY, a.y);
    maxX = Math.max(maxX, a.x + a.w);
    maxY = Math.max(maxY, a.y + a.h);
  });
  const worldW = maxX - minX || 100, worldH = maxY - minY || 100;
  let selectScaleX = (mapSelectCanvas.width - 40) / worldW, selectScaleY = (mapSelectCanvas.height - 40) / worldH;
  let selectScale = Math.min(selectScaleX, selectScaleY, 3);
  selectScale = Math.max(0.2, selectScale);
  const selectOffsetX = mapSelectCanvas.width / 2 - (minX + maxX) / 2 * selectScale;
  const selectOffsetY = mapSelectCanvas.height / 2 - (minY + maxY) / 2 * selectScale;
  const worldX = (canvasX - selectOffsetX) / selectScale, worldY = (canvasY - selectOffsetY) / selectScale;
  const target = store.areas.find(a => worldX >= a.x && worldX <= a.x + a.w && worldY >= a.y && worldY <= a.y + a.h);
  if (target && target.id !== pendingSourceAreaId) {
    const source = store.areas.find(a => a.id === pendingSourceAreaId);
    if (source && pendingMoveProducts.length) {
      for (const product of pendingMoveProducts) {
        product.lastModified = Date.now();
        target.products.push(product);
      }
      source.products = source.products.filter(p => !pendingMoveProducts.includes(p));
      await pushState();
      await saveDataOnly();
      showToast(`移动 ${pendingMoveProducts.length} 个商品到「${target.name}」`);
      closeMapSelect();
      if (store.editingProductAreaId === pendingSourceAreaId) {
        store.selectedProductIds.clear();
        if (store.selectMode) toggleSelectMode();
        refreshCurrentProductGrid();
      }
    }
  } else if (target && target.id === pendingSourceAreaId) {
    showToast('不能移动到同一区域');
  }
}

// 批量导入商品
let currentHeaders = [], currentDataRows = [];
const mapNameCol = document.getElementById('mapNameCol');
const mapBarcodeCol = document.getElementById('mapBarcodeCol');
const mapSpecCol = document.getElementById('mapSpecCol');
const mapUnitCol = document.getElementById('mapUnitCol');
const mapStockCol = document.getElementById('mapStockCol');

async function loadExcelAndShowMapping(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = function(e) {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });
      if (!rows || rows.length < 2) { reject(new Error('文件至少需要2行数据')); return; }
      let headerRowIndex = -1, headerRow = null;
      for (let i = 0; i < Math.min(20, rows.length); i++) {
        const row = rows[i];
        if (!row) continue;
        const rowStr = row.map(cell => String(cell || '').toLowerCase()).join(' ');
        if (rowStr.includes('规格')) {
          headerRowIndex = i; headerRow = row; break;
        }
      }
      if (headerRowIndex === -1) {
        for (let i = 0; i < rows.length; i++) {
          if (rows[i] && rows[i].some(cell => cell && String(cell).trim())) {
            headerRowIndex = i; headerRow = rows[i]; break;
          }
        }
      }
      if (!headerRow) { reject(new Error('未找到表头行')); return; }
      currentHeaders = headerRow.map((h, idx) => h ? String(h).trim() : `列${idx + 1}`);
      currentDataRows = [];
      for (let i = headerRowIndex + 1; i < rows.length; i++) {
        const row = rows[i];
        if (row && row.some(cell => cell && String(cell).trim())) currentDataRows.push(row);
      }
      const optionsHtml = '<option value="-1">-- 不导入 --</option>'
        + currentHeaders.map((h, idx) => `<option value="${idx}">${h}</option>`).join('');
      [mapNameCol, mapBarcodeCol, mapSpecCol, mapUnitCol, mapStockCol].forEach(select => {
        select.innerHTML = optionsHtml;
      });
      const autoMatch = (select, keywords) => {
        for (let i = 0; i < currentHeaders.length; i++) {
          const h = currentHeaders[i].toLowerCase();
          for (const kw of keywords) if (h === kw || h.includes(kw)) { select.value = i; return; }
        }
      };
      autoMatch(mapNameCol, ['商品名称', '产品名称', '品名', '名称', 'name']);
      autoMatch(mapBarcodeCol, ['条形码', '条码', 'barcode']);
      autoMatch(mapSpecCol, ['规格', 'spec']);
      autoMatch(mapUnitCol, ['单位', 'unit']);
      autoMatch(mapStockCol, ['数量', '库存', 'stock']);
      document.getElementById('fieldMapping').style.display = 'block';
      resolve();
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

export function initBatchImport() {
  const batchImportModal = document.getElementById('batchImportModal');
  const batchImageModal = document.getElementById('batchImageModal');
  const cancelBatch = document.getElementById('cancelBatchBtn');
  const cancelImage = document.getElementById('cancelImageBtn');
  const previewBatch = document.getElementById('previewBatchBtn');
  const confirmBatch = document.getElementById('confirmBatchBtn');
  const previewImage = document.getElementById('previewImageBtn');
  const confirmImage = document.getElementById('confirmImageBtn');
  
  if (cancelBatch) cancelBatch.addEventListener('click', () => {
    batchImportModal.style.display = 'none';
    document.getElementById('excelFileInput').value = '';
    document.getElementById('batchPreview').style.display = 'none';
    document.getElementById('fieldMapping').style.display = 'none';
    store.currentParsedProducts = null;
  });
  if (cancelImage) cancelImage.addEventListener('click', () => {
    batchImageModal.style.display = 'none';
    document.getElementById('imageFileInput').value = '';
    store.currentImagePreviewData = [];
  });
  if (previewBatch) previewBatch.addEventListener('click', async () => {
    const file = document.getElementById('excelFileInput').files[0];
    if (!file) { showToast('请选择Excel文件'); return; }
    try {
      await loadExcelAndShowMapping(file);
      const nameCol = parseInt(mapNameCol.value);
      if (nameCol === -1) { showToast('请选择商品名称列'); return; }
      const barcodeCol = parseInt(mapBarcodeCol.value);
      const specCol = parseInt(mapSpecCol.value);
      const unitCol = parseInt(mapUnitCol.value);
      const stockCol = parseInt(mapStockCol.value);
      const products = [];
      for (const row of currentDataRows) {
        const name = row[nameCol] ? String(row[nameCol]).trim() : '';
        if (!name) continue;
        products.push({
          id: genId(),
          name: name,
          barcode: barcodeCol !== -1 ? (row[barcodeCol] ? String(row[barcodeCol]).trim() : '') : '',
          specification: specCol !== -1 ? (row[specCol] ? String(row[specCol]).trim() : '') : '',
          unit: unitCol !== -1 ? (row[unitCol] ? String(row[unitCol]).trim() : '') : '',
          stock: stockCol !== -1 ? (parseInt(row[stockCol]) || 0) : 0,
          imageDataUrl: '',
          lastModified: Date.now(),
          favorite: false
        });
      }
      if (products.length) {
        store.currentParsedProducts = products;
        showToast(`预览成功，共${products.length}条商品`);
        const previewDiv = document.getElementById('batchPreview');
        previewDiv.innerHTML = `<strong>预览(前10条)</strong><br>${products.slice(0,10).map(p=>p.name).join('<br>')}`;
        previewDiv.style.display = 'block';
      } else {
        showToast('无有效商品');
      }
    } catch(e) { showToast('解析失败：'+e.message); }
  });
  if (confirmBatch) confirmBatch.addEventListener('click', async () => {
    if (!requirePermission('canBatchImportProduct')) return;
    if (!store.currentParsedProducts || !store.currentParsedProducts.length) { showToast('请先预览'); return; }
    const area = store.areas.find(a => a.id === store.pendingBatchAreaId);
    if (!area) { showToast('区域不存在'); return; }
    let added = 0;
    for (const np of store.currentParsedProducts) {
      if (!area.products.some(p => p.name === np.name && p.barcode === np.barcode)) {
        area.products.push(np);
        added++;
      }
    }
    await pushState();
    await saveDataOnly();
    refreshCurrentProductGrid();
    showToast(`导入完成，新增 ${added} 个商品`);
    batchImportModal.style.display = 'none';
    document.getElementById('excelFileInput').value = '';
    document.getElementById('batchPreview').style.display = 'none';
    document.getElementById('fieldMapping').style.display = 'none';
    store.currentParsedProducts = null;
  });
  if (previewImage) previewImage.addEventListener('click', async () => {
    const files = Array.from(document.getElementById('imageFileInput').files);
    if (files.length === 0) { showToast('请先选择图片文件'); return; }
    const area = store.areas.find(a => a.id === store.pendingBatchAreaId);
    if (!area) { showToast('目标区域不存在'); return; }
    const barcodeMap = new Map();
    area.products.forEach(product => { if (product.barcode) barcodeMap.set(product.barcode, product); });
    const previewData = [];
    for (const file of files) {
      let fileName = file.name;
      const lastDot = fileName.lastIndexOf('.');
      let barcode = lastDot > 0 ? fileName.substring(0, lastDot) : fileName;
      barcode = barcode.trim();
      const product = barcodeMap.get(barcode);
      const imageDataUrl = await readFileAsDataURL(file);
      previewData.push({ file, barcode, product, imageDataUrl, status: product ? 'success' : 'fail' });
    }
    store.currentImagePreviewData = previewData;
    showToast(`匹配到 ${previewData.filter(d=>d.status==='success').length} 张图片，共${previewData.length}张`);
  });
  if (confirmImage) confirmImage.addEventListener('click', async () => {
    if (!requirePermission('canBatchImportImage')) return;
    if (!store.currentImagePreviewData || !store.currentImagePreviewData.length) { showToast('请先预览图片'); return; }
    const area = store.areas.find(a => a.id === store.pendingBatchAreaId);
    if (!area) { showToast('目标区域不存在'); return; }
    let success = 0;
    for (const item of store.currentImagePreviewData) {
      if (item.status === 'success' && item.product) {
        item.product.imageDataUrl = item.imageDataUrl;
        item.product.lastModified = Date.now();
        success++;
      }
    }
    await saveDataOnly();
    refreshCurrentProductGrid();
    showToast(`✅ 成功导入 ${success} 张图片 | ❌ 失败: ${store.currentImagePreviewData.length - success}`);
    batchImageModal.style.display = 'none';
    document.getElementById('imageFileInput').value = '';
    store.currentImagePreviewData = [];
  });
}

async function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
