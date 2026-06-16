// js/utils.js

export function showToast(msg, dur = 1500) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), dur);
}

export function genId() {
  return 'p_' + Date.now() + Math.random().toString(36).substr(2, 6);
}

export function genAreaId() {
  return 'a_' + Date.now() + Math.random().toString(36).substr(2, 6);
}

export function formatTimestamp(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

export function cleanProductData(p) {
  return {
    id: p.id || genId(),
    name: p.name || p.title || '',
    barcode: p.barcode || '',
    specification: p.specification || p.spec || '',
    unit: p.unit || '',
    stock: p.stock || p.quantity || 0,
    imageDataUrl: p.imageDataUrl || '',
    lastModified: p.lastModified || Date.now(),
    favorite: p.favorite || false
  };
}

export function cleanAreaData(a) {
  return {
    id: a.id || genAreaId(),
    code: a.code || null,
    name: a.name || '未命名区域',
    x: a.x || 100,
    y: a.y || 100,
    w: a.w || 180,
    h: a.h || 150,
    color: a.color || '#3498db',
    textColor: a.textColor || '#ffffff',
    fontSize: a.fontSize || 14,
    textDirection: a.textDirection || 'horizontal',
    shape: a.shape || 'rect',
    products: (a.products || []).map(p => cleanProductData(p)).filter(p => p.name),
    locked: a.locked || false
  };
}

export function generateAreaCode(areas) {
  let maxNum = 0;
  areas.forEach(a => {
    if (a.code && a.code.startsWith('area')) {
      let num = parseInt(a.code.substring(4));
      if (!isNaN(num) && num > maxNum) maxNum = num;
    }
  });
  return 'area' + String(maxNum + 1).padStart(7, '0');
}

export function ensureAreaCode(area, areas) {
  if (!area.code) area.code = generateAreaCode(areas);
  else if (areas.find(a => a.id !== area.id && a.code === area.code)) area.code = generateAreaCode(areas);
  return area;
}