// js/uiController.js
import {
  store, ROLE_KEYS, ROLE_LABELS, ROLE_PASSWORDS,
  hasPermission, setCurrentUserRole
} from './store.js';
import { drawMap, scheduleResetView } from './canvasManager.js';
import { pushState, saveDataOnly, undo, redo, clearHistory, exportData, importData } from './areaStore.js';
import {
  renderProductGrid, refreshCurrentProductGrid, updateBatchActionBar,
  toggleSelectMode, toggleSelectAll, batchDeleteSelected, batchMoveSelected,
  setProductSelection, handleProductSelection, openProductDetail,
  getSortedFilteredProducts, toggleProductFavorite, downloadProductImage, downloadProductCsv,
  getAreaProductMatches
} from './productManager.js';
import { openMapSelect, initMapSelect, initBatchImport } from './batchImport.js';
import { showToast, genId, genAreaId, generateAreaCode, formatTimestamp } from './utils.js';

// DOM 元素引用
const canvas = document.getElementById('mapCanvas');
const modeSwitchBtn = document.getElementById('modeSwitchBtn');
const addAreaBtn = document.getElementById('addAreaBtn');
const snapBtn = document.getElementById('snapBtn');
const zoomSlider = document.getElementById('zoomSlider');
const resetViewBtn = document.getElementById('resetViewBtn');
const exportBtn = document.getElementById('exportBtn');
const importBtn = document.getElementById('importBtn');
const searchBtn = document.getElementById('searchBtn');
const searchInput = document.getElementById('searchInput');
const orientationBtn = document.getElementById('orientationBtn');
const desktopModeBtn = document.getElementById('desktopModeBtn');
const productsModal = document.getElementById('productsModal');
const areaMenuModal = document.getElementById('areaMenuModal');
const editAreaModal = document.getElementById('editAreaModal');
const productGrid = document.getElementById('productGrid');
const undoBtn = document.getElementById('undoBtn');
const redoBtn = document.getElementById('redoBtn');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');
const selectModeBtn = document.getElementById('selectModeBtn');
const selectAllBtn = document.getElementById('selectAllBtn');
const batchActionBar = document.getElementById('batchActionBar');
const editActionButtons = document.getElementById('editActionButtons');
const scrollToTopBtn = document.getElementById('scrollToTopBtn');
const scrollToBottomBtn = document.getElementById('scrollToBottomBtn');
const lockAreaBtn = document.getElementById('lockAreaBtn');
const unlockAreaBtn = document.getElementById('unlockAreaBtn');
const areaMultiSelectBtn = document.getElementById('areaMultiSelectBtn');
const areaCopyBtn = document.getElementById('areaCopyBtn');
const batchLockSelect = document.getElementById('batchLockSelect');
const masterTipDiv = document.getElementById('masterTip');
const areaCodeDisplay = document.getElementById('areaCodeDisplay');
const areaMenuCodeSpan = document.getElementById('areaMenuCode');
const batchMoveBtn = document.getElementById('batchMoveBtn');
const batchDeleteBtn = document.getElementById('batchDeleteBtn');
const batchStarBtn = document.getElementById('batchStarBtn');
const batchDownloadImgBtn = document.getElementById('batchDownloadImgBtn');
const batchDownloadCsvBtn = document.getElementById('batchDownloadCsvBtn');
const batchCancelBtn = document.getElementById('batchCancelBtn');
const addProductBtn = document.getElementById('addProductBtn');
const closeProductsBtn = document.getElementById('closeProductsBtn');
const productZoomSlider = document.getElementById('productZoomSlider');
const sortFieldSelect = document.getElementById('sortFieldSelect');
const sortOrderSelect = document.getElementById('sortOrderSelect');
const editAreaName = document.getElementById('editAreaName');
const editAreaColor = document.getElementById('editAreaColor');
const editTextColor = document.getElementById('editTextColor');
const editFontSize = document.getElementById('editFontSize');
const fontSizeValue = document.getElementById('fontSizeValue');
const editTextDirection = document.getElementById('editTextDirection');
const editAreaShape = document.getElementById('editAreaShape');
const editAreaWidth = document.getElementById('editAreaWidth');
const editAreaHeight = document.getElementById('editAreaHeight');
const copyAreaBtn = document.getElementById('copyAreaBtn');
const deleteAreaBtn = document.getElementById('deleteAreaBtn');
const saveAreaInfoBtn = document.getElementById('saveAreaInfoBtn');
const cancelEditAreaBtn = document.getElementById('cancelEditAreaBtn');
const editAreaBtn = document.getElementById('editAreaBtn');
const editProductsBtn = document.getElementById('editProductsBtn');
const batchImportBtn = document.getElementById('batchImportBtn');
const batchImageFromAreaBtn = document.getElementById('batchImageFromAreaBtn');
const batchImportFromProductsBtn = document.getElementById('batchImportFromProductsBtn');
const batchImageFromProductsBtn = document.getElementById('batchImageFromProductsBtn');
const closeAreaMenuBtn = document.getElementById('closeAreaMenuBtn');
const prevProductBtn = document.getElementById('prevProductBtn');
const nextProductBtn = document.getElementById('nextProductBtn');
const closeDetailBtn = document.getElementById('closeDetailBtn');
const closePreviewBtn = document.getElementById('closePreviewBtn');
const imagePreviewOverlay = document.getElementById('imagePreviewOverlay');
const addAreaHint = document.getElementById('addAreaHint');

const NO_PERMISSION_TEXT = '当前身份无权执行此操作';

function requirePermission(key) {
  if (hasPermission(key)) return true;
  showToast(NO_PERMISSION_TEXT);
  return false;
}

function isProductEditable() {
  return hasPermission('canAddProduct') || hasPermission('canEditProduct') || hasPermission('canDeleteProduct') || hasPermission('canMoveProduct');
}

function setVisible(el, visible, display = 'inline-flex') {
  if (el) el.style.display = visible ? display : 'none';
}

function openProductsForArea(area) {
  if (!area) return;
  clearSearchHighlights();
  areaMenuModal.style.display = 'none';
  store.editingProductAreaId = area.id;
  store.currentSearchFilter = '';
  document.getElementById('productsTitle').textContent = area.name + ' 路 商品陈列';
  store.productColumns = store.isDesktopMode ? 4 : 2;
  productZoomSlider.value = store.productColumns;
  store.selectMode = false;
  selectModeBtn.classList.remove('active');
  store.selectedProductIds.clear();
  store.isFullSelect = false;
  renderProductGrid(area, isProductEditable(), '');
  productsModal.style.display = 'flex';
  setTimeout(() => {
    if (!store.selectionRect) {
      store.selectionRect = document.createElement('div');
      store.selectionRect.className = 'selection-rect';
      productGrid.style.position = 'relative';
      productGrid.appendChild(store.selectionRect);
    }
  }, 100);
  setVisible(editActionButtons, isProductEditable(), 'flex');
  updateBatchActionBar();
}

export function refreshRoleUI() {
  const label = ROLE_LABELS[store.currentUserRole] || ROLE_LABELS.guest;
  if (modeSwitchBtn) modeSwitchBtn.textContent = label;

  store.currentMode = store.currentUserRole === ROLE_KEYS.DESIGNER ? 'edit' : 'browse';
  if (store.currentUserRole !== ROLE_KEYS.DESIGNER) {
    setAddAreaDragMode(false);
    store.areaMultiSelectMode = false;
    store.selectedAreaIds.clear();
    store.lastSelectedAreaId = null;
    store.masterAreaId = null;
    if (masterTipDiv) masterTipDiv.style.display = 'none';
    if (editAreaModal) editAreaModal.style.display = 'none';
    if (areaMenuModal && !isProductEditable()) areaMenuModal.style.display = 'none';
  }

  setVisible(addAreaBtn, hasPermission('canAddArea'), 'inline-block');
  setVisible(snapBtn, hasPermission('canMoveArea') || hasPermission('canResizeArea'));
  setVisible(areaMultiSelectBtn, hasPermission('canAreaMultiSelect'));
  setVisible(areaCopyBtn, hasPermission('canCopyAreaStyle'));
  setVisible(batchLockSelect, hasPermission('canLockArea') || hasPermission('canUnlockArea'));
  setVisible(importBtn, hasPermission('canImportData'), 'inline-block');
  const bannerImportBtn = document.getElementById('bannerImportBtn');
  setVisible(bannerImportBtn, hasPermission('canImportData'), 'inline-block');
  setVisible(undoBtn, hasPermission('canUndoRedo'));
  setVisible(redoBtn, hasPermission('canUndoRedo'));
  setVisible(clearHistoryBtn, hasPermission('canClearHistory'));
  setVisible(editActionButtons, productsModal?.style.display === 'flex' && isProductEditable(), 'flex');
  updateBatchActionBar();
  drawMap();
}

function chooseRole() {
  const answer = prompt('请选择角色：\n1. 游客\n2. 工作人员\n3. 设计者', store.currentUserRole === ROLE_KEYS.STAFF ? '2' : store.currentUserRole === ROLE_KEYS.DESIGNER ? '3' : '1');
  if (answer === null) return;
  const roleMap = {
    '1': ROLE_KEYS.GUEST,
    guest: ROLE_KEYS.GUEST,
    '游客': ROLE_KEYS.GUEST,
    '2': ROLE_KEYS.STAFF,
    staff: ROLE_KEYS.STAFF,
    '工作人员': ROLE_KEYS.STAFF,
    '3': ROLE_KEYS.DESIGNER,
    designer: ROLE_KEYS.DESIGNER,
    '设计者': ROLE_KEYS.DESIGNER
  };
  const role = roleMap[String(answer).trim()];
  if (!role) {
    showToast('请选择有效角色');
    return;
  }
  const password = ROLE_PASSWORDS[role];
  if (password && prompt('请输入密码') !== password) {
    showToast('密码错误');
    return;
  }
  setCurrentUserRole(role);
  refreshRoleUI();
  refreshCurrentProductGrid();
  showToast(`已切换为${ROLE_LABELS[role].replace(/^[^\s]+\s*/, '')}`);
}

function setAddAreaDragMode(enabled) {
  store.addAreaDragMode = enabled;
  store.newAreaRect = null;
  addAreaBtn.classList.toggle('active', enabled);
  if (addAreaHint) addAreaHint.classList.toggle('show', enabled);
  drawMap();
}

function setMode(mode) {
  store.currentMode = mode === 'edit' && store.currentUserRole === ROLE_KEYS.DESIGNER ? 'edit' : 'browse';
  refreshRoleUI();
  return;
  if (mode === 'edit') {
    store.currentMode = 'edit';
    modeSwitchBtn.innerHTML = '✏️ 编辑';
    addAreaBtn.style.display = 'inline-block';
    snapBtn.style.display = 'inline-flex';
    areaMultiSelectBtn.style.display = 'inline-flex';
    batchLockSelect.style.display = 'inline-flex';
    areaCopyBtn.style.display = 'inline-flex';
    if (productsModal.style.display === 'flex') editActionButtons.style.display = 'flex';
  } else {
    store.currentMode = 'browse';
    modeSwitchBtn.innerHTML = '🔍 浏览';
    addAreaBtn.style.display = 'none';
    snapBtn.style.display = 'none';
    areaMultiSelectBtn.style.display = 'none';
    batchLockSelect.style.display = 'none';
    areaCopyBtn.style.display = 'none';
    areaMenuModal.style.display = 'none';
    editAreaModal.style.display = 'none';
    setAddAreaDragMode(false);
    if (productsModal.style.display === 'flex') editActionButtons.style.display = 'none';
    if (store.areaMultiSelectMode) {
      store.areaMultiSelectMode = false;
      areaMultiSelectBtn.classList.remove('active');
      store.selectedAreaIds.clear();
      drawMap();
    }
    store.masterAreaId = null;
    masterTipDiv.style.display = 'none';
  }
}

function updateAreaMenuButtons(area) {
  setVisible(editAreaBtn, hasPermission('canEditArea'), 'block');
  setVisible(batchImportBtn, hasPermission('canBatchImportProduct'), 'block');
  setVisible(batchImageFromAreaBtn, hasPermission('canBatchImportImage'), 'block');
  if (editProductsBtn) editProductsBtn.textContent = isProductEditable() ? '📦 管理商品' : '📦 商品陈列';
  if (area && area.locked) {
    lockAreaBtn.style.display = 'none';
    unlockAreaBtn.style.display = hasPermission('canUnlockArea') ? 'block' : 'none';
  } else {
    lockAreaBtn.style.display = hasPermission('canLockArea') ? 'block' : 'none';
    unlockAreaBtn.style.display = 'none';
  }
}

async function lockArea(areaId) {
  if (!requirePermission('canLockArea')) return;
  const area = store.areas.find(a => a.id === areaId);
  if (area && !area.locked) {
    area.locked = true;
    await pushState();
    await saveDataOnly();
    drawMap();
    showToast(`已锁定区域「${area.name}」`);
  }
}

async function unlockArea(areaId) {
  if (!requirePermission('canUnlockArea')) return;
  const area = store.areas.find(a => a.id === areaId);
  if (area && area.locked) {
    area.locked = false;
    await pushState();
    await saveDataOnly();
    drawMap();
    showToast(`已解锁区域「${area.name}」`);
  }
}

function setMasterArea(areaId) {
  if (!requirePermission('canCopyAreaStyle')) return;
  if (areaId === store.masterAreaId) {
    store.masterAreaId = null;
    masterTipDiv.style.display = 'none';
    showToast('已取消样式母体');
  } else {
    store.masterAreaId = areaId;
    const area = store.areas.find(a => a.id === areaId);
    if (area) {
      masterTipDiv.textContent = `🎨 母体区域: ${area.name} (${area.code || '无编码'}) (按住 Ctrl 点击其它区域复制样式)`;
      masterTipDiv.style.display = 'block';
      showToast(`已设「${area.name}」为样式母体`);
    }
  }
}

function applyMasterStyleTo(targetAreaId) {
  if (!requirePermission('canCopyAreaStyle')) return false;
  if (!store.masterAreaId || store.masterAreaId === targetAreaId) return false;
  const source = store.areas.find(a => a.id === store.masterAreaId);
  const target = store.areas.find(a => a.id === targetAreaId);
  if (!source || !target) return false;
  target.color = source.color;
  target.textColor = source.textColor;
  target.fontSize = source.fontSize;
  target.textDirection = source.textDirection;
  target.shape = source.shape;
  target.w = source.w;
  target.h = source.h;
  pushState();
  saveDataOnly();
  drawMap();
  showToast(`已将「${source.name}」样式应用到「${target.name}」`);
  return true;
}

function handleAreaSelection(clickedAreaId, event) {
  if (!requirePermission('canAreaMultiSelect')) return false;
  if (!store.areaMultiSelectMode || store.currentMode !== 'edit') return false;
  const areaIds = store.areas.map(a => a.id);
  const clickedIndex = areaIds.indexOf(clickedAreaId);
  if (event.ctrlKey || event.metaKey) {
    if (store.selectedAreaIds.has(clickedAreaId)) store.selectedAreaIds.delete(clickedAreaId);
    else store.selectedAreaIds.add(clickedAreaId);
    store.lastSelectedAreaId = clickedAreaId;
  } else if (event.shiftKey && store.lastSelectedAreaId !== null) {
    const lastIndex = areaIds.indexOf(store.lastSelectedAreaId);
    if (lastIndex !== -1 && clickedIndex !== -1) {
      const start = Math.min(lastIndex, clickedIndex);
      const end = Math.max(lastIndex, clickedIndex);
      for (let i = start; i <= end; i++) store.selectedAreaIds.add(areaIds[i]);
    }
  } else {
    if (store.selectedAreaIds.has(clickedAreaId) && store.selectedAreaIds.size === 1) store.selectedAreaIds.delete(clickedAreaId);
    else {
      store.selectedAreaIds.clear();
      store.selectedAreaIds.add(clickedAreaId);
    }
    store.lastSelectedAreaId = clickedAreaId;
  }
  drawMap();
  return true;
}

async function createAreaFromRect(rect) {
  if (!requirePermission('canAddArea')) return;
  const newCode = generateAreaCode(store.areas);
  store.areas.push({
    id: genAreaId(),
    code: newCode,
    name: '新区域',
    x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.w), h: Math.round(rect.h),
    color: '#3498db', textColor: '#ffffff', fontSize: 14,
    textDirection: 'horizontal', shape: 'rect', products: [], locked: false
  });
  await pushState();
  await saveDataOnly();
  drawMap();
  showToast(`已添加区域，编码：${newCode}`);
}

function addArea() {
  if (!requirePermission('canAddArea')) return;
  if (store.currentMode !== 'edit') { showToast('请先进入编辑模式'); return; }
  setAddAreaDragMode(!store.addAreaDragMode);
  showToast(store.addAreaDragMode ? '在画布上拖拽拉出新区域' : '已取消添加区域');
}

function clearSearchHighlights() {
  if (store.highlightTimer) {
    clearTimeout(store.highlightTimer);
    store.highlightTimer = null;
  }
  if (store.highlightedAreaIds.size) {
    store.highlightedAreaIds.clear();
    drawMap();
  }
}

function loadSearchHistory() {
  try {
    const saved = JSON.parse(localStorage.getItem('mallSearchHistory') || '[]');
    store.searchHistory = Array.isArray(saved) ? saved.slice(0, 5) : [];
  } catch {
    store.searchHistory = [];
  }
  renderSearchHistory();
}

function renderSearchHistory() {
  const list = document.getElementById('searchHistoryList');
  if (!list) return;
  list.innerHTML = store.searchHistory.map(item => `<option value="${String(item).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]))}"></option>`).join('');
}

function rememberSearchKeyword(keyword) {
  const kw = String(keyword || '').trim();
  if (!kw) return;
  store.searchHistory = [kw, ...store.searchHistory.filter(item => item !== kw)].slice(0, 5);
  try {
    localStorage.setItem('mallSearchHistory', JSON.stringify(store.searchHistory));
  } catch {
    // 搜索历史只是便捷功能，本地存储不可用时不影响搜索。
  }
  renderSearchHistory();
}

function searchAndOpen() {
  if (!requirePermission('canSearch')) return;
  const kw = searchInput.value.trim().toLowerCase();
  if (!kw) { showToast('请输入关键词'); return; }
  rememberSearchKeyword(searchInput.value.trim());
  const matchedAreas = [];
  let matchedProductCount = 0;
  let firstProductArea = null;
  for (const area of store.areas) {
    const productMatches = getAreaProductMatches(area, kw);
    const areaMatched = String(area.name || '').toLowerCase().includes(kw)
      || String(area.code || '').toLowerCase().includes(kw);
    if (areaMatched || productMatches.length) {
      matchedAreas.push(area);
      matchedProductCount += productMatches.length;
      if (!firstProductArea && productMatches.length) firstProductArea = area;
    }
  }
  if (matchedAreas.length === 0) { showToast('未找到'); return; }
  if (store.highlightTimer) {
    clearTimeout(store.highlightTimer);
    store.highlightTimer = null;
  }
  store.highlightedAreaIds.clear();
  for (const area of matchedAreas) store.highlightedAreaIds.add(area.id);
  drawMap();
  const firstArea = firstProductArea || matchedAreas[0];
  store.offsetX = canvas.width / 2 - (firstArea.x + firstArea.w / 2) * store.scale;
  store.offsetY = canvas.height / 2 - (firstArea.y + firstArea.h / 2) * store.scale;
  drawMap();
  store.currentSearchFilter = kw;
  store.editingProductAreaId = firstArea.id;
  document.getElementById('productsTitle').textContent = firstArea.name + ' · 商品陈列';
  store.productColumns = store.isDesktopMode ? 4 : 2;
  productZoomSlider.value = store.productColumns;
  store.selectMode = false;
  selectModeBtn.classList.remove('active');
  store.selectedProductIds.clear();
  store.isFullSelect = false;
  renderProductGrid(firstArea, isProductEditable(), kw);
  productsModal.style.display = 'flex';
  setTimeout(() => {
    if (!store.selectionRect) {
      store.selectionRect = document.createElement('div');
      store.selectionRect.className = 'selection-rect';
      productGrid.style.position = 'relative';
      productGrid.appendChild(store.selectionRect);
    }
  }, 100);
  setVisible(editActionButtons, isProductEditable(), 'flex');
  updateBatchActionBar();
  showToast(`找到 ${matchedAreas.length} 个区域${matchedProductCount ? `、${matchedProductCount} 个商品` : ''}`);
}

async function batchUnlockSelected() {
  if (!requirePermission('canUnlockArea')) return;
  if (store.selectedAreaIds.size === 0) { showToast('请先选择区域'); return; }
  for (const areaId of store.selectedAreaIds) {
    const area = store.areas.find(a => a.id === areaId);
    if (area && area.locked) area.locked = false;
  }
  await pushState();
  await saveDataOnly();
  drawMap();
  showToast(`已解锁 ${store.selectedAreaIds.size} 个区域`);
}
async function batchUnlockAll() {
  if (!requirePermission('canUnlockArea')) return;
  for (const area of store.areas) area.locked = false;
  await pushState();
  await saveDataOnly();
  drawMap();
  showToast('已解锁所有区域');
}
async function batchLockSelected() {
  if (!requirePermission('canLockArea')) return;
  if (store.selectedAreaIds.size === 0) { showToast('请先选择区域'); return; }
  for (const areaId of store.selectedAreaIds) {
    const area = store.areas.find(a => a.id === areaId);
    if (area && !area.locked) area.locked = true;
  }
  await pushState();
  await saveDataOnly();
  drawMap();
  showToast(`已锁定 ${store.selectedAreaIds.size} 个区域`);
}
async function batchLockAll() {
  if (!requirePermission('canLockArea')) return;
  for (const area of store.areas) { if (!area.locked) area.locked = true; }
  await pushState();
  await saveDataOnly();
  drawMap();
  showToast('已锁定所有区域');
}

async function saveAreaInfo() {
  if (!requirePermission('canEditArea')) return;
  const a = store.areas.find(a => a.id === store.currentMenuAreaId);
  if (!a) return;
  const newName = editAreaName.value.trim();
  if (!newName) { showToast('名称不能为空'); return; }
  const newColor = editAreaColor.value;
  const newTextColor = editTextColor.value;
  const newFontSize = parseInt(editFontSize.value);
  const newTextDirection = editTextDirection.value;
  const newShape = editAreaShape.value;
  const newW = parseInt(editAreaWidth.value) || 180;
  const newH = parseInt(editAreaHeight.value) || 150;

  if (store.areaMultiSelectMode && store.selectedAreaIds.has(a.id) && store.selectedAreaIds.size > 1) {
    const scaleW = newW / a.w;
    const scaleH = newH / a.h;
    const scaleFont = newFontSize / a.fontSize;
    for (const areaId of store.selectedAreaIds) {
      const area = store.areas.find(ar => ar.id === areaId);
      if (!area) continue;
      if (areaId === a.id) {
        area.name = newName;
        area.color = newColor;
        area.textColor = newTextColor;
        area.fontSize = newFontSize;
        area.textDirection = newTextDirection;
        area.shape = newShape;
        area.w = newW;
        area.h = newH;
      } else {
        area.w = Math.max(30, Math.round(area.w * scaleW));
        area.h = Math.max(30, Math.round(area.h * scaleH));
        area.fontSize = Math.max(8, Math.round(area.fontSize * scaleFont));
        area.color = newColor;
        area.textColor = newTextColor;
        area.textDirection = newTextDirection;
        area.shape = newShape;
      }
    }
    await pushState();
    await saveDataOnly();
    drawMap();
    editAreaModal.style.display = 'none';
    showToast(`已批量更新 ${store.selectedAreaIds.size} 个区域`);
  } else {
    a.name = newName;
    a.color = newColor;
    a.textColor = newTextColor;
    a.fontSize = newFontSize;
    a.textDirection = newTextDirection;
    a.shape = newShape;
    a.w = newW;
    a.h = newH;
    await pushState();
    await saveDataOnly();
    drawMap();
    editAreaModal.style.display = 'none';
    showToast('区域已更新');
  }
}

async function copyArea() {
  if (!requirePermission('canCopyArea')) return;
  const original = store.areas.find(a => a.id === store.currentMenuAreaId);
  if (original) {
    const copy = JSON.parse(JSON.stringify(original));
    copy.id = genAreaId();
    copy.code = generateAreaCode(store.areas);
    copy.name = original.name + ' (副本)';
    copy.x = original.x + 30;
    copy.y = original.y + 30;
    copy.products = original.products.map(p => ({ ...p, id: genId(), lastModified: Date.now() }));
    store.areas.push(copy);
    await pushState();
    await saveDataOnly();
    drawMap();
    editAreaModal.style.display = 'none';
    scheduleResetView();
    showToast(`区域已复制，新编码：${copy.code}`);
  }
}

async function deleteArea() {
  if (!requirePermission('canDeleteArea')) return;
  if (!store.currentMenuAreaId) return;
  if (!confirm('确定删除此区域及所有商品？')) return;
  store.areas = store.areas.filter(a => a.id !== store.currentMenuAreaId);
  await pushState();
  await saveDataOnly();
  drawMap();
  editAreaModal.style.display = 'none';
  if (productsModal.style.display === 'flex') productsModal.style.display = 'none';
  scheduleResetView();
  showToast('区域已删除');
}

async function saveProduct() {
  if (!requirePermission(store.editingProductId ? 'canEditProduct' : 'canAddProduct')) return;
  const name = document.getElementById('productName').value.trim();
  if (!name) { showToast('商品名称不能为空'); return; }
  const area = store.areas.find(a => a.id === store.editingProductAreaId);
  if (!area) return;
  const now = Date.now();
  const productData = {
    id: store.editingProductId || genId(),
    name: name,
    barcode: document.getElementById('productBarcode').value.trim(),
    specification: document.getElementById('productSpec').value.trim(),
    unit: document.getElementById('productUnit').value.trim(),
    stock: parseInt(document.getElementById('productStock').value) || 0,
    lastModified: now,
    favorite: false
  };
  const fileInput = document.getElementById('productImage');
  const processSave = async (imageUrl = null) => {
    productData.imageDataUrl = imageUrl || '';
    if (store.editingProductId) {
      const existing = area.products.find(p => p.id === store.editingProductId);
      if (existing) {
        Object.assign(existing, productData);
        existing.lastModified = now;
      }
    } else {
      area.products.push(productData);
    }
    await pushState();
    await saveDataOnly();
    document.getElementById('productEditModal').style.display = 'none';
    store.editingProductId = null;
    refreshCurrentProductGrid();
    showToast('已保存');
  };
  if (fileInput.files && fileInput.files[0]) {
    const reader = new FileReader();
    reader.onload = e => processSave(e.target.result);
    reader.readAsDataURL(fileInput.files[0]);
  } else {
    processSave(null);
  }
}

function showPrevProduct() {
  if (store.currentDetailIndex > 0) {
    const newIndex = store.currentDetailIndex - 1;
    const newProductId = store.currentDetailProductIds[newIndex];
    openProductDetail(store.currentDetailArea, newProductId, store.currentDetailProductIds, newIndex);
  }
}
function showNextProduct() {
  if (store.currentDetailIndex < store.currentDetailProductIds.length - 1) {
    const newIndex = store.currentDetailIndex + 1;
    const newProductId = store.currentDetailProductIds[newIndex];
    openProductDetail(store.currentDetailArea, newProductId, store.currentDetailProductIds, newIndex);
  }
}

export function initUI() {
  loadSearchHistory();
  refreshRoleUI();
  // 全局关闭模态框
  document.body.addEventListener('click', (e) => {
    if (e.target.classList && e.target.classList.contains('modal-close-btn')) {
      const modal = e.target.closest('.modal-overlay');
      if (modal) modal.style.display = 'none';
    }
  });

  // 模式切换
  modeSwitchBtn.addEventListener('click', chooseRole);
  snapBtn.addEventListener('click', () => {
    store.snapEnabled = !store.snapEnabled;
    snapBtn.textContent = store.snapEnabled ? '📐 吸附开' : '📐 吸附关';
    snapBtn.classList.toggle('active', store.snapEnabled);
    showToast(store.snapEnabled ? '吸附开启' : '吸附关闭');
  });
  areaMultiSelectBtn.addEventListener('click', () => {
    if (!requirePermission('canAreaMultiSelect')) return;
    if (store.currentMode !== 'edit') { showToast('仅在编辑模式下可使用区域多选'); return; }
    store.areaMultiSelectMode = !store.areaMultiSelectMode;
    areaMultiSelectBtn.classList.toggle('active', store.areaMultiSelectMode);
    if (store.areaMultiSelectMode) batchLockSelect.style.display = 'inline-flex';
    else { batchLockSelect.style.display = 'none'; store.selectedAreaIds.clear(); store.lastSelectedAreaId = null; }
    drawMap();
    showToast(store.areaMultiSelectMode ? '区域多选模式已开启' : '已退出区域多选模式');
  });
  addAreaBtn.addEventListener('click', addArea);
  resetViewBtn.addEventListener('click', () => { scheduleResetView(); showToast('视图已重置'); });
  orientationBtn.addEventListener('click', () => { store.isLandscape = !store.isLandscape; scheduleResetView(); });
  desktopModeBtn.addEventListener('click', () => {
    store.isDesktopMode = !store.isDesktopMode;
    document.body.classList.toggle('desktop-mode', store.isDesktopMode);
    desktopModeBtn.textContent = store.isDesktopMode ? '📱' : '💻';
    store.MAX_SCALE = store.isDesktopMode ? 100 : 2.5;
    zoomSlider.max = store.MAX_SCALE;
    scheduleResetView();
  });
  zoomSlider.addEventListener('input', () => {
    let newScale = parseFloat(zoomSlider.value);
    newScale = Math.min(store.MAX_SCALE, Math.max(store.MIN_SCALE, newScale));
    if (newScale === store.scale) return;
    const cx = canvas.width / 2, cy = canvas.height / 2;
    const worldX = (cx - store.offsetX) / store.scale, worldY = (cy - store.offsetY) / store.scale;
    store.scale = newScale;
    store.offsetX = cx - worldX * store.scale;
    store.offsetY = cy - worldY * store.scale;
    drawMap();
  });
  searchBtn.addEventListener('click', searchAndOpen);
  searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') searchBtn.click(); });
  exportBtn.onclick = exportData;
  const importFileInputGlobal = document.createElement('input');
  importFileInputGlobal.type = 'file';
  importFileInputGlobal.accept = '.json';
  importFileInputGlobal.style.display = 'none';
  document.body.appendChild(importFileInputGlobal);
  importBtn.onclick = () => {
    if (!requirePermission('canImportData')) return;
    importFileInputGlobal.click();
  };
  document.getElementById('bannerImportBtn').onclick = () => {
    if (!requirePermission('canImportData')) return;
    importFileInputGlobal.click();
  };
  importFileInputGlobal.onchange = e => {
    if (e.target.files[0]) {
      importData(e.target.files[0]);
      e.target.value = '';
    }
  };
  undoBtn.addEventListener('click', () => { if (requirePermission('canUndoRedo')) undo(); });
  redoBtn.addEventListener('click', () => { if (requirePermission('canUndoRedo')) redo(); });
  clearHistoryBtn.addEventListener('click', () => {
    if (!requirePermission('canClearHistory')) return;
    if (confirm('确定清空撤回/复原历史记录吗？当前数据不会被删除。')) clearHistory();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && store.addAreaDragMode) {
      setAddAreaDragMode(false);
      showToast('已取消添加区域');
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); if (requirePermission('canUndoRedo')) undo(); }
    else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'Z' && e.shiftKey))) { e.preventDefault(); if (requirePermission('canUndoRedo')) redo(); }
  });

  // 商品陈列弹窗内部事件
  selectModeBtn.addEventListener('click', toggleSelectMode);
  selectAllBtn.addEventListener('click', toggleSelectAll);
  batchMoveBtn.addEventListener('click', batchMoveSelected);
  batchDeleteBtn.addEventListener('click', batchDeleteSelected);
  batchCancelBtn.addEventListener('click', () => {
    if (store.selectMode) toggleSelectMode();
    else { store.selectedProductIds.clear(); updateBatchActionBar(); refreshCurrentProductGrid(); }
  });
  batchStarBtn.addEventListener('click', async () => {
    if (!requirePermission('canFavoriteProduct')) return;
    if (store.selectedProductIds.size === 0) { showToast('请先选择商品'); return; }
    for (const area of store.areas) {
      for (const product of area.products) {
        if (store.selectedProductIds.has(product.id)) product.favorite = true;
      }
    }
    await saveDataOnly();
    refreshCurrentProductGrid();
    showToast(`已收藏 ${store.selectedProductIds.size} 个商品`);
  });
  batchDownloadImgBtn.addEventListener('click', async () => {
    if (!requirePermission('canDownloadProductImage')) return;
    if (store.selectedProductIds.size === 0) { showToast('请先选择商品'); return; }
    const JSZip = window.JSZip;
    const zip = new JSZip();
    let count = 0;
    for (const area of store.areas) {
      for (const product of area.products) {
        if (store.selectedProductIds.has(product.id) && product.imageDataUrl && product.imageDataUrl.startsWith('data:image')) {
          const base64Data = product.imageDataUrl.split(',')[1];
          if (base64Data) {
            zip.file(`${product.name || product.id}.png`, base64Data, { base64: true });
            count++;
          }
        }
      }
    }
    if (count === 0) { showToast('所选商品无图片'); return; }
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `商品图片_${new Date().toISOString().slice(0, 10)}.zip`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`已下载 ${count} 张图片`);
  });
  batchDownloadCsvBtn.addEventListener('click', () => {
    if (!requirePermission('canDownloadProductCsv')) return;
    if (store.selectedProductIds.size === 0) { showToast('请先选择商品'); return; }
    const products = [];
    for (const area of store.areas) {
      for (const product of area.products) {
        if (store.selectedProductIds.has(product.id)) {
          products.push({
            区域: area.name,
            商品名称: product.name,
            条码: product.barcode || '',
            规格: product.specification || '',
            单位: product.unit || '',
            库存: product.stock || 0,
            最后修改: formatTimestamp(product.lastModified),
            是否收藏: product.favorite ? '是' : '否'
          });
        }
      }
    }
    const headers = ['区域', '商品名称', '条码', '规格', '单位', '库存', '最后修改', '是否收藏'];
    const rows = products.map(p => headers.map(h => p[h] || '').join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `商品列表_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`已导出 ${products.length} 个商品`);
  });
  addProductBtn.addEventListener('click', () => {
    if (!requirePermission('canAddProduct')) return;
    store.editingProductId = null;
    document.getElementById('productEditTitle').textContent = '添加商品';
    document.getElementById('productName').value = '';
    document.getElementById('productBarcode').value = '';
    document.getElementById('productSpec').value = '';
    document.getElementById('productUnit').value = '';
    document.getElementById('productStock').value = '0';
    document.getElementById('productImage').value = '';
    document.getElementById('productLastModified').textContent = '保存后自动生成';
    document.getElementById('productEditModal').style.display = 'flex';
  });
  document.getElementById('cancelProductBtn').addEventListener('click', () => document.getElementById('productEditModal').style.display = 'none');
  document.getElementById('saveProductBtn').addEventListener('click', saveProduct);
  closeProductsBtn.addEventListener('click', () => {
    productsModal.style.display = 'none';
    if (store.selectMode) {
      store.selectMode = false;
      selectModeBtn.classList.remove('active');
      store.selectedProductIds.clear();
      store.isFullSelect = false;
      updateBatchActionBar();
    }
  });
  productZoomSlider.addEventListener('input', e => {
    store.productColumns = parseInt(e.target.value);
    refreshCurrentProductGrid();
  });
  sortFieldSelect.addEventListener('change', e => {
    store.currentSortField = e.target.value;
    refreshCurrentProductGrid();
  });
  sortOrderSelect.addEventListener('change', e => {
    store.currentSortOrder = e.target.value;
    refreshCurrentProductGrid();
  });
  scrollToTopBtn.addEventListener('click', () => { if (productGrid) productGrid.scrollTop = 0; });
  scrollToBottomBtn.addEventListener('click', () => { if (productGrid) productGrid.scrollTop = productGrid.scrollHeight; });

  // 商品网格点击委托
  productGrid.addEventListener('click', (e) => {
    const card = e.target.closest('.product-card');
    if (!card) return;
    const pid = card.dataset.prodId;
    const area = store.areas.find(a => a.id === store.editingProductAreaId);
    if (!area) return;
    const product = area.products.find(p => p.id === pid);
    if (!product) return;
    if (e.target.classList.contains('edit-prod-btn')) {
      if (!requirePermission('canEditProduct')) return;
      store.editingProductId = pid;
      document.getElementById('productEditTitle').textContent = '编辑商品';
      document.getElementById('productName').value = product.name || '';
      document.getElementById('productBarcode').value = product.barcode || '';
      document.getElementById('productSpec').value = product.specification || '';
      document.getElementById('productUnit').value = product.unit || '';
      document.getElementById('productStock').value = product.stock || 0;
      document.getElementById('productImage').value = '';
      document.getElementById('productLastModified').textContent = formatTimestamp(product.lastModified);
      document.getElementById('productEditModal').style.display = 'flex';
    } else if (e.target.classList.contains('del-prod-btn')) {
      if (!requirePermission('canDeleteProduct')) return;
      if (confirm('确定删除该商品？')) {
        area.products = area.products.filter(p => p.id !== pid);
        pushState();
        saveDataOnly();
        renderProductGrid(area, isProductEditable(), store.currentSearchFilter);
        showToast('已删除');
      }
    } else if (e.target.classList.contains('move-prod-btn')) {
      if (!requirePermission('canMoveProduct')) return;
      openMapSelect(store.editingProductAreaId, [product]);
    } else if (e.target.classList.contains('favorite-prod-btn')) {
      toggleProductFavorite(area, product);
    } else if (e.target.classList.contains('download-img-prod-btn')) {
      downloadProductImage(product);
    } else if (e.target.classList.contains('download-csv-prod-btn')) {
      downloadProductCsv(area, product);
    } else if (store.selectMode) {
      handleProductSelection(area, pid, e);
    } else if (!store.selectMode) {
      const list = getSortedFilteredProducts(area, store.currentSearchFilter);
      const productIds = list.map(p => p.id);
      const index = productIds.indexOf(pid);
      openProductDetail(area, pid, productIds, index);
    }
  });
  productGrid.addEventListener('change', (e) => {
    if (e.target.classList.contains('product-checkbox')) {
      const card = e.target.closest('.product-card');
      if (card) {
        const pid = card.dataset.prodId;
        const area = store.areas.find(a => a.id === store.editingProductAreaId);
        if (area && pid) {
          setProductSelection(pid, e.target.checked, true);
        }
      }
    }
  });

  // 商品详情弹窗
  if (prevProductBtn) prevProductBtn.addEventListener('click', showPrevProduct);
  if (nextProductBtn) nextProductBtn.addEventListener('click', showNextProduct);
  if (closeDetailBtn) closeDetailBtn.addEventListener('click', () => productDetailModal.style.display = 'none');
  if (closePreviewBtn) closePreviewBtn.addEventListener('click', () => imagePreviewOverlay.style.display = 'none');
  if (imagePreviewOverlay) imagePreviewOverlay.addEventListener('click', (e) => {
    if (e.target === imagePreviewOverlay) imagePreviewOverlay.style.display = 'none';
  });

  // 区域菜单弹窗
  closeAreaMenuBtn.addEventListener('click', () => areaMenuModal.style.display = 'none');
  editAreaBtn.addEventListener('click', () => {
    if (!requirePermission('canEditArea')) return;
    const a = store.areas.find(a => a.id === store.currentMenuAreaId);
    if (a) {
      areaCodeDisplay.textContent = a.code || '未分配';
      editAreaName.value = a.name;
      editAreaColor.value = a.color;
      editTextColor.value = a.textColor || '#ffffff';
      editFontSize.value = a.fontSize || 14;
      fontSizeValue.textContent = (a.fontSize || 14) + 'px';
      const dir = a.textDirection || 'horizontal';
      editTextDirection.value = dir;
      document.querySelectorAll('.direction-option').forEach(opt => {
        if (opt.dataset.dir === dir) opt.classList.add('selected');
        else opt.classList.remove('selected');
      });
      editAreaShape.value = a.shape || 'rect';
      editAreaWidth.value = a.w;
      editAreaHeight.value = a.h;
      areaMenuModal.style.display = 'none';
      editAreaModal.style.display = 'flex';
    }
  });
  editProductsBtn.addEventListener('click', () => {
    if (!requirePermission('canBrowseArea')) return;
    const a = store.areas.find(a => a.id === store.currentMenuAreaId);
    if (a) {
      clearSearchHighlights();
      areaMenuModal.style.display = 'none';
      store.editingProductAreaId = a.id;
      store.currentSearchFilter = '';
      document.getElementById('productsTitle').textContent = a.name + ' · 商品陈列';
      store.productColumns = store.isDesktopMode ? 4 : 2;
      productZoomSlider.value = store.productColumns;
      store.selectMode = false;
      selectModeBtn.classList.remove('active');
      store.selectedProductIds.clear();
      store.isFullSelect = false;
      renderProductGrid(a, isProductEditable(), '');
      productsModal.style.display = 'flex';
      setTimeout(() => {
        if (!store.selectionRect) {
          store.selectionRect = document.createElement('div');
          store.selectionRect.className = 'selection-rect';
          productGrid.style.position = 'relative';
          productGrid.appendChild(store.selectionRect);
        }
      }, 100);
      setVisible(editActionButtons, isProductEditable(), 'flex');
      updateBatchActionBar();
    }
  });
  lockAreaBtn.addEventListener('click', () => { if (store.currentMenuAreaId) { lockArea(store.currentMenuAreaId); areaMenuModal.style.display = 'none'; } });
  unlockAreaBtn.addEventListener('click', () => { if (store.currentMenuAreaId) { unlockArea(store.currentMenuAreaId); areaMenuModal.style.display = 'none'; } });

  // 编辑区域弹窗
  cancelEditAreaBtn.addEventListener('click', () => editAreaModal.style.display = 'none');
  saveAreaInfoBtn.addEventListener('click', saveAreaInfo);
  copyAreaBtn.addEventListener('click', copyArea);
  deleteAreaBtn.addEventListener('click', deleteArea);
  document.querySelectorAll('.direction-option').forEach(opt => {
    opt.addEventListener('click', () => {
      document.querySelectorAll('.direction-option').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      editTextDirection.value = opt.dataset.dir;
    });
  });
  editFontSize.addEventListener('input', () => { fontSizeValue.textContent = editFontSize.value + 'px'; });

  // 批量区域锁操作
  batchLockSelect.addEventListener('change', (e) => {
    if (!hasPermission('canLockArea') && !hasPermission('canUnlockArea')) {
      showToast(NO_PERMISSION_TEXT);
      batchLockSelect.value = '';
      return;
    }
    const val = e.target.value;
    if (!val) return;
    if (val === 'unlockSelected') batchUnlockSelected();
    else if (val === 'unlockAll') batchUnlockAll();
    else if (val === 'lockSelected') batchLockSelected();
    else if (val === 'lockAll') batchLockAll();
    batchLockSelect.value = '';
  });

  areaCopyBtn.addEventListener('click', () => {
    if (!requirePermission('canCopyAreaStyle')) return;
    alert('🎨 样式复制功能：\n\n按住 Alt 键点击一个区域，可将其设为“样式母体”（屏幕底部会显示提示）。\n然后按住 Ctrl 键点击其他区域，即可将母体的背景颜色、文字颜色、字体大小、文字方向、形状、宽度和高度复制到目标区域。\n\n再次 Alt 点击同一区域可取消母体。');
  });

  // 自定义事件
  window.addEventListener('setMasterArea', (e) => setMasterArea(e.detail.areaId));
  window.addEventListener('applyMasterStyle', (e) => applyMasterStyleTo(e.detail.targetId));
  window.addEventListener('handleAreaSelection', (e) => handleAreaSelection(e.detail.areaId, e.detail.event));
  window.addEventListener('createAreaFromRect', (e) => {
    setAddAreaDragMode(false);
    createAreaFromRect(e.detail.rect);
  });
  window.addEventListener('openAreaMenu', (e) => {
    const area = store.areas.find(a => a.id === e.detail.areaId);
    if (area) {
      if (!hasPermission('canEditArea')) {
        openProductsForArea(area);
        return;
      }
      store.currentMenuAreaId = area.id;
      document.getElementById('areaMenuTitle').textContent = area.name;
      areaMenuCodeSpan.textContent = `编号：${area.code || '未分配'}`;
      updateAreaMenuButtons(area);
      areaMenuModal.style.display = 'flex';
    }
  });
  window.addEventListener('openProducts', (e) => {
    const area = store.areas.find(a => a.id === e.detail.areaId);
    if (area) {
      if (!requirePermission('canBrowseArea')) return;
      clearSearchHighlights();
      store.editingProductAreaId = area.id;
      store.currentSearchFilter = '';
      document.getElementById('productsTitle').textContent = area.name + ' · 商品陈列';
      store.productColumns = store.isDesktopMode ? 4 : 2;
      productZoomSlider.value = store.productColumns;
      store.selectMode = false;
      selectModeBtn.classList.remove('active');
      store.selectedProductIds.clear();
      store.isFullSelect = false;
      renderProductGrid(area, isProductEditable(), '');
      productsModal.style.display = 'flex';
      setTimeout(() => {
        if (!store.selectionRect) {
          store.selectionRect = document.createElement('div');
          store.selectionRect.className = 'selection-rect';
          productGrid.style.position = 'relative';
          productGrid.appendChild(store.selectionRect);
        }
      }, 100);
      setVisible(editActionButtons, isProductEditable(), 'flex');
      updateBatchActionBar();
    }
  });
  window.addEventListener('pushState', pushState);
  window.addEventListener('refreshProductGrid', refreshCurrentProductGrid);
  window.addEventListener('toggleSelectMode', toggleSelectMode);

  // 批量导入按钮
  if (batchImportBtn) batchImportBtn.addEventListener('click', () => {
    if (!requirePermission('canBatchImportProduct')) return;
    if (store.currentMenuAreaId) {
      store.pendingBatchAreaId = store.currentMenuAreaId;
      document.getElementById('batchImportModal').style.display = 'flex';
    }
  });
  if (batchImageFromAreaBtn) batchImageFromAreaBtn.addEventListener('click', () => {
    if (!requirePermission('canBatchImportImage')) return;
    if (store.currentMenuAreaId) {
      store.pendingBatchAreaId = store.currentMenuAreaId;
      document.getElementById('batchImageModal').style.display = 'flex';
    }
  });
  if (batchImportFromProductsBtn) batchImportFromProductsBtn.addEventListener('click', () => {
    if (!requirePermission('canBatchImportProduct')) return;
    if (store.editingProductAreaId) {
      store.pendingBatchAreaId = store.editingProductAreaId;
      document.getElementById('batchImportModal').style.display = 'flex';
    }
  });
  if (batchImageFromProductsBtn) batchImageFromProductsBtn.addEventListener('click', () => {
    if (!requirePermission('canBatchImportImage')) return;
    if (store.editingProductAreaId) {
      store.pendingBatchAreaId = store.editingProductAreaId;
      document.getElementById('batchImageModal').style.display = 'flex';
    }
  });

  initMapSelect();
  initBatchImport();

  // 公告关闭
  const annOverlay = document.getElementById('announcementOverlay');
  document.getElementById('btnAcknowledge').onclick = () => annOverlay.style.display = 'none';
  document.getElementById('btnCloseAnnounce').onclick = () => annOverlay.style.display = 'none';
  annOverlay.onclick = (e) => { if (e.target === annOverlay) annOverlay.style.display = 'none'; };
}
