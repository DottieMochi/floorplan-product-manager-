// js/main.js
import { store, appHistory, loadSavedUserRole } from './store.js';
import { initCanvas, drawMap, scheduleResetView, attachCanvasEvents } from './canvasManager.js';
import { openDB, loadDataFromDB, pushState, saveDataOnly } from './areaStore.js';
import { initProductManager } from './productManager.js';
import { initUI } from './uiController.js';
import { cleanAreaData, ensureAreaCode, showToast } from './utils.js';
import { DEMO_AREAS } from './demoData.js';

// 挂载全局变量（用于调试，但注意不要直接赋值覆盖）
window.store = store;
window.appHistory = appHistory;

async function init() {
  loadSavedUserRole();
  await openDB();
  let saved = await loadDataFromDB();
  const usingDemo = !(saved && saved.length);
  const source = usingDemo ? DEMO_AREAS : saved;
  const cleaned = source.map(cleanAreaData);
  for (const area of cleaned) ensureAreaCode(area, cleaned);
  store.areas = cleaned;
  pushState();

  const canvas = document.getElementById('mapCanvas');
  const miniMapCanvas = document.getElementById('miniMapCanvas');
  initCanvas(canvas, miniMapCanvas);
  drawMap();
  scheduleResetView();

  initProductManager();
  initUI();
  attachCanvasEvents();

  const wrapper = document.querySelector('.canvas-wrapper');
  if (wrapper) {
    new ResizeObserver(() => scheduleResetView()).observe(wrapper);
  }

  const loading = document.getElementById('globalLoading');
  if (loading) loading.style.display = 'none';
  else {
    const ld = document.getElementById('globalLoading');
    if (ld) ld.remove();
  }

  showToast(usingDemo ? '已载入演示数据，可直接体验（编辑后将保存为你的数据）' : '欢迎使用区域导航系统');
}

init();
