// js/productManager.js
import { store, hasPermission } from './store.js';
import { showToast, formatTimestamp } from './utils.js';
import { pushState, saveDataOnly } from './areaStore.js';
import { openMapSelect } from './batchImport.js';

let productGrid, selectionRect, detailModal;
let batchRefs = null;
const DEFAULT_PRODUCT_IMAGE = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Crect fill=%22%23ddd%22 width=%22100%22 height=%22100%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 dy=%22.3em%22 fill=%22%23999%22 font-size=%2214%22%3E无图%3C/text%3E%3C/svg%3E';
const productSearchCache = new WeakMap();
const VIRTUAL_SCROLL_THRESHOLD = 200;
const VIRTUAL_OVERSCAN_ROWS = 3;
const FALLBACK_NORMAL_ROW_HEIGHT = 236;
const FALLBACK_SEARCH_ROW_HEIGHT = 286;
const measuredVirtualRowHeights = new Map();
let virtualState = null;
let virtualScrollFrame = null;
let refreshFrame = null;

const NO_PERMISSION_TEXT = '当前身份无权执行此操作';

function requirePermission(key) {
  if (hasPermission(key)) return true;
  showToast(NO_PERMISSION_TEXT);
  return false;
}

function canManageProducts() {
  return hasPermission('canAddProduct') || hasPermission('canEditProduct') || hasPermission('canDeleteProduct') || hasPermission('canMoveProduct');
}

function normalizeSearchText(value) {
  return String(value ?? '').toLowerCase();
}

function getProductSearchFields(product) {
  return [
    { key: 'name', label: '名称', value: product.name || '' },
    { key: 'barcode', label: '条码', value: product.barcode || '' },
    { key: 'specification', label: '规格', value: product.specification || '' },
    { key: 'unit', label: '单位', value: product.unit || '' },
    { key: 'stock', label: '库存', value: product.stock ?? '' }
  ];
}

function getProductSearchText(product) {
  const signature = [
    product.name || '',
    product.barcode || '',
    product.specification || '',
    product.unit || '',
    product.stock ?? ''
  ].join('\u0001');
  const cached = productSearchCache.get(product);
  if (cached && cached.signature === signature) return cached.text;
  const text = normalizeSearchText(signature);
  productSearchCache.set(product, { signature, text });
  return text;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function createSearchContext(filter) {
  if (filter && typeof filter === 'object' && 'term' in filter) return filter;
  const raw = String(filter || '').trim();
  return {
    raw,
    term: normalizeSearchText(raw),
    re: raw ? new RegExp(`(${escapeRegExp(raw)})`, 'gi') : null
  };
}

function highlightText(value, filter) {
  const text = String(value ?? '');
  const search = createSearchContext(filter);
  if (!search.raw || !search.re) return escapeHtml(text);
  return escapeHtml(text).replace(search.re, '<mark class="search-mark">$1</mark>');
}

export function productMatchesSearch(product, filter) {
  const search = createSearchContext(filter);
  if (!search.term) return true;
  return getProductSearchText(product).includes(search.term);
}

export function areaMatchesSearch(area, filter) {
  const search = createSearchContext(filter);
  if (!search.term) return true;
  const areaFields = [area.name || '', area.code || ''];
  return areaFields.some(value => normalizeSearchText(value).includes(search.term))
    || (area.products || []).some(product => productMatchesSearch(product, search));
}

export function getAreaProductMatches(area, filter) {
  const search = createSearchContext(filter);
  if (!search.term) return [...(area.products || [])];
  return (area.products || []).filter(product => productMatchesSearch(product, search));
}

function getMatchedProductFields(product, filter) {
  const search = createSearchContext(filter);
  if (!search.term) return [];
  return getProductSearchFields(product)
    .filter(field => normalizeSearchText(field.value).includes(search.term));
}

export function initProductManager() {
  productGrid = document.getElementById('productGrid');
  if (productGrid) {
    selectionRect = document.createElement('div');
    selectionRect.className = 'selection-rect';
    productGrid.style.position = 'relative';
    productGrid.appendChild(selectionRect);
    store.selectionRect = selectionRect;
    productGrid.addEventListener('scroll', () => {
      if (virtualState) scheduleVirtualProductWindow();
    }, { passive: true });
  }
  detailModal = document.getElementById('productDetailModal');
  const prevBtn = document.getElementById('prevProductBtn');
  const nextBtn = document.getElementById('nextProductBtn');
  const closeDetailBtn = document.getElementById('closeDetailBtn');
  batchRefs = {
    bar: document.getElementById('batchActionBar'),
    countSpan: document.getElementById('selectedCount'),
    batchStarBtn: document.getElementById('batchStarBtn'),
    batchDownloadImgBtn: document.getElementById('batchDownloadImgBtn'),
    batchDownloadCsvBtn: document.getElementById('batchDownloadCsvBtn'),
    batchMoveBtn: document.getElementById('batchMoveBtn'),
    batchDeleteBtn: document.getElementById('batchDeleteBtn'),
    selectAllBtn: document.getElementById('selectAllBtn'),
    selectModeBtn: document.getElementById('selectModeBtn'),
    productsModal: document.getElementById('productsModal')
  };
  if (prevBtn) prevBtn.addEventListener('click', () => showPrevProduct());
  if (nextBtn) nextBtn.addEventListener('click', () => showNextProduct());
  if (closeDetailBtn) closeDetailBtn.addEventListener('click', () => detailModal.style.display = 'none');
}

export function getSortedFilteredProducts(area, filter) {
  const search = createSearchContext(filter);
  let list = [...area.products];
  if (search.term) {
    list = list.filter(p => productMatchesSearch(p, search));
  }
  list.sort((a, b) => {
    if (a.favorite && !b.favorite) return -1;
    if (!a.favorite && b.favorite) return 1;
    let va, vb;
    switch (store.currentSortField) {
      case 'name': va = a.name.toLowerCase(); vb = b.name.toLowerCase(); break;
      case 'stock': va = a.stock || 0; vb = b.stock || 0; break;
      default: va = a.lastModified || 0; vb = b.lastModified || 0;
    }
    if (va < vb) return store.currentSortOrder === 'asc' ? -1 : 1;
    if (va > vb) return store.currentSortOrder === 'asc' ? 1 : -1;
    return 0;
  });
  return list;
}

function renderProductCardHtml(product, editable, search) {
  const classes = ['product-card'];
  if (store.selectedProductIds.has(product.id)) classes.push('selected');
  if (product.favorite) classes.push('starred');
  if (store.selectMode) classes.push('select-mode');
  if (search.term) classes.push('search-hit');

  const matchedFields = getMatchedProductFields(product, search);
  const matchedMetaHtml = matchedFields
    .filter(field => field.key !== 'name')
    .map(field => `<div class="prod-meta-line"><span class="prod-meta-label">${field.label}</span><span>${highlightText(field.value, search)}</span></div>`)
    .join('');
  const metaHtml = matchedMetaHtml ? `<div class="prod-meta">${matchedMetaHtml}</div>` : '';
  const checkboxHtml = store.selectMode ? `<input type="checkbox" class="product-checkbox" ${store.selectedProductIds.has(product.id) ? 'checked' : ''}>` : '';
  const starBadge = product.favorite ? '<div class="star-badge">⭐</div>' : '';
  const imgSrc = escapeHtml(product.imageDataUrl || DEFAULT_PRODUCT_IMAGE);
  const imgHtml = `<div class="img-container"><img src="${imgSrc}" alt="${escapeHtml(product.name)}"></div>`;
  let actionsHtml = '';
  if (!store.selectMode) {
    actionsHtml = editable
      ? '<div class="actions"><button class="edit-prod-btn" data-tooltip="编辑">✏️</button><button class="del-prod-btn" data-tooltip="删除">🗑️</button><button class="move-prod-btn" data-tooltip="移动">📦</button></div>'
      : `<div class="actions"><button class="favorite-prod-btn" data-tooltip="${product.favorite ? '取消收藏' : '收藏'}">⭐</button><button class="download-img-prod-btn" data-tooltip="下载图片">📸</button><button class="download-csv-prod-btn" data-tooltip="下载商品页">📄</button></div>`;
  }
  if (!store.selectMode) {
    const buttons = [];
    if (hasPermission('canFavoriteProduct')) {
      buttons.push(`<button class="favorite-prod-btn" data-tooltip="${product.favorite ? '取消收藏' : '收藏'}">⭐</button>`);
    }
    if (hasPermission('canDownloadProductImage')) {
      buttons.push('<button class="download-img-prod-btn" data-tooltip="下载图片">📸</button>');
    }
    if (hasPermission('canDownloadProductCsv')) {
      buttons.push('<button class="download-csv-prod-btn" data-tooltip="下载商品页">📄</button>');
    }
    if (editable && hasPermission('canEditProduct')) {
      buttons.push('<button class="edit-prod-btn" data-tooltip="编辑">✏️</button>');
    }
    if (editable && hasPermission('canDeleteProduct')) {
      buttons.push('<button class="del-prod-btn" data-tooltip="删除">🗑️</button>');
    }
    if (editable && hasPermission('canMoveProduct')) {
      buttons.push('<button class="move-prod-btn" data-tooltip="移动">📦</button>');
    }
    actionsHtml = buttons.length ? `<div class="actions">${buttons.join('')}</div>` : '';
  }
  return `<div class="${classes.join(' ')}" data-prod-id="${escapeHtml(product.id)}">${checkboxHtml}${starBadge}${imgHtml}<div class="prod-name">${highlightText(product.name, search)}</div>${metaHtml}${actionsHtml}</div>`;
}

function detachSelectionRect() {
  if (store.selectionRect && store.selectionRect.parentElement) store.selectionRect.remove();
}

function getVirtualRowKey(search, col) {
  return `${search.term ? 'search' : 'normal'}:${col}`;
}

function getFallbackRowHeight(search) {
  return search.term ? FALLBACK_SEARCH_ROW_HEIGHT : FALLBACK_NORMAL_ROW_HEIGHT;
}

function measureVirtualRowHeight() {
  if (!productGrid || !virtualState) return;
  const firstCard = productGrid.querySelector('.virtual-grid-window .product-card');
  const virtualWindow = productGrid.querySelector('.virtual-grid-window');
  if (!firstCard) return;
  if (!virtualWindow) return;
  const style = getComputedStyle(virtualWindow);
  const gap = parseFloat(style.rowGap || style.gap || '12') || 12;
  const measured = Math.ceil(firstCard.getBoundingClientRect().height + gap);
  if (!Number.isFinite(measured) || measured <= 0) return;
  if (Math.abs(measured - virtualState.rowHeight) < 2) return;
  measuredVirtualRowHeights.set(virtualState.rowKey, measured);
  const previousRow = Math.floor((productGrid.scrollTop || 0) / virtualState.rowHeight);
  virtualState.rowHeight = measured;
  productGrid.scrollTop = previousRow * measured;
  renderVirtualProductWindow();
}

function renderVirtualProductWindow() {
  if (!productGrid || !virtualState) return;
  const { list, editable, search, col, rowHeight } = virtualState;
  const viewportHeight = Math.max(productGrid.clientHeight || 0, 1);
  const scrollTop = Math.max(productGrid.scrollTop || 0, 0);
  const totalRows = Math.ceil(list.length / col);
  const startRow = Math.max(0, Math.floor(scrollTop / rowHeight) - VIRTUAL_OVERSCAN_ROWS);
  const visibleRows = Math.ceil(viewportHeight / rowHeight) + VIRTUAL_OVERSCAN_ROWS * 2;
  const endRow = Math.min(totalRows, startRow + visibleRows);
  const startIndex = startRow * col;
  const endIndex = Math.min(list.length, endRow * col);
  const topOffset = startRow * rowHeight;
  const totalHeight = totalRows * rowHeight;
  const visibleHtml = list
    .slice(startIndex, endIndex)
    .map(product => renderProductCardHtml(product, editable, search))
    .join('');

  productGrid.innerHTML = `<div class="virtual-grid-spacer" style="height:${totalHeight}px;"><div class="virtual-grid-window" style="transform:translateY(${topOffset}px);grid-template-columns:repeat(${col},1fr);--virtual-row-height:${rowHeight}px;">${visibleHtml}</div></div>`;
  detachSelectionRect();
  requestAnimationFrame(measureVirtualRowHeight);
}

function scheduleVirtualProductWindow() {
  if (virtualScrollFrame !== null) return;
  virtualScrollFrame = requestAnimationFrame(() => {
    virtualScrollFrame = null;
    renderVirtualProductWindow();
  });
}

export function renderProductGrid(area, editable, filter = '') {
  if (!productGrid) return;
  const previousScrollTop = productGrid.scrollTop || 0;
  const search = createSearchContext(filter);
  const list = getSortedFilteredProducts(area, search);
  const col = store.productColumns;
  if (!list.length) {
    virtualState = null;
    productGrid.classList.remove('virtualized');
    productGrid.style.gridTemplateColumns = `repeat(${col}, 1fr)`;
    productGrid.innerHTML = `<div style="grid-column:span ${col};color:#999;text-align:center;">${filter ? '无匹配' : '暂无商品'}</div>`;
    return;
  }
  if (list.length > VIRTUAL_SCROLL_THRESHOLD) {
    const rowKey = getVirtualRowKey(search, col);
    const rowHeight = measuredVirtualRowHeights.get(rowKey) || getFallbackRowHeight(search);
    virtualState = { list, editable, search, col, rowHeight, rowKey };
    productGrid.classList.add('virtualized');
    productGrid.style.gridTemplateColumns = '';
    productGrid.scrollTop = previousScrollTop;
    renderVirtualProductWindow();
    return;
  }
  virtualState = null;
  productGrid.classList.remove('virtualized');
  productGrid.style.gridTemplateColumns = `repeat(${col}, 1fr)`;
  productGrid.innerHTML = list.map(product => renderProductCardHtml(product, editable, search)).join('');
  if (store.selectionRect) productGrid.appendChild(store.selectionRect);
}

function safeFileName(name, fallback = '商品') {
  return String(name || fallback).replace(/[\/:*?"<>|]/g, '_').trim() || fallback;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function csvCell(value) {
  const s = String(value ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function toggleProductFavorite(area, product) {
  if (!requirePermission('canFavoriteProduct')) return;
  product.favorite = !product.favorite;
  product.lastModified = Date.now();
  await saveDataOnly();
  refreshCurrentProductGrid();
  showToast(product.favorite ? `已收藏「${product.name}」` : `已取消收藏「${product.name}」`);
}

export function downloadProductImage(product) {
  if (!requirePermission('canDownloadProductImage')) return;
  if (!product.imageDataUrl || !product.imageDataUrl.startsWith('data:image')) {
    showToast('该商品暂无图片');
    return;
  }
  const mimeMatch = product.imageDataUrl.match(/^data:(image\/[^;]+);base64,/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/png';
  const extMap = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif'
  };
  const ext = extMap[mime] || 'png';
  const base64 = product.imageDataUrl.split(',')[1];
  if (!base64) { showToast('图片数据异常'); return; }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  downloadBlob(new Blob([bytes], { type: mime }), `${safeFileName(product.name, product.id)}.${ext}`);
  showToast('图片已下载');
}

export function downloadProductCsv(area, product) {
  if (!requirePermission('canDownloadProductCsv')) return;
  const headers = ['区域', '商品名称', '条码', '规格', '单位', '库存', '最后修改', '是否收藏'];
  const row = {
    区域: area?.name || '',
    商品名称: product.name || '',
    条码: product.barcode || '',
    规格: product.specification || '',
    单位: product.unit || '',
    库存: product.stock || 0,
    最后修改: formatTimestamp(product.lastModified),
    是否收藏: product.favorite ? '是' : '否'
  };
  const csv = [headers.join(','), headers.map(h => csvCell(row[h])).join(',')].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `商品页_${safeFileName(product.name, product.id)}_${new Date().toISOString().slice(0, 10)}.csv`);
  showToast('商品页已下载');
}

function renderCurrentProductGridNow() {
  refreshFrame = null;
  const productsModal = batchRefs?.productsModal || document.getElementById('productsModal');
  if (productsModal && productsModal.style.display === 'flex' && store.editingProductAreaId) {
    const area = store.areas.find(a => a.id === store.editingProductAreaId);
    if (area) {
      const editable = canManageProducts();
      renderProductGrid(area, editable, store.currentSearchFilter);
    }
  }
}

export function refreshCurrentProductGrid() {
  if (refreshFrame !== null) return;
  refreshFrame = requestAnimationFrame(renderCurrentProductGridNow);
}

export function updateBatchActionBar() {
  const refs = batchRefs || {};
  const bar = refs.bar || document.getElementById('batchActionBar');
  const countSpan = refs.countSpan || document.getElementById('selectedCount');
  const batchStarBtn = refs.batchStarBtn || document.getElementById('batchStarBtn');
  const batchDownloadImgBtn = refs.batchDownloadImgBtn || document.getElementById('batchDownloadImgBtn');
  const batchDownloadCsvBtn = refs.batchDownloadCsvBtn || document.getElementById('batchDownloadCsvBtn');
  const batchMoveBtn = refs.batchMoveBtn || document.getElementById('batchMoveBtn');
  const batchDeleteBtn = refs.batchDeleteBtn || document.getElementById('batchDeleteBtn');
  const selectAllBtn = refs.selectAllBtn || document.getElementById('selectAllBtn');

  const count = store.selectedProductIds.size;
  if (countSpan) countSpan.textContent = `已选择 ${count} 个商品`;
  const visible = count > 0 && store.selectMode;
  if (bar) bar.style.display = visible ? 'flex' : 'none';
  if (!visible) return;
  if (batchStarBtn) batchStarBtn.style.display = hasPermission('canFavoriteProduct') ? 'flex' : 'none';
  if (batchDownloadImgBtn) batchDownloadImgBtn.style.display = hasPermission('canDownloadProductImage') ? 'flex' : 'none';
  if (batchDownloadCsvBtn) batchDownloadCsvBtn.style.display = hasPermission('canDownloadProductCsv') ? 'flex' : 'none';
  if (batchMoveBtn) batchMoveBtn.style.display = hasPermission('canMoveProduct') ? 'flex' : 'none';
  if (batchDeleteBtn) batchDeleteBtn.style.display = hasPermission('canDeleteProduct') ? 'flex' : 'none';

  const area = store.areas.find(a => a.id === store.editingProductAreaId);
  if (area && store.selectMode && selectAllBtn) {
    const totalCount = getSortedFilteredProducts(area, store.currentSearchFilter).length;
    const full = (store.selectedProductIds.size === totalCount && totalCount > 0);
    if (full) selectAllBtn.classList.add('select-all-active');
    else selectAllBtn.classList.remove('select-all-active');
  } else if (selectAllBtn) {
    selectAllBtn.classList.remove('select-all-active');
  }
}

export function setProductSelection(productId, isSelected, preserveOthers = true, rerender = true) {
  if (preserveOthers) {
    if (isSelected) store.selectedProductIds.add(productId);
    else store.selectedProductIds.delete(productId);
  } else {
    if (isSelected) store.selectedProductIds.add(productId);
    else store.selectedProductIds.delete(productId);
  }
  const selectAllBtn = batchRefs?.selectAllBtn || document.getElementById('selectAllBtn');
  if (selectAllBtn) selectAllBtn.classList.remove('select-all-active');
  updateBatchActionBar();
  if (rerender && store.editingProductAreaId) {
    const area = store.areas.find(a => a.id === store.editingProductAreaId);
    if (area) renderProductGrid(area, false, store.currentSearchFilter);
  }
}

export function handleProductSelection(area, clickedProductId, event) {
  if (!store.selectMode) return false;
  const productIds = area.products.map(p => p.id);
  const clickedIndex = productIds.indexOf(clickedProductId);
  if (event.ctrlKey || event.metaKey) {
    if (store.selectedProductIds.has(clickedProductId)) setProductSelection(clickedProductId, false, true);
    else setProductSelection(clickedProductId, true, true);
    store.lastSelectedProductId = clickedProductId;
  } else if (event.shiftKey && store.lastSelectedProductId !== null) {
    const lastIndex = productIds.indexOf(store.lastSelectedProductId);
    if (lastIndex !== -1 && clickedIndex !== -1) {
      const start = Math.min(lastIndex, clickedIndex);
      const end = Math.max(lastIndex, clickedIndex);
      for (let i = start; i <= end; i++) store.selectedProductIds.add(productIds[i]);
      const selectAllBtn = batchRefs?.selectAllBtn || document.getElementById('selectAllBtn');
      if (selectAllBtn) selectAllBtn.classList.remove('select-all-active');
      updateBatchActionBar();
      renderProductGrid(area, canManageProducts(), store.currentSearchFilter);
    }
  } else {
    if (store.selectedProductIds.has(clickedProductId)) setProductSelection(clickedProductId, false, true);
    else setProductSelection(clickedProductId, true, true);
    store.lastSelectedProductId = clickedProductId;
  }
  return true;
}

export function toggleSelectMode() {
  if (!hasPermission('canFavoriteProduct') && !hasPermission('canDownloadProductImage') && !hasPermission('canDownloadProductCsv') && !hasPermission('canMoveProduct') && !hasPermission('canDeleteProduct')) {
    showToast(NO_PERMISSION_TEXT);
    return;
  }
  if (store.selectMode) {
    store.selectMode = false;
    store.selectedProductIds.clear();
    store.lastSelectedProductId = null;
    document.getElementById('selectModeBtn')?.classList.remove('active');
  } else {
    store.selectMode = true;
    document.getElementById('selectModeBtn')?.classList.add('active');
  }
  updateBatchActionBar();
  if (store.editingProductAreaId) {
    const area = store.areas.find(a => a.id === store.editingProductAreaId);
    if (area) renderProductGrid(area, canManageProducts(), store.currentSearchFilter);
  }
  showToast(store.selectMode ? '多选模式已开启' : '已退出多选模式');
}

export function toggleSelectAll() {
  if (!hasPermission('canFavoriteProduct') && !hasPermission('canDownloadProductImage') && !hasPermission('canDownloadProductCsv') && !hasPermission('canMoveProduct') && !hasPermission('canDeleteProduct')) {
    showToast(NO_PERMISSION_TEXT);
    return;
  }
  if (!store.selectMode) toggleSelectMode();
  const area = store.areas.find(a => a.id === store.editingProductAreaId);
  if (!area) return;
  const productList = getSortedFilteredProducts(area, store.currentSearchFilter);
  const allIds = productList.map(p => p.id);
  const selectAllBtn = document.getElementById('selectAllBtn');
  if (store.isFullSelect && store.selectedProductIds.size === allIds.length) {
    store.selectedProductIds.clear();
    store.isFullSelect = false;
    if (selectAllBtn) selectAllBtn.classList.remove('select-all-active');
    showToast('已取消全选');
  } else {
    store.selectedProductIds.clear();
    allIds.forEach(id => store.selectedProductIds.add(id));
    store.isFullSelect = true;
    if (selectAllBtn) selectAllBtn.classList.add('select-all-active');
    showToast(`已全选 ${store.selectedProductIds.size} 个商品`);
  }
  updateBatchActionBar();
  if (store.editingProductAreaId) {
    const area2 = store.areas.find(a => a.id === store.editingProductAreaId);
    if (area2) renderProductGrid(area2, false, store.currentSearchFilter);
  }
}

export async function batchDeleteSelected() {
  if (!requirePermission('canDeleteProduct')) return;
  if (store.selectedProductIds.size === 0) { showToast('请先选择商品'); return; }
  if (!confirm(`确定要删除 ${store.selectedProductIds.size} 个商品吗？`)) return;
  const area = store.areas.find(a => a.id === store.editingProductAreaId);
  if (area) {
    area.products = area.products.filter(p => !store.selectedProductIds.has(p.id));
    await pushState();
    await saveDataOnly();
    store.selectedProductIds.clear();
    if (store.selectMode) toggleSelectMode();
    else {
      store.selectMode = false;
      (batchRefs?.selectModeBtn || document.getElementById('selectModeBtn'))?.classList.remove('active');
      updateBatchActionBar();
    }
    refreshCurrentProductGrid();
    showToast('已删除所选商品');
  }
}

export function batchMoveSelected() {
  if (!requirePermission('canMoveProduct')) return;
  if (store.selectedProductIds.size === 0) { showToast('请先选择商品'); return; }
  const area = store.areas.find(a => a.id === store.editingProductAreaId);
  if (!area) return;
  const productsToMove = area.products.filter(p => store.selectedProductIds.has(p.id));
  if (productsToMove.length === 0) return;
  openMapSelect(store.editingProductAreaId, productsToMove);
}

export function openProductDetail(area, productId, productListIds, index) {
  store.currentDetailArea = area;
  store.currentDetailProductIds = productListIds;
  store.currentDetailIndex = index;
  const prod = area.products.find(p => p.id === productId);
  if (!prod) return;
  const detailTitle = document.getElementById('detailTitle');
  const detailCounterSpan = document.getElementById('detailCounter');
  const detailImage = document.getElementById('detailImage');
  const detailBarcode = document.getElementById('detailBarcode');
  const detailSpec = document.getElementById('detailSpec');
  const detailUnit = document.getElementById('detailUnit');
  const detailStock = document.getElementById('detailStock');
  const detailModified = document.getElementById('detailModified');
  if (detailTitle) detailTitle.textContent = prod.name;
  if (detailCounterSpan) detailCounterSpan.textContent = `${index + 1}/${productListIds.length}`;
  const prevBtn = document.getElementById('prevProductBtn');
  const nextBtn = document.getElementById('nextProductBtn');
  if (prevBtn) prevBtn.classList.toggle('disabled', index <= 0);
  if (nextBtn) nextBtn.classList.toggle('disabled', index >= productListIds.length - 1);
  if (detailImage) {
    if (prod.imageDataUrl) {
      detailImage.src = prod.imageDataUrl;
      detailImage.style.display = 'block';
      detailImage.onclick = () => {
        document.getElementById('previewImage').src = prod.imageDataUrl;
        document.getElementById('imagePreviewOverlay').style.display = 'flex';
      };
    } else {
      detailImage.style.display = 'none';
      detailImage.onclick = null;
    }
  }
  if (detailBarcode) detailBarcode.textContent = prod.barcode || '-';
  if (detailSpec) detailSpec.textContent = prod.specification || '-';
  if (detailUnit) detailUnit.textContent = prod.unit || '-';
  if (detailStock) detailStock.textContent = prod.stock || 0;
  if (detailModified) detailModified.textContent = formatTimestamp(prod.lastModified);
  if (detailModal) detailModal.style.display = 'flex';
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
