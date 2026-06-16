// js/store.js

export const ROLE_KEYS = {
  GUEST: 'guest',
  STAFF: 'staff',
  DESIGNER: 'designer'
};

export const ROLE_LABELS = {
  guest: '👤 游客',
  staff: '🧰 工作人员',
  designer: '🎨 设计者'
};

// 角色密码（可选，软门槛）。
// ⚠️ 这是纯前端应用：此处的密码无法提供真正的安全保护，任何人都能在浏览器
// 开发者工具中查看或绕过它。请勿在此填写任何真实或敏感密码。
// 留空（''）表示对应角色无需密码即可切换。部署者可按需自行填写。
export const ROLE_PASSWORDS = {
  staff: '',
  designer: ''
};

const guestPermissions = {
  canBrowseArea: true,
  canSearch: true,
  canFavoriteProduct: true,
  canDownloadProductImage: true,
  canDownloadProductCsv: true,
  canAddProduct: false,
  canEditProduct: false,
  canDeleteProduct: false,
  canMoveProduct: false,
  canBatchImportProduct: false,
  canBatchImportImage: false,
  canEditArea: false,
  canAddArea: false,
  canDeleteArea: false,
  canCopyArea: false,
  canMoveArea: false,
  canResizeArea: false,
  canLockArea: false,
  canUnlockArea: false,
  canAreaMultiSelect: false,
  canCopyAreaStyle: false,
  canUndoRedo: false,
  canClearHistory: false,
  canImportData: false,
  canExportData: true
};

export const ROLE_PERMISSIONS = {
  guest: guestPermissions,
  staff: {
    ...guestPermissions,
    canAddProduct: true,
    canEditProduct: true,
    canDeleteProduct: true,
    canMoveProduct: true,
    canBatchImportProduct: true,
    canBatchImportImage: true
  },
  designer: Object.fromEntries(Object.keys(guestPermissions).map(key => [key, true]))
};

const ROLE_STORAGE_KEY = 'mallCurrentUserRole';

export const store = {
  areas: [],
  currentMode: 'browse',
  currentUserRole: ROLE_KEYS.GUEST,

  // View transform
  offsetX: 0,
  offsetY: 0,
  scale: 1.0,
  MIN_SCALE: 0.2,
  MAX_SCALE: 2.5,
  isLandscape: false,
  isDesktopMode: false,
  snapEnabled: true,

  // Highlight & search
  highlightedAreaIds: new Set(),
  highlightTimer: null,
  currentSearchFilter: '',

  // Current area / product operation ids
  editingProductAreaId: null,
  currentMenuAreaId: null,
  editingProductId: null,

  // Product grid settings
  productColumns: 2,
  currentSortField: 'lastModified',
  currentSortOrder: 'asc',

  // Product multi-select state
  selectMode: false,
  selectedProductIds: new Set(),
  lastSelectedProductId: null,
  favoriteProductIds: new Set(),
  isFullSelect: false,

  // Rect selection / add-area state
  isRectSelecting: false,
  rectStartX: 0,
  rectStartY: 0,
  selectionRect: null,
  addAreaDragMode: false,
  newAreaRect: null,

  // Product detail modal
  currentDetailArea: null,
  currentDetailProductIds: [],
  currentDetailIndex: -1,

  // Batch import cache
  pendingBatchAreaId: null,
  currentParsedProducts: null,
  currentImagePreviewData: [],
  lockOperationInProgress: false,

  // Area multi-select
  areaMultiSelectMode: false,
  selectedAreaIds: new Set(),
  lastSelectedAreaId: null,

  // Style master area
  masterAreaId: null,

  // Search history
  searchHistory: []
};

export const appHistory = {
  stack: [],
  index: -1
};

export const MAX_HISTORY = 50;

function normalizeRole(role) {
  return Object.values(ROLE_KEYS).includes(role) ? role : ROLE_KEYS.GUEST;
}

export function getCurrentPermissions() {
  return ROLE_PERMISSIONS[store.currentUserRole] || ROLE_PERMISSIONS.guest;
}

export function hasPermission(key) {
  return Boolean(getCurrentPermissions()[key]);
}

export function setCurrentUserRole(role) {
  const normalizedRole = normalizeRole(role);
  store.currentUserRole = normalizedRole;
  store.currentMode = normalizedRole === ROLE_KEYS.DESIGNER ? 'edit' : 'browse';
  try {
    localStorage.setItem(ROLE_STORAGE_KEY, normalizedRole);
  } catch {
    // localStorage is optional; permissions still work for the current session.
  }
  return normalizedRole;
}

export function loadSavedUserRole() {
  let savedRole = ROLE_KEYS.GUEST;
  try {
    savedRole = localStorage.getItem(ROLE_STORAGE_KEY) || ROLE_KEYS.GUEST;
  } catch {
    savedRole = ROLE_KEYS.GUEST;
  }
  return setCurrentUserRole(savedRole);
}
