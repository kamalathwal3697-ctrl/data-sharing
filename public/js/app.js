// -------------------------------------------------------------
// Frontend Logic: StepUp Dance Studio SaaS Media Portal
// -------------------------------------------------------------

// Application State
let state = {
  authenticated: false,
  isAdmin: false,
  allMedia: [],
  filteredMedia: [],
  favorites: [],
  currentMediaIndex: -1,
  filters: {
    format: 'all',     // 'all' | 'photo' | 'video' | 'favorite'
    category: 'all',   // 'all' | folder name
    search: ''
  }
};

// DOM Elements
const authScreen = document.getElementById('auth-screen');
const galleryScreen = document.getElementById('gallery-screen');
const loginForm = document.getElementById('login-form');
const passcodeInput = document.getElementById('passcode');
const togglePasswordBtn = document.getElementById('toggle-password');
const eyeIcon = document.getElementById('eye-icon');
const loginError = document.getElementById('login-error');
const mediaGrid = document.getElementById('media-grid');
const skeletonGrid = document.getElementById('skeleton-grid');
const emptyState = document.getElementById('empty-state');
const searchInput = document.getElementById('search-input');
const clearSearchBtn = document.getElementById('clear-search');
const categoryTabsContainer = document.getElementById('category-tabs');
const formatFilters = document.querySelectorAll('.format-filters .filter-tab');
const refreshBtn = document.getElementById('refresh-btn');
const logoutBtn = document.getElementById('logout-btn');

// Header Profile Dropdown Elements
const profileAvatar = document.getElementById('profile-avatar');
const avatarDropdown = document.getElementById('avatar-dropdown');

// Header Upload Elements
const headerUploadBtn = document.getElementById('header-upload-btn');
const hiddenFileInput = document.getElementById('hidden-file-input');

// Drag and Drop Overlay Elements
const dragOverlay = document.getElementById('upload-drag-overlay');
const targetFolderDesc = document.getElementById('drag-overlay-target');

// Lightbox Elements
const lightbox = document.getElementById('lightbox');
const lightboxTitle = document.getElementById('lightbox-title');
const lightboxCategory = document.getElementById('lightbox-category');
const lightboxDate = document.getElementById('lightbox-date');
const lightboxDownload = document.getElementById('lightbox-download');
const lightboxContent = document.querySelector('.lightbox-content');
const lightboxClose = document.getElementById('lightbox-close');
const lightboxPrev = document.getElementById('lightbox-prev');
const lightboxNext = document.getElementById('lightbox-next');
const lightboxPlayDirect = document.getElementById('lightbox-play-direct');

// Initial Setup on Load
document.addEventListener('DOMContentLoaded', () => {
  // Load Favorites from LocalStorage
  state.favorites = JSON.parse(localStorage.getItem('stepup_favorites') || '[]');
  
  checkAuth();
  setupEventListeners();
});

// Setup Event Listeners
function setupEventListeners() {
  // Passcode toggle visibility
  togglePasswordBtn.addEventListener('click', () => {
    const isPassword = passcodeInput.type === 'password';
    passcodeInput.type = isPassword ? 'text' : 'password';
    eyeIcon.setAttribute('data-lucide', isPassword ? 'eye-off' : 'eye');
    lucide.createIcons();
  });

  // Login Submit
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const passcode = passcodeInput.value;
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode })
      });
      const data = await response.json();
      
      if (response.ok && data.success) {
        state.authenticated = true;
        state.isAdmin = !!data.isAdmin;
        loginError.classList.remove('active');
        showScreen('gallery');
        loadMedia();
        showToast(`Logged in successfully ${state.isAdmin ? 'as Administrator' : ''}`, 'success');
      } else {
        showLoginError();
      }
    } catch (err) {
      showLoginError();
    }
  });

  // Logout Click
  logoutBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    await fetch('/api/auth/logout', { method: 'POST' });
    state.authenticated = false;
    showScreen('auth');
    passcodeInput.value = '';
    showToast('Logged out successfully', 'info');
  });

  // Profile avatar click to toggle dropdown
  profileAvatar.addEventListener('click', (e) => {
    e.stopPropagation();
    avatarDropdown.classList.toggle('active');
  });

  // Close dropdown on click outside
  document.addEventListener('click', () => {
    avatarDropdown.classList.remove('active');
  });

  // Upload button opens file picker (Admins only)
  headerUploadBtn.addEventListener('click', () => {
    if (!state.isAdmin) {
      showToast('Only administrators can upload files to the gallery.', 'error');
      return;
    }
    hiddenFileInput.click();
  });

  // File Input Change
  hiddenFileInput.addEventListener('change', (e) => {
    const files = e.target.files;
    if (files.length > 0) {
      handleFileUploads(files);
    }
  });

  // Drag-and-Drop window listeners (Admins only get active drop zone overlays)
  window.addEventListener('dragenter', (e) => {
    e.preventDefault();
    if (state.authenticated) {
      const activeCategory = state.filters.category === 'all' ? 'General' : state.filters.category;
      targetFolderDesc.textContent = `Files will be added directly to: ${activeCategory}`;
      dragOverlay.classList.add('active');
    }
  });

  dragOverlay.addEventListener('dragover', (e) => {
    e.preventDefault();
  });

  dragOverlay.addEventListener('dragleave', (e) => {
    e.preventDefault();
    // Verify leaving dropzone boundary
    if (e.relatedTarget === null) {
      dragOverlay.classList.remove('active');
    }
  });

  dragOverlay.addEventListener('drop', (e) => {
    e.preventDefault();
    dragOverlay.classList.remove('active');
    if (!state.isAdmin) {
      showToast('Only administrators can upload files to the gallery.', 'error');
      return;
    }
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileUploads(files);
    }
  });

  // Refresh Sync Click
  refreshBtn.addEventListener('click', async () => {
    refreshBtn.querySelector('i').classList.add('animate-spin');
    showToast('Syncing files with Google Drive...', 'info');
    try {
      await fetch('/api/media/clear-cache', { method: 'POST' });
      await loadMedia();
      showToast('Media synced successfully!', 'success');
    } catch (err) {
      console.error('Failed to sync Drive:', err);
      showToast('Failed to sync Drive files.', 'error');
    } finally {
      refreshBtn.querySelector('i').classList.remove('animate-spin');
    }
  });

  // Search Input Handler
  searchInput.addEventListener('input', (e) => {
    state.filters.search = e.target.value.toLowerCase().trim();
    if (state.filters.search) {
      clearSearchBtn.classList.remove('hidden');
    } else {
      clearSearchBtn.classList.add('hidden');
    }
    applyFilters();
  });

  // Clear Search
  clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    state.filters.search = '';
    clearSearchBtn.classList.add('hidden');
    applyFilters();
  });

  // Format Filter Clicks (All Media, Photos, Videos, Favorites)
  formatFilters.forEach(tab => {
    tab.addEventListener('click', (e) => {
      formatFilters.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.filters.format = tab.getAttribute('data-filter');
      applyFilters();
    });
  });

  // Lightbox Close
  lightboxClose.addEventListener('click', closeLightbox);
  document.querySelector('.lightbox-overlay').addEventListener('click', closeLightbox);

  // Lightbox Navigation
  lightboxPrev.addEventListener('click', (e) => { e.stopPropagation(); navigateLightbox(-1); });
  lightboxNext.addEventListener('click', (e) => { e.stopPropagation(); navigateLightbox(1); });

  // Lightbox Direct Play Toggle
  lightboxPlayDirect.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleDirectPlay();
  });

  // Lightbox Favorite Click
  const lightboxFavBtn = document.getElementById('lightbox-favorite-btn');
  if (lightboxFavBtn) {
    lightboxFavBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const file = state.filteredMedia[state.currentMediaIndex];
      if (file) {
        toggleFavorite(file.id);
        // Refresh active state immediately in lightbox
        const isFav = state.favorites.includes(file.id);
        lightboxFavBtn.classList.toggle('active', isFav);
        const lightboxHeartIcon = document.getElementById('lightbox-heart-icon');
        if (lightboxHeartIcon) {
          if (isFav) {
            lightboxHeartIcon.style.fill = '#ff4d6d';
            lightboxHeartIcon.style.color = '#ff4d6d';
          } else {
            lightboxHeartIcon.style.fill = 'none';
            lightboxHeartIcon.style.color = 'currentColor';
          }
        }
      }
    });
  }

  // Lightbox Share Click
  const lightboxShareBtn = document.getElementById('lightbox-share-btn');
  if (lightboxShareBtn) {
    lightboxShareBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const file = state.filteredMedia[state.currentMediaIndex];
      if (file) {
        shareMedia(file.id, file.name);
      }
    });
  }

  // Keyboard Navigation for Lightbox & Portal
  document.addEventListener('keydown', (e) => {
    if (!lightbox.classList.contains('active')) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') navigateLightbox(-1);
    if (e.key === 'ArrowRight') navigateLightbox(1);
  });
}

// Check if user is already authenticated
async function checkAuth() {
  try {
    const response = await fetch('/api/auth/check');
    const data = await response.json();
    if (data.authenticated) {
      state.authenticated = true;
      state.isAdmin = !!data.isAdmin;
      showScreen('gallery');
      loadMedia();
    } else {
      showScreen('auth');
    }
  } catch (err) {
    showScreen('auth');
  }
}

// Switch between screens
function showScreen(screen) {
  if (screen === 'gallery') {
    authScreen.classList.remove('active');
    galleryScreen.classList.add('active');
    
    // Toggle avatar profile details in dropdown
    const roleText = document.getElementById('dropdown-user-role');
    const descText = document.getElementById('dropdown-user-desc');
    const avatarInitials = document.querySelector('.avatar-initials');
    
    if (state.isAdmin) {
      if (roleText) roleText.textContent = 'Administrator';
      if (descText) descText.textContent = 'Admin Mode 🛠️';
      if (avatarInitials) avatarInitials.textContent = 'AD';
      if (headerUploadBtn) headerUploadBtn.classList.remove('hidden');
    } else {
      if (roleText) roleText.textContent = 'Parent User';
      if (descText) descText.textContent = 'Parent Access';
      if (avatarInitials) avatarInitials.textContent = 'PA';
      if (headerUploadBtn) headerUploadBtn.classList.add('hidden');
    }
  } else {
    galleryScreen.classList.remove('active');
    authScreen.classList.add('active');
  }
  lucide.createIcons();
}

// Show login error shake
function showLoginError() {
  loginError.classList.add('active');
  passcodeInput.focus();
}

// Dynamic toast system
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  let iconName = 'info';
  if (type === 'success') iconName = 'check-circle';
  if (type === 'error') iconName = 'alert-triangle';
  
  toast.innerHTML = `
    <i data-lucide="${iconName}" class="toast-icon"></i>
    <span class="toast-message">${message}</span>
  `;
  
  container.appendChild(toast);
  lucide.createIcons();
  
  // Auto remove after 3.5s
  setTimeout(() => {
    toast.classList.add('removing');
    toast.addEventListener('transitionend', () => {
      toast.remove();
    });
  }, 3500);
}

// Load media files from backend
async function loadMedia() {
  showLoader(true);
  try {
    const response = await fetch('/api/media');
    if (!response.ok) {
      if (response.status === 401) {
        showScreen('auth');
        return;
      }
      throw new Error('Failed to load files');
    }
    const data = await response.json();
    state.allMedia = data;
    
    renderStats();
    buildCategoryTabs();
    applyFilters();
  } catch (err) {
    console.error('Error loading media:', err);
    mediaGrid.innerHTML = `<p class="error-msg active" style="grid-column: 1/-1; text-align: center;">Error connecting to Google Drive. Check configuration.</p>`;
  } finally {
    showLoader(false);
  }
}

// Show/Hide loaders
function showLoader(show) {
  if (show) {
    skeletonGrid.classList.remove('hidden');
    mediaGrid.classList.add('hidden');
    emptyState.classList.add('hidden');
  } else {
    skeletonGrid.classList.add('hidden');
  }
}

// Compute & Render statistics in Hero Section
function renderStats() {
  const photosCount = state.allMedia.filter(item => item.mimeType.startsWith('image/')).length;
  const videosCount = state.allMedia.filter(item => item.mimeType.startsWith('video/')).length;
  const uniqueDays = new Set(state.allMedia.map(item => item.category).filter(c => c !== 'General')).size;
  const totalBytes = state.allMedia.reduce((sum, item) => sum + (item.size || 0), 0);
  
  document.getElementById('stat-photos').textContent = photosCount.toLocaleString();
  document.getElementById('stat-videos').textContent = videosCount.toLocaleString();
  document.getElementById('stat-days').textContent = uniqueDays.toLocaleString();
  document.getElementById('stat-storage').textContent = formatBytes(totalBytes);
}

// Generate category Day filter tabs dynamically with count badges
function buildCategoryTabs() {
  const categories = [...new Set(state.allMedia.map(item => item.category))];
  
  // Sort: General first, then folders numerically, then alphabetized
  categories.sort((a, b) => {
    if (a === 'General') return -1;
    if (b === 'General') return 1;
    
    const aMatch = a.match(/\d+/);
    const bMatch = b.match(/\d+/);
    
    if (aMatch && bMatch) {
      return parseInt(aMatch[0], 10) - parseInt(bMatch[0], 10);
    }
    
    return a.localeCompare(b);
  });
  
  categoryTabsContainer.innerHTML = '';
  
  // Add master Day filter tab
  const allTabs = ['all', ...categories];
  
  allTabs.forEach(cat => {
    const count = cat === 'all' 
      ? state.allMedia.length 
      : state.allMedia.filter(item => item.category === cat).length;
      
    const button = document.createElement('button');
    button.className = `filter-tab ${cat === state.filters.category ? 'active' : ''}`;
    button.setAttribute('data-category', cat);
    
    const label = cat === 'all' ? 'All Days' : cat;
    button.innerHTML = `
      <span>${label}</span>
      <span class="tab-badge" style="background:rgba(255,255,255,0.08); font-size:0.75rem; padding:0.15rem 0.45rem; border-radius:99px; margin-left:0.3rem;">${count}</span>
    `;
    
    button.addEventListener('click', () => {
      document.querySelectorAll('#category-tabs .filter-tab').forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');
      state.filters.category = cat;
      applyFilters();
    });
    
    categoryTabsContainer.appendChild(button);
  });
}

// Filter files list based on format filters, category filter, and search text
function applyFilters() {
  const { format, category, search } = state.filters;
  
  state.filteredMedia = state.allMedia.filter(item => {
    // 1. Format Filter
    const isVideo = item.mimeType.startsWith('video/');
    if (format === 'photo' && isVideo) return false;
    if (format === 'video' && !isVideo) return false;
    if (format === 'favorite') {
      const isFav = state.favorites.includes(item.id);
      if (!isFav) return false;
    }
    
    // 2. Category Filter
    if (category !== 'all' && item.category !== category) return false;
    
    // 3. Search Filter
    if (search) {
      const nameMatch = item.name.toLowerCase().includes(search);
      const catMatch = item.category.toLowerCase().includes(search);
      return nameMatch || catMatch;
    }
    
    return true;
  });
  
  renderGrid();
}

// Formats file sizes
function formatBytes(bytes, decimals = 1) {
  if (!bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Formats file dates
function formatDate(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Render dynamic card items in responsive Masonry grid
function renderGrid() {
  mediaGrid.innerHTML = '';
  
  if (state.filteredMedia.length === 0) {
    mediaGrid.classList.add('hidden');
    emptyState.classList.remove('hidden');
    return;
  }
  
  emptyState.classList.add('hidden');
  mediaGrid.classList.remove('hidden');
  
  state.filteredMedia.forEach((file, index) => {
    const isVideo = file.mimeType.startsWith('video/');
    const card = document.createElement('div');
    card.className = `media-card ${isVideo ? 'is-video' : 'is-photo'}`;
    card.setAttribute('data-id', file.id);
    card.setAttribute('data-index', index);
    
    card.style.animationDelay = `${Math.min(index * 0.02, 0.4)}s`;
    
    const previewUrl = `/api/media/preview/${file.id}`;
    const isFav = state.favorites.includes(file.id);
    
    let badgeHtml = `<span class="card-badge">${file.category}</span>`;
    let overlayIconHtml = '';
    
    if (isVideo) {
      badgeHtml += `
        <span class="duration-badge">
          <i data-lucide="play"></i>
          <span>Video</span>
        </span>
      `;
      overlayIconHtml = `
        <div class="video-overlay-icon">
          <i data-lucide="play"></i>
        </div>
      `;
    } else {
      overlayIconHtml = `
        <div class="photo-overlay-icon">
          <i data-lucide="maximize-2"></i>
        </div>
      `;
    }
    
    let adminControlsHtml = '';
    if (state.isAdmin) {
      adminControlsHtml = `
        <button class="card-action-btn edit-btn" title="Rename file" onclick="event.stopPropagation();">
          <i data-lucide="edit-2"></i>
        </button>
        <button class="card-action-btn delete-btn" title="Move to Trash" onclick="event.stopPropagation();">
          <i data-lucide="trash-2"></i>
        </button>
      `;
    }
    
    card.innerHTML = `
      <div class="media-thumb-container">
        <img src="${previewUrl}" class="media-thumb" loading="lazy" alt="${file.name}" onerror="this.src='/api/media/preview/${file.id}'">
        ${badgeHtml}
        ${overlayIconHtml}
        
        <!-- Hover actions overlay -->
        <div class="card-hover-actions">
          <button class="card-action-btn favorite-btn ${isFav ? 'active' : ''}" data-id="${file.id}" title="Favorite" onclick="event.stopPropagation();">
            <i data-lucide="heart"></i>
          </button>
          <button class="card-action-btn share-btn" title="Copy Direct URL" onclick="event.stopPropagation();">
            <i data-lucide="share-2"></i>
          </button>
          ${adminControlsHtml}
        </div>
        
        <div class="card-details">
          <span class="card-title" title="${file.name}">${file.name}</span>
          <div class="card-meta">
            <span>${formatDate(file.createdTime).split(',')[0]}</span>
            <div class="card-size-info">
              <i data-lucide="hard-drive"></i>
              <span>${formatBytes(file.size)}</span>
            </div>
          </div>
        </div>
      </div>
    `;
    
    // Wire up events
    card.addEventListener('click', () => openLightbox(index));
    
    const favBtn = card.querySelector('.favorite-btn');
    favBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFavorite(file.id);
    });
    
    const shareBtn = card.querySelector('.share-btn');
    shareBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      shareMedia(file.id, file.name);
    });
    
    if (state.isAdmin) {
      card.querySelector('.edit-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        renameFile(file.id, file.name);
      });
      card.querySelector('.delete-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        deleteFile(file.id, file.name);
      });
    }
    
    mediaGrid.appendChild(card);
  });
  
  lucide.createIcons();
}

// Favorites local persistence system
function toggleFavorite(fileId) {
  const index = state.favorites.indexOf(fileId);
  if (index === -1) {
    state.favorites.push(fileId);
    showToast('Added to Favorites ❤️', 'success');
  } else {
    state.favorites.splice(index, 1);
    showToast('Removed from Favorites', 'info');
  }
  localStorage.setItem('stepup_favorites', JSON.stringify(state.favorites));
  
  // Sync immediate button states in the grid
  document.querySelectorAll(`.favorite-btn[data-id="${fileId}"]`).forEach(btn => {
    btn.classList.toggle('active', index === -1);
  });
  
  // Re-apply if looking at favorites
  if (state.filters.format === 'favorite') {
    applyFilters();
  }
}

// Copy URL link to clipboard
function shareMedia(fileId, fileName) {
  const shareUrl = `${window.location.origin}/api/media/download/${fileId}`;
  
  navigator.clipboard.writeText(shareUrl).then(() => {
    showToast(`Download link for "${fileName}" copied to clipboard! 🔗`, 'success');
  }).catch(() => {
    const el = document.createElement('textarea');
    el.value = shareUrl;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    showToast(`Download link for "${fileName}" copied to clipboard! 🔗`, 'success');
  });
}

// Drag and Drop files upload handlers (Sequential XHR with progress computations)
function handleFileUploads(files) {
  let fileIndex = 0;
  
  function uploadNext() {
    if (fileIndex >= files.length) {
      showToast('All files uploaded successfully!', 'success');
      document.getElementById('upload-progress-panel').classList.add('hidden');
      loadMedia();
      return;
    }
    
    const file = files[fileIndex];
    uploadSingleFile(file, () => {
      fileIndex++;
      uploadNext();
    });
  }
  
  uploadNext();
}

function uploadSingleFile(file, callback) {
  const panel = document.getElementById('upload-progress-panel');
  const bar = document.getElementById('upload-progress-bar');
  const text = document.getElementById('upload-progress-text');
  
  panel.classList.remove('hidden');
  
  const xhr = new XMLHttpRequest();
  const formData = new FormData();
  formData.append('file', file);
  formData.append('category', state.filters.category === 'all' ? 'General' : state.filters.category);
  
  xhr.upload.addEventListener('progress', (e) => {
    if (e.lengthComputable) {
      const pct = Math.round((e.loaded / e.total) * 100);
      bar.style.width = pct + '%';
      text.textContent = `Uploading ${file.name} (${pct}%)`;
    }
  });
  
  xhr.addEventListener('load', () => {
    if (xhr.status === 200) {
      callback();
    } else {
      let errText = 'Upload failed';
      try {
        const resObj = JSON.parse(xhr.responseText);
        errText = resObj.error || errText;
      } catch(e) {}
      showToast(errText, 'error');
      panel.classList.add('hidden');
    }
  });
  
  xhr.addEventListener('error', () => {
    showToast(`Network error uploading file: ${file.name}`, 'error');
    panel.classList.add('hidden');
  });
  
  xhr.open('POST', '/api/media/upload');
  xhr.send(formData);
}

// Lightbox State
let isDirectPlayActive = false;

// Lightbox: Open modal and load content
function openLightbox(index) {
  state.currentMediaIndex = index;
  const file = state.filteredMedia[index];
  if (!file) return;

  lightbox.classList.add('active');
  document.body.style.overflow = 'hidden'; 

  // Set file metadata
  lightboxTitle.textContent = file.name;
  lightboxTitle.title = file.name;
  lightboxCategory.textContent = file.category;
  lightboxDate.textContent = formatDate(file.createdTime);
  
  // Set size
  const sizeInfo = document.getElementById('lightbox-size');
  if (sizeInfo) {
    sizeInfo.textContent = formatBytes(file.size);
  }
  
  // Set download link
  lightboxDownload.href = `/api/media/download/${file.id}`;

  const isVideo = file.mimeType.startsWith('video/');
  isDirectPlayActive = false; 
  
  if (isVideo) {
    lightboxPlayDirect.classList.remove('hidden');
    lightboxPlayDirect.innerHTML = '<i data-lucide="play-circle"></i><span>Direct Play</span>';
  } else {
    lightboxPlayDirect.classList.add('hidden');
  }
  
  // Favorite state setting
  const lightboxFavBtn = document.getElementById('lightbox-favorite-btn');
  const lightboxHeartIcon = document.getElementById('lightbox-heart-icon');
  
  if (lightboxFavBtn && lightboxHeartIcon) {
    const isFav = state.favorites.includes(file.id);
    lightboxFavBtn.classList.toggle('active', isFav);
    if (isFav) {
      lightboxHeartIcon.style.fill = '#ff4d6d';
      lightboxHeartIcon.style.color = '#ff4d6d';
    } else {
      lightboxHeartIcon.style.fill = 'none';
      lightboxHeartIcon.style.color = 'currentColor';
    }
  }

  lucide.createIcons();
  loadLightboxMedia(file);
}

// Lightbox: Toggle Direct Play / Google Player
function toggleDirectPlay() {
  const file = state.filteredMedia[state.currentMediaIndex];
  if (!file) return;

  isDirectPlayActive = !isDirectPlayActive;
  
  if (isDirectPlayActive) {
    const downloadUrl = `/api/media/download/${file.id}`;
    const isAndroid = /Android/i.test(navigator.userAgent);
    
    let androidTipHtml = '';
    if (isAndroid) {
      androidTipHtml = `
        <div style="position: absolute; bottom: 10px; left: 10px; right: 10px; background: rgba(0,0,0,0.8); padding: 8px 12px; border-radius: 6px; font-size: 0.75rem; color: #fbbf24; text-align: center; z-index: 10;">
          💡 Android WebView doesn't support raw HEVC play. Use "Download" below if playback stalls!
        </div>
      `;
    }

    lightboxContent.innerHTML = `
      <div class="lightbox-video-wrapper" style="position: relative;">
        <video controls autoplay class="video-player" style="width:100%; height:100%; object-fit:contain;">
          <source src="${downloadUrl}" type="${file.mimeType}">
          Your browser does not support the video tag.
        </video>
        ${androidTipHtml}
      </div>
    `;
    lightboxPlayDirect.innerHTML = '<i data-lucide="refresh-cw"></i><span>Google Player</span>';
  } else {
    loadLightboxMedia(file);
    lightboxPlayDirect.innerHTML = '<i data-lucide="play-circle"></i><span>Direct Play</span>';
  }
  lucide.createIcons();
}

// Lightbox: Inject image or video/iframe element
function loadLightboxMedia(file) {
  const isVideo = file.mimeType.startsWith('video/');
  lightboxContent.innerHTML = '<div class="spinner"></div>'; 

  if (isVideo) {
    const embedUrl = `https://drive.google.com/file/d/${file.id}/preview`;
    
    lightboxContent.innerHTML = `
      <div class="lightbox-video-wrapper">
        <iframe src="${embedUrl}" allow="autoplay" allowfullscreen></iframe>
      </div>
    `;
  } else {
    const previewUrl = `/api/media/preview/${file.id}`;
    
    const img = new Image();
    img.src = previewUrl;
    img.alt = file.name;
    img.onload = () => {
      lightboxContent.innerHTML = '';
      lightboxContent.appendChild(img);
    };
    img.onerror = () => {
      lightboxContent.innerHTML = `<p class="error-msg active">Failed to load preview. Please use the Download button above.</p>`;
    };
  }
}

// Lightbox: Close modal
// Switch focus/overflow locks back
function closeLightbox() {
  lightbox.classList.remove('active');
  document.body.style.overflow = ''; 
  lightboxContent.innerHTML = ''; 
  state.currentMediaIndex = -1;
  isDirectPlayActive = false;
  lightboxPlayDirect.classList.add('hidden');
}

// Lightbox: Navigate Previous / Next
function navigateLightbox(direction) {
  if (state.currentMediaIndex === -1) return;
  
  let newIndex = state.currentMediaIndex + direction;
  const length = state.filteredMedia.length;
  
  if (newIndex < 0) newIndex = length - 1;
  if (newIndex >= length) newIndex = 0;
  
  openLightbox(newIndex);
}

// Admin Operations
async function renameFile(fileId, currentName) {
  const newName = prompt('Enter new file name:', currentName);
  if (newName === null) return; 
  if (newName.trim() === '') {
    showToast('File name cannot be empty.', 'error');
    return;
  }
  
  showLoader(true);
  try {
    const response = await fetch(`/api/media/${fileId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim() })
    });
    const data = await response.json();
    
    if (response.ok && data.success) {
      showToast('File renamed successfully!', 'success');
      await loadMedia();
    } else {
      showToast(data.error || 'Failed to rename file.', 'error');
      showLoader(false);
    }
  } catch (err) {
    console.error(err);
    showToast('Error connecting to server.', 'error');
    showLoader(false);
  }
}

async function deleteFile(fileId, name) {
  const confirmed = confirm(`Are you sure you want to move "${name}" to the Google Drive Trash?`);
  if (!confirmed) return;
  
  showLoader(true);
  try {
    const response = await fetch(`/api/media/${fileId}`, {
      method: 'DELETE'
    });
    const data = await response.json();
    
    if (response.ok && data.success) {
      showToast('File deleted successfully.', 'success');
      await loadMedia();
    } else {
      showToast(data.error || 'Failed to delete file.', 'error');
      showLoader(false);
    }
  } catch (err) {
    console.error(err);
    showToast('Error connecting to server.', 'error');
    showLoader(false);
  }
}
