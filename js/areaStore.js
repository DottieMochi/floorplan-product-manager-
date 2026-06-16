// js/areaStore.js
import { store, appHistory, MAX_HISTORY, hasPermission } from './store.js';
import { cleanAreaData, ensureAreaCode, showToast } from './utils.js';

let db;
const DB_NAME = 'AreaNavigatorDB';
const STORE_NAME = 'areas';
const NO_PERMISSION_TEXT = '当前身份无权执行此操作';

function requirePermission(key) {
  if (hasPermission(key)) return true;
  showToast(NO_PERMISSION_TEXT);
  return false;
}

export function openDB() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = e => {
      if (!e.target.result.objectStoreNames.contains(STORE_NAME))
        e.target.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
    };
    r.onsuccess = e => { db = e.target.result; resolve(db); };
    r.onerror = e => reject(e.target.error);
  });
}

export async function saveDataToDB() {
  if (!db) await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const storeObj = tx.objectStore(STORE_NAME);
  storeObj.clear();
  store.areas.forEach(a => storeObj.put(a));
  return new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = e => reject(e.target.error);
  });
}

export async function loadDataFromDB() {
  if (!db) await openDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  return new Promise((resolve, reject) => {
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = e => resolve(e.target.result || []);
    req.onerror = e => reject(e.target.error);
  });
}

export async function saveDataOnly() {
  await saveDataToDB();
  const hasProducts = store.areas.some(a => a.products.length > 0);
  const importBanner = document.getElementById('importBanner');
  if (importBanner) importBanner.style.display = hasProducts ? 'none' : 'block';
  store.favoriteProductIds.clear();
  store.areas.forEach(area => {
    area.products.forEach(p => {
      if (p.favorite) store.favoriteProductIds.add(p.id);
    });
  });
}

export function captureState() {
  return JSON.parse(JSON.stringify(store.areas));
}

export function pushState() {
  const state = captureState();
  if (appHistory.index < appHistory.stack.length - 1) {
    appHistory.stack.splice(appHistory.index + 1);
  }
  appHistory.stack.push(state);
  if (appHistory.stack.length > MAX_HISTORY) appHistory.stack.shift();
  else appHistory.index = appHistory.stack.length - 1;
}

export function clearHistory() {
  if (!requirePermission('canClearHistory')) return;
  appHistory.stack = [captureState()];
  appHistory.index = 0;
  showToast('历史记录已清空');
}

export async function undo() {
  if (!requirePermission('canUndoRedo')) return;
  if (appHistory.index > 0) {
    appHistory.index--;
    store.areas = JSON.parse(JSON.stringify(appHistory.stack[appHistory.index]));
    await saveDataOnly();
    window.dispatchEvent(new CustomEvent('dataChanged'));
    showToast('已撤回');
    window.dispatchEvent(new CustomEvent('refreshProductGrid'));
  } else {
    showToast('无更早操作');
  }
}

export async function redo() {
  if (!requirePermission('canUndoRedo')) return;
  if (appHistory.index < appHistory.stack.length - 1) {
    appHistory.index++;
    store.areas = JSON.parse(JSON.stringify(appHistory.stack[appHistory.index]));
    await saveDataOnly();
    window.dispatchEvent(new CustomEvent('dataChanged'));
    showToast('已复原');
    window.dispatchEvent(new CustomEvent('refreshProductGrid'));
  } else {
    showToast('无后续操作');
  }
}

export function exportData() {
  if (!requirePermission('canExportData')) return;
  const blob = new Blob([JSON.stringify(store.areas, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `区域导航备份_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  showToast('数据已导出');
}

export function importData(file) {
  if (!requirePermission('canImportData')) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (Array.isArray(data)) {
        const cleaned = data.map(cleanAreaData);
        for (const area of cleaned) ensureAreaCode(area, cleaned);
        store.areas = cleaned;
        pushState();
        await saveDataOnly();
        window.dispatchEvent(new CustomEvent('dataChanged', { detail: { resetView: true } }));
        showToast('导入成功');
      } else {
        showToast('格式错误');
      }
    } catch (ex) {
      showToast('解析失败');
    }
  };
  reader.readAsText(file);
}
