// js/canvasManager.js
import { store, hasPermission } from './store.js';
import { pushState, saveDataOnly } from './areaStore.js';
import { showToast } from './utils.js';

let canvas = null;
let ctx = null;
let miniMapCanvas = null;
let miniMapCtx = null;
let draggingAreaId = null;
let resizingAreaId = null;
let drawingNewArea = false;
let isDragging = false;
let lastX = 0;
let lastY = 0;
let startX = 0;
let startY = 0;
let resizeStartX = 0;
let resizeStartY = 0;
let resizeStartW = 0;
let resizeStartH = 0;
let guideLines = [];
let resetTimer = null;
let drawFrameId = null;
let longPressTimer = null;
let longPressFired = false;
let touchStartPoint = null;
let lastTouchDistance = 0;
let pinchActive = false;
let miniMapViewport = null;
let miniMapWorld = null;
let miniMapFrameId = null;
let pendingMiniMapView = null;
const SNAP_DISTANCE = 5;
const LONG_PRESS_MS = 560;
const MIN_NEW_AREA_SIZE = 24;
const NO_PERMISSION_TEXT = '当前身份无权执行此操作';

function requirePermission(key) {
  if (hasPermission(key)) return true;
  showToast(NO_PERMISSION_TEXT);
  return false;
}

export function initCanvas(el, miniMapEl = null) {
  canvas = el;
  ctx = canvas ? canvas.getContext('2d') : null;
  miniMapCanvas = miniMapEl;
  miniMapCtx = miniMapCanvas ? miniMapCanvas.getContext('2d') : null;
  window.addEventListener('dataChanged', (e) => {
    if (e.detail && e.detail.resetView) scheduleResetView();
    else drawMap();
  });
}

function drawShape(ctx, x, y, w, h, shape, radius = 12) {
  switch (shape) {
    case 'roundRect': {
      const r = Math.min(radius, w / 2, h / 2);
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      break;
    }
    case 'circle':
      ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      break;
    case 'diamond':
      ctx.moveTo(x + w / 2, y);
      ctx.lineTo(x + w, y + h / 2);
      ctx.lineTo(x + w / 2, y + h);
      ctx.lineTo(x, y + h / 2);
      ctx.closePath();
      break;
    default:
      ctx.rect(x, y, w, h);
  }
}

function isAreaVisible(area, left, top, right, bottom, padding) {
  return area.x + area.w >= left - padding
    && area.x <= right + padding
    && area.y + area.h >= top - padding
    && area.y <= bottom + padding;
}

function getAreasBounds(padding = 80) {
  if (!store.areas.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  store.areas.forEach(a => {
    minX = Math.min(minX, a.x);
    minY = Math.min(minY, a.y);
    maxX = Math.max(maxX, a.x + a.w);
    maxY = Math.max(maxY, a.y + a.h);
  });
  return { minX: minX - padding, minY: minY - padding, maxX: maxX + padding, maxY: maxY + padding };
}

function ensureMiniMapSize() {
  if (!miniMapCanvas) return false;
  const rect = miniMapCanvas.getBoundingClientRect();
  const w = Math.max(1, Math.round(rect.width || miniMapCanvas.clientWidth || 170));
  const h = Math.max(1, Math.round(rect.height || miniMapCanvas.clientHeight || 120));
  if (miniMapCanvas.width !== w) miniMapCanvas.width = w;
  if (miniMapCanvas.height !== h) miniMapCanvas.height = h;
  return true;
}

function drawMiniMap(worldLeft, worldTop, worldRight, worldBottom) {
  if (!miniMapCtx || !ensureMiniMapSize()) return;
  miniMapCtx.clearRect(0, 0, miniMapCanvas.width, miniMapCanvas.height);
  const bounds = getAreasBounds(100);
  if (!bounds) {
    miniMapViewport = miniMapWorld = null;
    return;
  }
  miniMapWorld = bounds;
  const worldW = bounds.maxX - bounds.minX || 1;
  const worldH = bounds.maxY - bounds.minY || 1;
  const pad = 8;
  const scale = Math.min((miniMapCanvas.width - pad * 2) / worldW, (miniMapCanvas.height - pad * 2) / worldH);
  const ox = (miniMapCanvas.width - worldW * scale) / 2;
  const oy = (miniMapCanvas.height - worldH * scale) / 2;
  const toMiniX = x => ox + (x - bounds.minX) * scale;
  const toMiniY = y => oy + (y - bounds.minY) * scale;
  miniMapCtx.fillStyle = 'rgba(255,255,255,.86)';
  miniMapCtx.fillRect(0, 0, miniMapCanvas.width, miniMapCanvas.height);
  store.areas.forEach(a => {
    miniMapCtx.fillStyle = a.color || '#3498db';
    miniMapCtx.fillRect(toMiniX(a.x), toMiniY(a.y), Math.max(2, a.w * scale), Math.max(2, a.h * scale));
  });
  const vx = toMiniX(worldLeft);
  const vy = toMiniY(worldTop);
  const vw = Math.max(8, (worldRight - worldLeft) * scale);
  const vh = Math.max(8, (worldBottom - worldTop) * scale);
  miniMapViewport = { scale, ox, oy, bounds };
  miniMapCtx.strokeStyle = '#ff2d55';
  miniMapCtx.lineWidth = 2;
  miniMapCtx.strokeRect(vx, vy, vw, vh);
}

function scheduleMiniMapDraw(worldLeft, worldTop, worldRight, worldBottom) {
  pendingMiniMapView = { worldLeft, worldTop, worldRight, worldBottom };
  if (miniMapFrameId !== null) return;
  miniMapFrameId = requestAnimationFrame(() => {
    miniMapFrameId = null;
    const view = pendingMiniMapView;
    pendingMiniMapView = null;
    if (view) drawMiniMap(view.worldLeft, view.worldTop, view.worldRight, view.worldBottom);
  });
}

function setViewCenter(worldX, worldY) {
  if (!canvas) return;
  store.offsetX = canvas.width / 2 - worldX * store.scale;
  store.offsetY = canvas.height / 2 - worldY * store.scale;
  clampViewToBounds();
  drawMap();
}

function clampViewToBounds() {
  if (!canvas || !store.areas.length) return;
  const bounds = getAreasBounds(120);
  if (!bounds) return;
  const worldW = bounds.maxX - bounds.minX;
  const worldH = bounds.maxY - bounds.minY;
  const viewW = canvas.width / store.scale;
  const viewH = canvas.height / store.scale;
  const minOffsetX = canvas.width - bounds.maxX * store.scale;
  const maxOffsetX = -bounds.minX * store.scale;
  const minOffsetY = canvas.height - bounds.maxY * store.scale;
  const maxOffsetY = -bounds.minY * store.scale;
  if (worldW <= viewW) store.offsetX = canvas.width / 2 - ((bounds.minX + bounds.maxX) / 2) * store.scale;
  else store.offsetX = Math.min(maxOffsetX, Math.max(minOffsetX, store.offsetX));
  if (worldH <= viewH) store.offsetY = canvas.height / 2 - ((bounds.minY + bounds.maxY) / 2) * store.scale;
  else store.offsetY = Math.min(maxOffsetY, Math.max(minOffsetY, store.offsetY));
}

function onMiniMapClick(e) {
  if (!miniMapViewport) return;
  const rect = miniMapCanvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (miniMapCanvas.width / rect.width);
  const y = (e.clientY - rect.top) * (miniMapCanvas.height / rect.height);
  const { scale, ox, oy, bounds } = miniMapViewport;
  const worldX = bounds.minX + (x - ox) / scale;
  const worldY = bounds.minY + (y - oy) / scale;
  setViewCenter(worldX, worldY);
}

function getTouchDistance(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.hypot(dx, dy);
}

function getTouchCenter(touches) {
  return {
    x: (touches[0].clientX + touches[1].clientX) / 2,
    y: (touches[0].clientY + touches[1].clientY) / 2
  };
}

function clearLongPressTimer() {
  if (longPressTimer) clearTimeout(longPressTimer);
  longPressTimer = null;
}

function setupLongPress(cx, cy) {
  clearLongPressTimer();
  longPressFired = false;
  touchStartPoint = { x: cx, y: cy };
  const world = screenToWorld(cx, cy);
  const area = findArea(world.x, world.y);
  if (!area) return;
  longPressTimer = setTimeout(() => {
    longPressFired = true;
    isDragging = false;
    draggingAreaId = resizingAreaId = null;
    if (hasPermission('canEditArea')) openAreaMenu(area);
    else openProducts(area);
  }, LONG_PRESS_MS);
}

function handlePinchMove(touches) {
  const center = getTouchCenter(touches);
  const distance = getTouchDistance(touches);
  if (!lastTouchDistance) lastTouchDistance = distance;
  const rect = canvas.getBoundingClientRect();
  const sx = (center.x - rect.left) * (canvas.width / rect.width);
  const sy = (center.y - rect.top) * (canvas.height / rect.height);
  const worldX = (sx - store.offsetX) / store.scale;
  const worldY = (sy - store.offsetY) / store.scale;
  const factor = Math.max(0.85, Math.min(1.18, distance / lastTouchDistance));
  const newScale = Math.min(store.MAX_SCALE, Math.max(store.MIN_SCALE, store.scale * factor));
  store.scale = store.scale + (newScale - store.scale) * 0.72;
  store.offsetX = sx - worldX * store.scale;
  store.offsetY = sy - worldY * store.scale;
  clampViewToBounds();
  lastTouchDistance = distance;
  const zoomSlider = document.getElementById('zoomSlider');
  if (zoomSlider) zoomSlider.value = store.scale;
  scheduleDrawMap();
}

export function drawMap() {
  if (drawFrameId !== null) {
    cancelAnimationFrame(drawFrameId);
    drawFrameId = null;
  }
  if (!canvas || !ctx) return;
  if (!canvas.width || !canvas.height) {
    const wrapper = document.querySelector('.canvas-wrapper');
    if (wrapper) {
      canvas.width = Math.max(1, wrapper.clientWidth - 4);
      canvas.height = Math.max(1, wrapper.clientHeight - 4);
    }
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!store.areas.length) {
    if (miniMapCtx && ensureMiniMapSize()) miniMapCtx.clearRect(0, 0, miniMapCanvas.width, miniMapCanvas.height);
    return;
  }

  ctx.save();
  ctx.translate(store.offsetX, store.offsetY);
  ctx.scale(store.scale, store.scale);

  const worldLeft = -store.offsetX / store.scale;
  const worldTop = -store.offsetY / store.scale;
  const worldRight = (canvas.width - store.offsetX) / store.scale;
  const worldBottom = (canvas.height - store.offsetY) / store.scale;

  ctx.strokeStyle = '#eee';
  ctx.lineWidth = 1 / store.scale;
  const grid = 40;
  for (let i = Math.floor(worldLeft / grid) * grid; i <= worldRight; i += grid) {
    ctx.beginPath(); ctx.moveTo(i, worldTop); ctx.lineTo(i, worldBottom); ctx.stroke();
  }
  for (let j = Math.floor(worldTop / grid) * grid; j <= worldBottom; j += grid) {
    ctx.beginPath(); ctx.moveTo(worldLeft, j); ctx.lineTo(worldRight, j); ctx.stroke();
  }

  if (guideLines.length && store.snapEnabled) {
    ctx.save();
    ctx.strokeStyle = '#ff00ff';
    ctx.lineWidth = 2 / store.scale;
    ctx.setLineDash([5 / store.scale, 5 / store.scale]);
    guideLines.forEach(l => {
      if (l.horizontal !== undefined) { ctx.beginPath(); ctx.moveTo(worldLeft, l.horizontal); ctx.lineTo(worldRight, l.horizontal); ctx.stroke(); }
      if (l.vertical !== undefined) { ctx.beginPath(); ctx.moveTo(l.vertical, worldTop); ctx.lineTo(l.vertical, worldBottom); ctx.stroke(); }
    });
    ctx.setLineDash([]);
    ctx.restore();
  }

  const cullPadding = 80 / store.scale;
  store.areas.forEach(a => {
    if (!isAreaVisible(a, worldLeft, worldTop, worldRight, worldBottom, cullPadding)) return;
    const { x, y, w, h, color, name, shape = 'rect', fontSize = 14, textColor = '#ffffff', textDirection = 'horizontal', locked } = a;
    const hl = store.highlightedAreaIds.has(a.id);
    const selected = store.areaMultiSelectMode && store.selectedAreaIds.has(a.id);

    ctx.beginPath();
    drawShape(ctx, x, y, w, h, shape);
    ctx.fillStyle = color;
    ctx.fill();
    if (hl) { ctx.strokeStyle = '#ff2d55'; ctx.lineWidth = 7 / store.scale; }
    else if (selected) { ctx.strokeStyle = '#e67e22'; ctx.lineWidth = 3 / store.scale; }
    else if (locked && store.currentMode === 'edit') { ctx.strokeStyle = '#888'; ctx.lineWidth = 2 / store.scale; }
    else { ctx.strokeStyle = '#333'; ctx.lineWidth = 2 / store.scale; }
    ctx.stroke();
    if (hl) {
      ctx.save();
      ctx.beginPath();
      drawShape(ctx, x, y, w, h, shape);
      ctx.strokeStyle = 'rgba(255,45,85,0.35)';
      ctx.lineWidth = 13 / store.scale;
      ctx.stroke();
      ctx.restore();
    }

    let displayFontSize = fontSize / store.scale;
    if (displayFontSize < 10) displayFontSize = 10;
    const cx = x + w / 2, cy = y + h / 2;
    ctx.fillStyle = textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (textDirection === 'rotate90' || textDirection === 'rotate270') {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(textDirection === 'rotate90' ? Math.PI / 2 : -Math.PI / 2);
      ctx.font = `bold ${displayFontSize}px "Microsoft YaHei"`;
      ctx.fillText(name, 0, 0);
      ctx.restore();
    } else if (textDirection === 'vertical') {
      ctx.save();
      ctx.font = `bold ${displayFontSize}px "Microsoft YaHei"`;
      const chars = String(name || '').split('');
      const lineHeight = displayFontSize * 1.2;
      const startY = cy - (chars.length - 1) * lineHeight / 2;
      for (let i = 0; i < chars.length; i++) ctx.fillText(chars[i], cx, startY + i * lineHeight);
      ctx.restore();
    } else {
      ctx.font = `bold ${displayFontSize}px "Microsoft YaHei"`;
      ctx.fillText(name, cx, cy);
    }

    if (locked && store.currentMode === 'edit') {
      ctx.font = `${12 / store.scale}px "Microsoft YaHei"`;
      ctx.fillStyle = '#888';
      ctx.fillText('🔒', x + 2 / store.scale, y + h - 2 / store.scale);
    }
    if (store.currentMode === 'edit' && !locked && !store.areaMultiSelectMode) {
      ctx.fillStyle = '#333';
      ctx.fillRect(x + w - 8 / store.scale, y + h - 8 / store.scale, 8 / store.scale, 8 / store.scale);
    }
    if (selected) {
      ctx.beginPath();
      drawShape(ctx, x, y, w, h, shape);
      ctx.fillStyle = 'rgba(230,126,34,0.2)';
      ctx.fill();
    }
  });
  if (store.newAreaRect) {
    const r = store.newAreaRect;
    ctx.save();
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = 'rgba(249,115,22,.14)';
    ctx.strokeStyle = '#f97316';
    ctx.lineWidth = 2 / store.scale;
    ctx.setLineDash([8 / store.scale, 5 / store.scale]);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
  scheduleMiniMapDraw(worldLeft, worldTop, worldRight, worldBottom);
}

export function scheduleDrawMap() {
  if (drawFrameId !== null) return;
  drawFrameId = requestAnimationFrame(() => {
    drawFrameId = null;
    drawMap();
  });
}

function screenToWorld(cx, cy) {
  const rect = canvas.getBoundingClientRect();
  const sx = (cx - rect.left) * (canvas.width / rect.width);
  const sy = (cy - rect.top) * (canvas.height / rect.height);
  return { x: (sx - store.offsetX) / store.scale, y: (sy - store.offsetY) / store.scale };
}

function findArea(wx, wy) {
  for (let i = store.areas.length - 1; i >= 0; i--) {
    const a = store.areas[i];
    if (wx >= a.x && wx <= a.x + a.w && wy >= a.y && wy <= a.y + a.h) return a;
  }
  return null;
}

function resetView() {
  if (!canvas) return;
  const wrapper = document.querySelector('.canvas-wrapper');
  if (wrapper) {
    const w = wrapper.clientWidth - 4, h = wrapper.clientHeight - 4;
    if (w <= 0 || h <= 0) { setTimeout(resetView, 50); return; }
    canvas.width = w;
    canvas.height = h;
  }
  if (!store.areas.length) { store.scale = 1; store.offsetX = 0; store.offsetY = 0; drawMap(); return; }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  store.areas.forEach(a => { minX = Math.min(minX, a.x); minY = Math.min(minY, a.y); maxX = Math.max(maxX, a.x + a.w); maxY = Math.max(maxY, a.y + a.h); });
  const worldW = maxX - minX || 100, worldH = maxY - minY || 100, padding = 40;
  let scaleX = (canvas.width - padding * 2) / worldW, scaleY = (canvas.height - padding * 2) / worldH;
  let newScale = Math.min(scaleX, scaleY, store.isDesktopMode ? 100 : store.MAX_SCALE);
  newScale = Math.max(store.MIN_SCALE, newScale);
  store.scale = newScale;
  const centerX = (minX + maxX) / 2, centerY = (minY + maxY) / 2;
  store.offsetX = canvas.width / 2 - centerX * store.scale;
  store.offsetY = canvas.height / 2 - centerY * store.scale;
  const zoomSlider = document.getElementById('zoomSlider');
  if (zoomSlider) zoomSlider.value = store.scale;
  drawMap();
}

export function scheduleResetView() {
  if (resetTimer) clearTimeout(resetTimer);
  resetTimer = setTimeout(resetView, 30);
}

function applySnapWithInfo(area, newX, newY, excludeId) {
  if (!store.snapEnabled) return { x: newX, y: newY, snapped: false };
  let snappedX = newX, snappedY = newY, snapped = false;
  store.areas.forEach(other => {
    if (other.id === excludeId) return;
    let dist = Math.abs(newX - (other.x + other.w)); if (dist <= SNAP_DISTANCE) { snappedX = other.x + other.w; snapped = true; }
    dist = Math.abs((newX + area.w) - other.x); if (dist <= SNAP_DISTANCE) { snappedX = other.x - area.w; snapped = true; }
    dist = Math.abs(newX - other.x); if (dist <= SNAP_DISTANCE) { snappedX = other.x; snapped = true; }
    dist = Math.abs((newX + area.w) - (other.x + other.w)); if (dist <= SNAP_DISTANCE) { snappedX = other.x + other.w - area.w; snapped = true; }
    dist = Math.abs(newY - (other.y + other.h)); if (dist <= SNAP_DISTANCE) { snappedY = other.y + other.h; snapped = true; }
    dist = Math.abs((newY + area.h) - other.y); if (dist <= SNAP_DISTANCE) { snappedY = other.y - area.h; snapped = true; }
    dist = Math.abs(newY - other.y); if (dist <= SNAP_DISTANCE) { snappedY = other.y; snapped = true; }
    dist = Math.abs((newY + area.h) - (other.y + other.h)); if (dist <= SNAP_DISTANCE) { snappedY = other.y + other.h - area.h; snapped = true; }
  });
  return { x: snappedX, y: snappedY, snapped };
}

function calculateGuideLines(area, newX, newY, excludeId) {
  const lines = [];
  if (!store.snapEnabled) return lines;
  store.areas.forEach(other => {
    if (other.id === excludeId) return;
    if (Math.abs(newX - other.x) <= SNAP_DISTANCE) lines.push({ vertical: other.x });
    if (Math.abs((newX + area.w) - (other.x + other.w)) <= SNAP_DISTANCE) lines.push({ vertical: other.x + other.w });
    if (Math.abs(newY - other.y) <= SNAP_DISTANCE) lines.push({ horizontal: other.y });
    if (Math.abs((newY + area.h) - (other.y + other.h)) <= SNAP_DISTANCE) lines.push({ horizontal: other.y + other.h });
  });
  return lines;
}

function openAreaMenu(area) {
  window.dispatchEvent(new CustomEvent('openAreaMenu', { detail: { areaId: area.id } }));
}

function openProducts(area) {
  window.dispatchEvent(new CustomEvent('openProducts', { detail: { areaId: area.id } }));
}

function updateNewAreaRect(cx, cy) {
  const { x, y } = screenToWorld(cx, cy);
  const x1 = Math.min(startX, x);
  const y1 = Math.min(startY, y);
  const x2 = Math.max(startX, x);
  const y2 = Math.max(startY, y);
  store.newAreaRect = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  scheduleDrawMap();
}

function pointerDown(cx, cy, evt = window.event) {
  if (!hasPermission('canEditArea')) {
    draggingAreaId = resizingAreaId = null;
    isDragging = true; startX = cx; startY = cy; lastX = cx; lastY = cy;
    return;
  }
  const { x, y } = screenToWorld(cx, cy);
  if (store.addAreaDragMode) {
    if (!requirePermission('canAddArea')) return;
    drawingNewArea = true;
    draggingAreaId = resizingAreaId = null;
    startX = x; startY = y; lastX = cx; lastY = cy; isDragging = true;
    store.newAreaRect = { x, y, w: 0, h: 0 };
    scheduleDrawMap();
    return;
  }
  const a = findArea(x, y);
  if (a) {
    if (evt && evt.altKey && hasPermission('canCopyAreaStyle')) { evt.preventDefault(); window.dispatchEvent(new CustomEvent('setMasterArea', { detail: { areaId: a.id } })); return; }
    if (store.masterAreaId && store.masterAreaId !== a.id && evt && evt.ctrlKey && hasPermission('canCopyAreaStyle')) { evt.preventDefault(); window.dispatchEvent(new CustomEvent('applyMasterStyle', { detail: { targetId: a.id } })); return; }
    if (store.areaMultiSelectMode && hasPermission('canAreaMultiSelect')) { window.dispatchEvent(new CustomEvent('handleAreaSelection', { detail: { areaId: a.id, event: evt || {} } })); return; }
    if (a.locked) { draggingAreaId = resizingAreaId = null; openAreaMenu(a); return; }
    const corner = 20 / store.scale;
    if (hasPermission('canResizeArea') && x >= a.x + a.w - corner && y >= a.y + a.h - corner) {
      resizingAreaId = a.id; isDragging = true; resizeStartX = cx; resizeStartY = cy; resizeStartW = a.w; resizeStartH = a.h; draggingAreaId = null; return;
    }
    if (hasPermission('canMoveArea')) draggingAreaId = a.id;
    else draggingAreaId = null;
    resizingAreaId = null;
  } else {
    draggingAreaId = resizingAreaId = null;
  }
  startX = cx; startY = cy; lastX = cx; lastY = cy; isDragging = true;
}

function pointerMove(cx, cy) {
  if (!isDragging) return;
  if (drawingNewArea) {
    if (!hasPermission('canAddArea')) return;
    updateNewAreaRect(cx, cy);
    return;
  }
  if (resizingAreaId) {
    if (!hasPermission('canResizeArea')) return;
    const a = store.areas.find(a => a.id === resizingAreaId);
    if (!a || a.locked) return;
    const dx = (cx - resizeStartX) / store.scale, dy = (cy - resizeStartY) / store.scale;
    a.w = Math.max(30, resizeStartW + dx);
    a.h = Math.max(30, resizeStartH + dy);
    scheduleDrawMap();
    return;
  }
  if (draggingAreaId) {
    if (!hasPermission('canMoveArea') && Math.hypot(cx - startX, cy - startY) >= 5) {
      draggingAreaId = null; isDragging = false; return;
    }
    if (!hasPermission('canMoveArea')) return;
    const a = store.areas.find(a => a.id === draggingAreaId);
    if (!a || a.locked) return;
    const oldX = a.x, oldY = a.y;
    const dx = (cx - lastX) / store.scale, dy = (cy - lastY) / store.scale;
    let newX = a.x + dx, newY = a.y + dy;
    guideLines = calculateGuideLines(a, newX, newY, a.id);
    const snapResult = applySnapWithInfo(a, newX, newY, a.id);
    a.x = snapResult.x; a.y = snapResult.y;
    if (store.areaMultiSelectMode && store.selectedAreaIds.size > 1) {
      const deltaX = a.x - oldX, deltaY = a.y - oldY;
      for (const areaId of store.selectedAreaIds) {
        if (areaId === draggingAreaId) continue;
        const other = store.areas.find(ar => ar.id === areaId);
        if (other && !other.locked) { other.x += deltaX; other.y += deltaY; }
      }
    }
    lastX = cx; lastY = cy;
    scheduleDrawMap();
  } else {
    store.offsetX += cx - lastX;
    store.offsetY += cy - lastY;
    lastX = cx; lastY = cy;
    guideLines = [];
    scheduleDrawMap();
  }
}

async function pointerUp(cx, cy, opts = {}) {
  guideLines = [];
  if (drawingNewArea) {
    if (!requirePermission('canAddArea')) {
      drawingNewArea = false;
      isDragging = false;
      store.newAreaRect = null;
      store.addAreaDragMode = false;
      drawMap();
      return;
    }
    updateNewAreaRect(cx, cy);
    const rect = store.newAreaRect;
    drawingNewArea = false;
    isDragging = false;
    store.newAreaRect = null;
    store.addAreaDragMode = false;
    drawMap();
    if (rect && rect.w >= MIN_NEW_AREA_SIZE && rect.h >= MIN_NEW_AREA_SIZE) {
      window.dispatchEvent(new CustomEvent('createAreaFromRect', { detail: { rect } }));
    } else {
      showToast('区域太小，请重新拖拽');
    }
    return;
  }
  drawMap();
  if (resizingAreaId) { if (hasPermission('canResizeArea')) { pushState(); await saveDataOnly(); } resizingAreaId = null; isDragging = false; return; }
  if (draggingAreaId) {
    if (Math.hypot(cx - startX, cy - startY) < 5) {
      const a = store.areas.find(a => a.id === draggingAreaId);
      if (a && !a.locked) openAreaMenu(a);
    } else { pushState(); await saveDataOnly(); showToast('区域已移动'); }
    draggingAreaId = null; isDragging = false; return;
  }
  if (Math.hypot(cx - startX, cy - startY) < 5) {
    const { x, y } = screenToWorld(cx, cy);
    const a = findArea(x, y);
    if (a) {
      if (opts.fromTouch && hasPermission('canEditArea')) { isDragging = false; return; }
      if (hasPermission('canEditArea') && !store.areaMultiSelectMode) openAreaMenu(a);
      else openProducts(a);
    }
  }
  isDragging = false;
}

export function attachCanvasEvents() {
  if (!canvas) return;
  if (miniMapCanvas) miniMapCanvas.addEventListener('click', onMiniMapClick);
  canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    if (e.touches.length === 2) {
      clearLongPressTimer();
      pinchActive = true;
      isDragging = false;
      lastTouchDistance = getTouchDistance(e.touches);
      return;
    }
    if (e.touches.length !== 1) return;
    if (!store.addAreaDragMode) setupLongPress(e.touches[0].clientX, e.touches[0].clientY);
    pointerDown(e.touches[0].clientX, e.touches[0].clientY, e);
  }, { passive: false });
  canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    if (e.touches.length === 2) {
      clearLongPressTimer();
      pinchActive = true;
      handlePinchMove(e.touches);
      return;
    }
    if (e.touches.length !== 1) return;
    if (touchStartPoint && Math.hypot(e.touches[0].clientX - touchStartPoint.x, e.touches[0].clientY - touchStartPoint.y) > 10) clearLongPressTimer();
    pointerMove(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: false });
  canvas.addEventListener('touchend', e => {
    clearLongPressTimer();
    if (pinchActive) {
      pinchActive = false;
      lastTouchDistance = 0;
      isDragging = false;
      return;
    }
    if (longPressFired) {
      longPressFired = false;
      return;
    }
    if (e.changedTouches[0]) pointerUp(e.changedTouches[0].clientX, e.changedTouches[0].clientY, { fromTouch: true });
  });
  canvas.addEventListener('mousedown', e => pointerDown(e.clientX, e.clientY, e));
  canvas.addEventListener('mousemove', e => pointerMove(e.clientX, e.clientY));
  canvas.addEventListener('mouseup', e => pointerUp(e.clientX, e.clientY));
  canvas.addEventListener('mouseleave', () => { isDragging = false; resizingAreaId = null; draggingAreaId = null; guideLines = []; scheduleDrawMap(); });
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    let newScale = store.scale + delta;
    newScale = Math.min(store.MAX_SCALE, Math.max(store.MIN_SCALE, newScale));
    if (newScale === store.scale) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left, mouseY = e.clientY - rect.top;
    const worldX = (mouseX - store.offsetX) / store.scale, worldY = (mouseY - store.offsetY) / store.scale;
    store.scale = newScale;
    store.offsetX = mouseX - worldX * store.scale;
    store.offsetY = mouseY - worldY * store.scale;
    clampViewToBounds();
    const zoomSlider = document.getElementById('zoomSlider');
    if (zoomSlider) zoomSlider.value = store.scale;
    scheduleDrawMap();
  }, { passive: false });
}
