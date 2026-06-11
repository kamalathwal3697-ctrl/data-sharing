// -------------------------------------------------------------
// Frontend Logic: Summer Camp Media Portal
// -------------------------------------------------------------

// Application State
let state = {
  authenticated: false,
  isAdmin: false,
  allMedia: [],
  filteredMedia: [],
  currentMediaIndex: -1,
  filters: {
    format: 'all',     // 'all' | 'photo' | 'video'
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
const loadingSpinner = document.getElementById('loading-spinner');
const emptyState = document.getElementById('empty-state');
const searchInput = document.getElementById('search-input');
const clearSearchBtn = document.getElementById('clear-search');
const categoryTabsContainer = document.getElementById('category-tabs');
const formatFilters = document.querySelectorAll('.format-filters .filter-tab');
const refreshBtn = document.getElementById('refresh-btn');
const logoutBtn = document.getElementById('logout-btn');

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
      } else {
        showLoginError();
      }
    } catch (err) {
      showLoginError();
    }
  });

  // Logout Click
  logoutBtn.addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    state.authenticated = false;
    showScreen('auth');
    passcodeInput.value = '';
  });

  // Refresh Sync Click
  refreshBtn.addEventListener('click', async () => {
    refreshBtn.classList.add('animate-spin');
    try {
      await fetch('/api/media/clear-cache', { method: 'POST' });
      await loadMedia();
    } catch (err) {
      console.error('Failed to sync Drive:', err);
    } finally {
      refreshBtn.classList.remove('animate-spin');
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

  // Format Filter Clicks (All, Photos, Videos)
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

// Switch between Login and Gallery Screens
function showScreen(screen) {
  if (screen === 'gallery') {
    authScreen.classList.remove('active');
    galleryScreen.classList.add('active');
    
    // Toggle admin badge in header
    const h2 = document.querySelector('.logo-text h2');
    if (h2) {
      let badge = document.getElementById('admin-badge');
      if (state.isAdmin) {
        if (!badge) {
          badge = document.createElement('span');
          badge.id = 'admin-badge';
          badge.className = 'admin-badge';
          badge.textContent = 'Admin Mode 🛠️';
          h2.appendChild(badge);
        }
      } else {
        if (badge) badge.remove();
      }
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
    
    buildCategoryTabs();
    applyFilters();
  } catch (err) {
    console.error('Error loading media:', err);
    mediaGrid.innerHTML = `<p class="error-msg active">Error connecting to Google Drive. Check configuration.</p>`;
  } finally {
    showLoader(false);
  }
}

// Show/Hide main spinner
function showLoader(show) {
  if (show) {
    loadingSpinner.classList.remove('hidden');
    mediaGrid.classList.add('hidden');
    emptyState.classList.add('hidden');
  } else {
    loadingSpinner.classList.add('hidden');
    mediaGrid.classList.remove('hidden');
  }
}

// Generate Day/Folder tabs dynamically
function buildCategoryTabs() {
  // Get distinct categories
  const categories = ['all', ...new Set(state.allMedia.map(item => item.category))];
  
  categoryTabsContainer.innerHTML = '';
  
  categories.forEach(cat => {
    const button = document.createElement('button');
    button.className = `filter-tab ${cat === state.filters.category ? 'active' : ''}`;
    button.setAttribute('data-category', cat);
    button.textContent = cat === 'all' ? 'All Days' : cat;
    
    button.addEventListener('click', () => {
      document.querySelectorAll('#category-tabs .filter-tab').forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');
      state.filters.category = cat;
      applyFilters();
    });
    
    categoryTabsContainer.appendChild(button);
  });
}

// Filter files list based on current filters and search
function applyFilters() {
  const { format, category, search } = state.filters;
  
  state.filteredMedia = state.allMedia.filter(item => {
    // 1. Format Filter
    const isVideo = item.mimeType.startsWith('video/');
    if (format === 'photo' && isVideo) return false;
    if (format === 'video' && !isVideo) return false;
    
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

// Formats file size
function formatBytes(bytes, decimals = 1) {
  if (!bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Formats file date
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

// Render dynamic card items
function renderGrid() {
  mediaGrid.innerHTML = '';
  
  if (state.filteredMedia.length === 0) {
    emptyState.classList.remove('hidden');
    return;
  }
  
  emptyState.classList.add('hidden');
  
  state.filteredMedia.forEach((file, index) => {
    const isVideo = file.mimeType.startsWith('video/');
    const card = document.createElement('div');
    card.className = 'media-card';
    card.setAttribute('data-id', file.id);
    card.setAttribute('data-index', index);
    
    // Staggered fade in animation
    card.style.animationDelay = `${Math.min(index * 0.03, 0.6)}s`;

    // High resolution preview is proxied securely
    const previewUrl = `/api/media/preview/${file.id}`;
    
    let playIconHtml = '';
    if (isVideo) {
      playIconHtml = `
        <div class="video-overlay-icon">
          <i data-lucide="play"></i>
        </div>
      `;
    }

    let adminControlsHtml = '';
    if (state.isAdmin) {
      adminControlsHtml = `
        <div class="card-admin-actions" onclick="event.stopPropagation();">
          <button class="card-action-btn edit-btn" title="Rename file">
            <i data-lucide="edit-2"></i>
          </button>
          <button class="card-action-btn delete-btn" title="Move to Trash">
            <i data-lucide="trash-2"></i>
          </button>
        </div>
      `;
    }

    card.innerHTML = `
      <div class="media-thumb-container">
        <img src="${previewUrl}" class="media-thumb" loading="lazy" alt="${file.name}" onerror="this.src='/api/media/preview/${file.id}'">
        <span class="card-badge">${file.category}</span>
        ${adminControlsHtml}
        ${playIconHtml}
        <div class="card-details">
          <span class="card-title" title="${file.name}">${file.name}</span>
          <div class="card-meta">
            <span>${formatDate(file.createdTime).split(',')[0]}</span>
            <div class="card-size-info">
              <i data-lucide="hard-drive" style="width:11px;height:11px;"></i>
              <span>${formatBytes(file.size)}</span>
            </div>
          </div>
        </div>
      </div>
    `;

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

    card.addEventListener('click', () => openLightbox(index));
    mediaGrid.appendChild(card);
  });
  
  lucide.createIcons();
}

// Lightbox State
let isDirectPlayActive = false;

// Lightbox: Open modal and load content
function openLightbox(index) {
  state.currentMediaIndex = index;
  const file = state.filteredMedia[index];
  if (!file) return;

  lightbox.classList.add('active');
  document.body.style.overflow = 'hidden'; // Lock background scroll

  // Set file metadata
  lightboxTitle.textContent = file.name;
  lightboxTitle.title = file.name;
  lightboxCategory.textContent = file.category;
  lightboxDate.textContent = formatDate(file.createdTime);
  
  // Set download link
  lightboxDownload.href = `/api/media/download/${file.id}`;

  const isVideo = file.mimeType.startsWith('video/');
  isDirectPlayActive = false; // Reset to Google Player default when opening new media
  
  if (isVideo) {
    lightboxPlayDirect.classList.remove('hidden');
    lightboxPlayDirect.innerHTML = '<i data-lucide="video"></i><span>Direct Play</span>';
  } else {
    lightboxPlayDirect.classList.add('hidden');
  }
  lucide.createIcons();

  // Load Content
  loadLightboxMedia(file);
}

// Lightbox: Toggle Direct Play / Google Player
function toggleDirectPlay() {
  const file = state.filteredMedia[state.currentMediaIndex];
  if (!file) return;

  isDirectPlayActive = !isDirectPlayActive;
  
  if (isDirectPlayActive) {
    // Switch to direct HTML5 video stream
    const downloadUrl = `/api/media/download/${file.id}`;
    const isAndroid = /Android/i.test(navigator.userAgent);
    
    let androidTipHtml = '';
    if (isAndroid) {
      androidTipHtml = `
        <div style="position: absolute; bottom: 10px; left: 10px; right: 10px; background: rgba(0,0,0,0.8); padding: 8px 12px; border-radius: 6px; font-size: 0.75rem; color: #fbbf24; text-align: center; z-index: 10;">
          💡 Android Chrome doesn't play raw iPhone HEVC directly. If playback fails, click <strong>"Download Original"</strong> below to watch it instantly in your gallery!
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
    // Switch back to Google player
    loadLightboxMedia(file);
    lightboxPlayDirect.innerHTML = '<i data-lucide="video"></i><span>Direct Play</span>';
  }
  lucide.createIcons();
}

// Lightbox: Inject image or video/iframe element
function loadLightboxMedia(file) {
  const isVideo = file.mimeType.startsWith('video/');
  lightboxContent.innerHTML = '<div class="spinner"></div>'; // Loading indicator

  if (isVideo) {
    // For HEVC/H.265 videos and standard iOS formats, we embed the Google Drive Preview Player.
    // It automatically transcodes to browser-supported H.264 streams on-the-fly.
    // This is 100% reliable across all browsers (Chrome, Android, Edge) for iOS mov/mp4 videos.
    const embedUrl = `https://drive.google.com/file/d/${file.id}/preview`;
    
    lightboxContent.innerHTML = `
      <div class="lightbox-video-wrapper">
        <iframe src="${embedUrl}" allow="autoplay" allowfullscreen></iframe>
      </div>
    `;
  } else {
    // For photos (including HEIC), we fetch our high-resolution proxy preview (JPEG).
    const previewUrl = `/api/media/preview/${file.id}`;
    
    const img = new Image();
    img.src = previewUrl;
    img.alt = file.name;
    img.onload = () => {
      lightboxContent.innerHTML = '';
      lightboxContent.appendChild(img);
    };
    img.onerror = () => {
      lightboxContent.innerHTML = `<p class="error-msg active">Failed to load preview. Please use the Download button below.</p>`;
    };
  }
}

// Lightbox: Close modal
function closeLightbox() {
  lightbox.classList.remove('active');
  document.body.style.overflow = ''; // Unlock scroll
  lightboxContent.innerHTML = ''; // Clear content to stop playing video
  state.currentMediaIndex = -1;
  isDirectPlayActive = false;
  lightboxPlayDirect.classList.add('hidden');
}

// Lightbox: Navigate Previous / Next
function navigateLightbox(direction) {
  if (state.currentMediaIndex === -1) return;
  
  let newIndex = state.currentMediaIndex + direction;
  const length = state.filteredMedia.length;
  
  // Wrap around index
  if (newIndex < 0) newIndex = length - 1;
  if (newIndex >= length) newIndex = 0;
  
  openLightbox(newIndex);
}

// Admin Operations
async function renameFile(fileId, currentName) {
  const newName = prompt('Enter new file name:', currentName);
  if (newName === null) return; // Cancelled
  if (newName.trim() === '') {
    alert('File name cannot be empty.');
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
      await loadMedia();
    } else {
      alert(data.error || 'Failed to rename file.');
      showLoader(false);
    }
  } catch (err) {
    console.error(err);
    alert('Error connecting to server.');
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
      await loadMedia();
    } else {
      alert(data.error || 'Failed to delete file.');
      showLoader(false);
    }
  } catch (err) {
    console.error(err);
    alert('Error connecting to server.');
    showLoader(false);
  }
}
