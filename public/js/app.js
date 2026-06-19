// -------------------------------------------------------------
// Frontend Logic: StepUp Dance Studio SaaS Media Portal
// -------------------------------------------------------------

function checkIsVideo(file) {
  if (!file) return false;
  const mime = file.mimeType || '';
  const name = file.name || '';
  return mime.startsWith('video/') || /\.(mp4|mov|m4v|avi|webm|qt|3gp|mkv|hevc)$/i.test(name);
}

// Application State
let state = {
  authenticated: false,
  isAdmin: false,
  allMedia: [],
  filteredMedia: [],
  favorites: [],
  currentMediaIndex: -1,
  downloadStats: {
    isSubscribed: false,
    photosLeft: 3,
    videosLeft: 3
  },
  filters: {
    format: 'all',     // 'all' | 'photo' | 'video' | 'favorite' | 'people'
    category: 'all',   // 'all' | folder name
    search: '',
    person: null       // { id, name, photoIds[], faceThumb }
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

// People Feature Elements
const peopleSection = document.getElementById('people-section');
const peopleSlider = document.getElementById('people-slider');
const viewAllPeopleBtn = document.getElementById('view-all-people-btn');
const peopleScanContainer = document.getElementById('people-scan-container');
const peopleScanProgress = document.getElementById('people-scan-progress');
const peopleScanProgressBar = document.getElementById('people-scan-progress-bar');
const selectedPersonBar = document.getElementById('selected-person-bar');
const selectedPersonAvatar = document.getElementById('selected-person-avatar');
const selectedPersonName = document.getElementById('selected-person-name');
const clearPersonFilter = document.getElementById('clear-person-filter');

const peopleBrowserModal = document.getElementById('people-browser-modal');
const closePeopleBrowserBtn = document.getElementById('close-people-browser-btn');
const peopleBrowserGrid = document.getElementById('people-browser-grid');

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
const lightboxDownloadTrigger = document.getElementById('lightbox-download-trigger');
const lightboxContent = document.querySelector('.lightbox-content');
const lightboxClose = document.getElementById('lightbox-close');
const lightboxPrev = document.getElementById('lightbox-prev');
const lightboxNext = document.getElementById('lightbox-next');
const lightboxPlayDirect = document.getElementById('lightbox-play-direct');

// Paywall Modal Elements
const paywallModal = document.getElementById('paywall-modal');
const closePaywallBtn = document.getElementById('close-paywall-btn');
const paywallError = document.getElementById('paywall-error');
const downloadLimitBar = document.getElementById('download-limit-bar');
const limitBarText = document.getElementById('limit-bar-text');

// Admin Settings Modal Elements
const adminSettingsBtn = document.getElementById('admin-settings-btn');
const adminSettingsModal = document.getElementById('admin-settings-modal');
const closeSettingsBtn = document.getElementById('close-settings-btn');
const subscriberLogList = document.getElementById('subscriber-log-list');
const subLoading = document.getElementById('sub-loading');
const subEmpty = document.getElementById('sub-empty');
const subscriberTable = document.getElementById('subscriber-table');

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
    if (state.authenticated && state.isAdmin) {
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

  // Format Filter Clicks (All Media, Photos, Videos, Favorites, People)
  formatFilters.forEach(tab => {
    tab.addEventListener('click', (e) => {
      const filterValue = tab.getAttribute('data-filter');
      
      if (filterValue === 'people') {
        openPeopleBrowserModal();
        return;
      }

      formatFilters.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.filters.format = filterValue;
      
      // Clear active person filter when switching format tabs
      state.filters.person = null;
      selectedPersonBar.classList.add('hidden');
      
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
        const isFav = state.favorites.includes(file.id);
        lightboxFavBtn.classList.toggle('active', isFav);
        const lightboxHeartIcon = document.getElementById('lightbox-heart-icon');
        if (lightboxHeartIcon) {
          if (isFav) {
            lightboxHeartIcon.style.fill = '#ff5e7a';
            lightboxHeartIcon.style.color = '#ff5e7a';
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

  // Lightbox Download Button (gates via Paywall checks)
  lightboxDownloadTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const file = state.filteredMedia[state.currentMediaIndex];
    if (file) {
      verifyAndTriggerDownload(file.id, file.name, checkIsVideo(file));
    }
  });

  // Keyboard Navigation for Lightbox & Portal
  document.addEventListener('keydown', (e) => {
    if (!lightbox.classList.contains('active')) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') navigateLightbox(-1);
    if (e.key === 'ArrowRight') navigateLightbox(1);
  });

  // Paywall Modal Close
  closePaywallBtn.addEventListener('click', () => {
    paywallModal.classList.remove('active');
  });

  // Paywall Instamojo redirect trigger
  const payInstamojoBtn = document.getElementById('pay-instamojo-btn');
  if (payInstamojoBtn) {
    payInstamojoBtn.addEventListener('click', async () => {
      payInstamojoBtn.disabled = true;
      const btnSpan = payInstamojoBtn.querySelector('span');
      const originalText = btnSpan ? btnSpan.textContent : 'Pay ₹99 with Instamojo';
      if (btnSpan) btnSpan.textContent = 'Opening Secure Gateway...';
      paywallError.classList.remove('active');
      
      try {
        const response = await fetch('/api/payment/create', { method: 'POST' });
        const data = await response.json();
        
        if (response.ok && data.checkoutUrl) {
          showToast('Redirecting to secure payment checkout...', 'info');
          window.location.href = data.checkoutUrl;
        } else {
          paywallError.textContent = data.error || 'Failed to initialize Instamojo payment request.';
          paywallError.classList.add('active');
          payInstamojoBtn.disabled = false;
          if (btnSpan) btnSpan.textContent = originalText;
        }
      } catch(err) {
        paywallError.textContent = 'Network error contacting checkout services.';
        paywallError.classList.add('active');
        payInstamojoBtn.disabled = false;
        if (btnSpan) btnSpan.textContent = originalText;
      }
    });
  }

  // Watch highlights CTA button triggers first video in gallery or plays a mock trailer
  const watchHighlightsBtn = document.getElementById('watch-highlights-btn');
  if (watchHighlightsBtn) {
    watchHighlightsBtn.addEventListener('click', () => {
      const videos = state.allMedia.filter(item => checkIsVideo(item));
      if (videos.length > 0) {
        // Find index of first video in filtered list
        const filteredIndex = state.filteredMedia.findIndex(item => item.id === videos[0].id);
        if (filteredIndex !== -1) {
          openLightbox(filteredIndex);
        } else {
          showToast('Highlight video files are sync-loading. Try again shortly.', 'info');
        }
      } else {
        showToast('No videos uploaded from camp activities yet.', 'info');
      }
    });
  }

  // Bind Download Center package requests
  document.querySelectorAll('.dl-package-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const type = btn.getAttribute('data-type');
      if (type === 'all-photos') {
        verifyAndTriggerDownload('photos-zip-archive', 'All-Photos.zip', false);
      } else if (type === 'all-videos') {
        verifyAndTriggerDownload('videos-zip-archive', 'All-Videos.zip', true);
      } else if (type === 'day-wise') {
        const activeCategory = state.filters.category === 'all' ? 'General' : state.filters.category;
        verifyAndTriggerDownload(`album-${activeCategory}-archive`, `${activeCategory}-Album.zip`, false);
      }
    });
  });

  // Admin settings toggler
  adminSettingsBtn.addEventListener('click', () => {
    adminSettingsModal.classList.add('active');
    loadSubscribersApprovals();
  });
  closeSettingsBtn.addEventListener('click', () => {
    adminSettingsModal.classList.remove('active');
  });

  // People Feature Event Listeners
  viewAllPeopleBtn.addEventListener('click', openPeopleBrowserModal);
  closePeopleBrowserBtn.addEventListener('click', () => {
    peopleBrowserModal.classList.remove('active');
  });

  clearPersonFilter.addEventListener('click', () => {
    state.filters.person = null;
    selectedPersonBar.classList.add('hidden');
    
    // Reset format tab to All Media
    formatFilters.forEach(t => {
      if (t.getAttribute('data-filter') === 'all') {
        t.classList.add('active');
      } else {
        t.classList.remove('active');
      }
    });
    state.filters.format = 'all';
    
    applyFilters();
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
      if (adminSettingsBtn) adminSettingsBtn.classList.remove('hidden');
    } else {
      if (roleText) roleText.textContent = 'Parent User';
      if (descText) descText.textContent = 'Parent Access';
      if (avatarInitials) avatarInitials.textContent = 'PA';
      if (headerUploadBtn) headerUploadBtn.classList.add('hidden');
      if (adminSettingsBtn) adminSettingsBtn.classList.add('hidden');
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
    checkDownloadLimits();
    populateScrollerCollageWall();
    initPeopleFeature();
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
  const videosCount = state.allMedia.filter(item => checkIsVideo(item)).length;
  const photosCount = state.allMedia.length - videosCount;
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
  const { format, category, search, person } = state.filters;
  
  state.filteredMedia = state.allMedia.filter(item => {
    if (person && !person.photoIds.includes(item.id)) {
      return false;
    }
    
    const isVideo = checkIsVideo(item);
    if (format === 'photo' && isVideo) return false;
    if (format === 'video' && !isVideo) return false;
    if (format === 'favorite') {
      const isFav = state.favorites.includes(item.id);
      if (!isFav) return false;
    }
    
    if (category !== 'all' && item.category !== category) return false;
    
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

// Render dynamic card items in responsive Pinterest-style Masonry grid
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
    const isVideo = checkIsVideo(file);
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
          <button class="card-action-btn card-download-btn" title="Download to device" onclick="event.stopPropagation();">
            <i data-lucide="download"></i>
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
    
    const cardDownloadBtn = card.querySelector('.card-download-btn');
    cardDownloadBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      verifyAndTriggerDownload(file.id, file.name, isVideo);
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
  
  document.querySelectorAll(`.favorite-btn[data-id="${fileId}"]`).forEach(btn => {
    btn.classList.toggle('active', index === -1);
  });
  
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

// Verify download limits before triggering download file stream
async function verifyAndTriggerDownload(fileId, fileName, isVideo) {
  if (state.isAdmin) {
    triggerFileDownload(fileId);
    return;
  }
  
  // Load local downloads registry
  let localDownloads = JSON.parse(localStorage.getItem('stepup_downloads') || '{"photos":[], "videos":[]}');
  if (!localDownloads.photos) localDownloads.photos = [];
  if (!localDownloads.videos) localDownloads.videos = [];
  
  const isArchive = fileId === 'photos-zip-archive' || fileId === 'videos-zip-archive' || fileId.startsWith('album-');
  
  // Check stats from server first
  try {
    const response = await fetch('/api/auth/download-stats');
    const data = await response.json();
    
    if (data.isSubscribed) {
      if (isArchive) {
        showToast('Archive packaging request submitted! We will notify you when it is ready.', 'success');
        return;
      }
      triggerFileDownload(fileId);
      return;
    }
    
    // Gating check for archives: unsubscribed users cannot download archives
    if (isArchive) {
      openPaywallModal(isVideo ? 'video' : 'photo');
      return;
    }
    
    const isDownloadedAlready = isVideo 
      ? localDownloads.videos.includes(fileId) 
      : localDownloads.photos.includes(fileId);
      
    if (!isDownloadedAlready) {
      if (isVideo) {
        if (data.videosLeft <= 0 || localDownloads.videos.length >= 3) {
          openPaywallModal('video');
          return;
        }
      } else {
        if (data.photosLeft <= 0 || localDownloads.photos.length >= 3) {
          openPaywallModal('photo');
          return;
        }
      }
    }
    
    // We have limit space left or it was already downloaded, trigger download
    triggerFileDownload(fileId);
    
    // Register the file ID locally if it's new
    if (!isDownloadedAlready) {
      if (isVideo) {
        localDownloads.videos.push(fileId);
      } else {
        localDownloads.photos.push(fileId);
      }
      localStorage.setItem('stepup_downloads', JSON.stringify(localDownloads));
    }
    
    // Refresh limits bar after download triggers (delay to let stream register)
    setTimeout(checkDownloadLimits, 1500);
    
  } catch(err) {
    console.error('Error fetching download stats, falling back to local verification:', err);
    // Gating check for archives: unsubscribed users cannot download archives
    if (isArchive) {
      openPaywallModal(isVideo ? 'video' : 'photo');
      return;
    }
    
    const isDownloadedAlready = isVideo 
      ? localDownloads.videos.includes(fileId) 
      : localDownloads.photos.includes(fileId);
      
    if (!isDownloadedAlready) {
      if (isVideo) {
        if (localDownloads.videos.length >= 3) {
          openPaywallModal('video');
          return;
        }
      } else {
        if (localDownloads.photos.length >= 3) {
          openPaywallModal('photo');
          return;
        }
      }
    }
    
    triggerFileDownload(fileId);
    
    if (!isDownloadedAlready) {
      if (isVideo) {
        localDownloads.videos.push(fileId);
      } else {
        localDownloads.photos.push(fileId);
      }
      localStorage.setItem('stepup_downloads', JSON.stringify(localDownloads));
    }
  }
}

// Triggers actual file download stream
function triggerFileDownload(fileId) {
  // If download trigger is called inside lightbox, we execute click on the hidden downloader
  const downloadLink = document.getElementById('lightbox-download');
  if (downloadLink) {
    downloadLink.href = `/api/media/download/${fileId}`;
    downloadLink.click();
    showToast('Download started...', 'success');
  } else {
    window.location.href = `/api/media/download/${fileId}`;
  }
}

// Load and render paywall modal prefilled with dynamic QR code pointing to admin's bank UPI ID
async function openPaywallModal(limitType) {
  paywallModal.classList.add('active');
  const payInstamojoBtn = document.getElementById('pay-instamojo-btn');
  if (payInstamojoBtn) {
    payInstamojoBtn.disabled = false;
    const btnSpan = payInstamojoBtn.querySelector('span');
    if (btnSpan) btnSpan.textContent = 'Pay ₹99 with Instamojo';
  }
  paywallError.classList.remove('active');
}

// Fetch and display active download limit counts in dashboard indicator bar
async function checkDownloadLimits() {
  if (state.isAdmin) {
    downloadLimitBar.classList.add('hidden');
    return;
  }
  
  // Load local downloads registry
  let localDownloads = JSON.parse(localStorage.getItem('stepup_downloads') || '{"photos":[], "videos":[]}');
  if (!localDownloads.photos) localDownloads.photos = [];
  if (!localDownloads.videos) localDownloads.videos = [];
  
  try {
    const response = await fetch('/api/auth/download-stats');
    const data = await response.json();
    state.downloadStats = data;
    
    if (data.isSubscribed) {
      downloadLimitBar.classList.add('hidden');
      // Update dropdown label to show subscribed
      const descText = document.getElementById('dropdown-user-desc');
      if (descText) descText.textContent = 'Premium Access 👑';
    } else {
      downloadLimitBar.classList.remove('hidden');
      
      // Compute remaining limits conservatively
      const photosLeft = Math.max(0, Math.min(data.photosLeft, 3 - localDownloads.photos.length));
      const videosLeft = Math.max(0, Math.min(data.videosLeft, 3 - localDownloads.videos.length));
      
      limitBarText.textContent = `Free downloads remaining: ${photosLeft} photos, ${videosLeft} videos. Subscribe for ₹99 to unlock unlimited downloads!`;
    }
  } catch(err) {
    console.error('Error fetching download stats:', err);
    // Offline / error fallback using local storage only
    downloadLimitBar.classList.remove('hidden');
    const photosLeft = Math.max(0, 3 - localDownloads.photos.length);
    const videosLeft = Math.max(0, 3 - localDownloads.videos.length);
    limitBarText.textContent = `Free downloads remaining: ${photosLeft} photos, ${videosLeft} videos. Subscribe for ₹99 to unlock unlimited downloads!`;
  }
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

// Populate Auto-Scrolling Wall with random photos from Drive
function populateScrollerCollageWall() {
  const track1 = document.getElementById('wall-track-1');
  const track2 = document.getElementById('wall-track-2');
  
  if (!track1 || !track2) return;
  
  // Filter photos
  const photos = state.allMedia.filter(item => !checkIsVideo(item));
  if (photos.length < 4) return;
  
  // Generate random lists
  const list1 = [...photos].sort(() => 0.5 - Math.random()).slice(0, 10);
  const list2 = [...photos].sort(() => 0.5 - Math.random()).slice(0, 10);
  
  // Inject into tracks (duplicate elements to ensure smooth continuous scrolling loops)
  const injectTrack = (track, list) => {
    track.innerHTML = '';
    // Double array to make scroll loop seamless
    const doubleList = [...list, ...list];
    doubleList.forEach(file => {
      const img = document.createElement('img');
      img.src = `/api/media/preview/${file.id}`;
      img.className = 'wall-img';
      img.alt = 'Camp Memory';
      img.loading = 'lazy';
      // Clicking collage opens lightbox
      img.addEventListener('click', () => {
        const index = state.filteredMedia.findIndex(item => item.id === file.id);
        if (index !== -1) {
          openLightbox(index);
        }
      });
      track.appendChild(img);
    });
  };
  
  injectTrack(track1, list1);
  injectTrack(track2, list2);
}

// Load automated subscriber transaction log lists
async function loadSubscribersApprovals() {
  subLoading.classList.remove('hidden');
  subEmpty.classList.add('hidden');
  subscriberTable.classList.add('hidden');
  subscriberLogList.innerHTML = '';
  
  try {
    const response = await fetch('/api/admin/subscriptions');
    const data = await response.json();
    
    subLoading.classList.add('hidden');
    
    if (data.length === 0) {
      subEmpty.classList.remove('hidden');
      return;
    }
    
    subscriberTable.classList.remove('hidden');
    
    // Sort by createdTime desc
    data.sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime));
    
    data.forEach(sub => {
      const tr = document.createElement('tr');
      const isApproved = sub.status === 'approved';
      const statusColor = isApproved ? 'var(--accent-success)' : 'var(--accent-secondary)';
      const statusText = isApproved ? 'Approved ✓' : 'Pending';
      const dateText = sub.createdTime ? new Date(sub.createdTime).toLocaleDateString() : 'N/A';
      
      tr.innerHTML = `
        <td style="font-family:monospace; font-size:0.8rem; color:var(--text-bright);">${sub.id}</td>
        <td style="font-family:monospace; font-size:0.8rem; color:var(--text-main);">${sub.utr || '—'}</td>
        <td style="font-family:monospace; font-size:0.8rem; color:var(--text-muted);">${sub.parentSessionId ? sub.parentSessionId.substring(0, 8) + '...' : '—'}</td>
        <td style="font-weight:600; color:${statusColor};">${statusText}</td>
        <td style="font-size:0.85rem; color:var(--text-muted);">${dateText}</td>
      `;
      
      subscriberLogList.appendChild(tr);
    });
    
  } catch(err) {
    subLoading.classList.add('hidden');
    subEmpty.classList.remove('hidden');
    subEmpty.innerHTML = '<p style="color:var(--accent-danger);">Connection failure loading logs.</p>';
  }
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
  
  // Set download link href (hidden anchor triggers native saves)
  lightboxDownload.href = `/api/media/download/${file.id}`;

  const isVideo = checkIsVideo(file);
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
      lightboxHeartIcon.style.fill = '#ff5e7a';
      lightboxHeartIcon.style.color = '#ff5e7a';
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
  const isVideo = checkIsVideo(file);
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

// -------------------------------------------------------------
// 🧑‍🤝‍🧑 Google Photos-style "People" Feature Frontend Helpers
// -------------------------------------------------------------

// Active person selection tag to filter
let selectedPerson = null;

// Initialize face recognition scanning and UI
async function initPeopleFeature() {
  if (typeof PeopleEngine === 'undefined') {
    console.error('[People Feature] PeopleEngine not loaded.');
    return;
  }

  // Get current clusters first
  const initialPeople = await PeopleEngine.getPeople();
  renderPeopleRow(initialPeople);

  // Start background scanner
  PeopleEngine.startScanning(
    state.allMedia,
    // Scan progress callback
    (progress) => {
      if (progress.isScanning && progress.total > 0) {
        peopleScanContainer.classList.remove('hidden');
        const pct = Math.round((progress.scanned / progress.total) * 100);
        peopleScanProgress.textContent = `${pct}% (${progress.scanned}/${progress.total})`;
        peopleScanProgressBar.style.width = `${pct}%`;
      } else {
        peopleScanContainer.classList.add('hidden');
      }
    },
    // People updated callback
    (updatedPeople) => {
      renderPeopleRow(updatedPeople);
      if (peopleBrowserModal.classList.contains('active')) {
        renderPeopleBrowserGrid(updatedPeople);
      }
    }
  );
}

// Render horizontal strip of circular face avatars
function renderPeopleRow(people) {
  peopleSlider.innerHTML = '';

  if (!people || people.length === 0) {
    peopleSection.classList.add('hidden');
    return;
  }

  peopleSection.classList.remove('hidden');

  // Show top 15 people in the quick slider
  const displayedPeople = people.slice(0, 15);

  displayedPeople.forEach(person => {
    const card = document.createElement('div');
    card.className = 'person-circle-card';
    card.title = `Show all photos of ${person.name}`;

    let avatarHtml = '';
    if (person.faceThumb) {
      avatarHtml = `<img src="${person.faceThumb}" class="person-avatar" alt="${person.name}">`;
    } else {
      avatarHtml = `
        <div class="person-avatar-placeholder">
          <i data-lucide="user"></i>
        </div>
      `;
    }

    card.innerHTML = `
      <div class="person-avatar-wrapper">
        ${avatarHtml}
      </div>
      <span class="person-name">${person.name}</span>
    `;

    card.addEventListener('click', () => {
      selectPersonFilter(person);
    });

    peopleSlider.appendChild(card);
  });

  lucide.createIcons();
}

// Select a person and apply the filter tag
function selectPersonFilter(person) {
  state.filters.person = person;
  
  // Update Selected Person filter sub-bar
  selectedPersonName.textContent = `Showing photos of ${person.name}`;
  if (person.faceThumb) {
    selectedPersonAvatar.style.backgroundImage = `url(${person.faceThumb})`;
    selectedPersonAvatar.style.display = 'inline-block';
  } else {
    selectedPersonAvatar.style.display = 'none';
  }
  
  selectedPersonBar.classList.remove('hidden');

  // Deactivate all format filters to indicate custom filtering
  formatFilters.forEach(t => t.classList.remove('active'));

  // Close browser modal if open
  peopleBrowserModal.classList.remove('active');

  // Apply filters
  applyFilters();

  // Scroll to grid anchor
  document.getElementById('media-section-anchor').scrollIntoView({ behavior: 'smooth' });
}

// Open the large modal containing all detected people
async function openPeopleBrowserModal() {
  peopleBrowserModal.classList.add('active');
  const people = await PeopleEngine.getPeople();
  renderPeopleBrowserGrid(people);
}

// Render grid elements inside the People Browser Modal
function renderPeopleBrowserGrid(people) {
  peopleBrowserGrid.innerHTML = '';

  if (!people || people.length === 0) {
    peopleBrowserGrid.innerHTML = `
      <div class="empty-state-inner" style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 3rem 0;">
        <i data-lucide="scan-face" style="width: 48px; height: 48px; margin-bottom: 1rem;"></i>
        <p>No faces analyzed yet. Please wait for the background analyzer to finish scanning photos.</p>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  people.forEach(person => {
    const card = document.createElement('div');
    card.className = 'browser-person-card';
    card.setAttribute('draggable', 'true');
    card.setAttribute('data-id', person.id);

    let avatarHtml = '';
    if (person.faceThumb) {
      avatarHtml = `<img src="${person.faceThumb}" class="person-avatar" alt="${person.name}">`;
    } else {
      avatarHtml = `
        <div class="person-avatar-placeholder">
          <i data-lucide="user"></i>
        </div>
      `;
    }

    card.innerHTML = `
      <div class="photo-count-badge">${person.photoIds.length}</div>
      <div class="person-avatar-wrapper">
        ${avatarHtml}
      </div>
      <span class="person-name" style="margin-top:0.6rem; font-weight:600;" title="Double click to rename">${person.name}</span>
      <button class="merge-btn" title="Merge this group into another">Merge</button>
    `;

    // Click to filter by this person
    card.addEventListener('click', (e) => {
      // Don't trigger if clicking merge button or double-clicking name
      if (e.target.classList.contains('merge-btn') || e.target.tagName === 'INPUT') return;
      selectPersonFilter(person);
    });

    // Double click to rename
    const nameEl = card.querySelector('.person-name');
    nameEl.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      const currentName = person.name;
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'browser-person-name-input';
      input.value = currentName;
      
      card.replaceChild(input, nameEl);
      input.focus();
      input.select();

      const saveRename = async () => {
        const val = input.value.trim();
        if (val && val !== currentName) {
          await PeopleEngine.renamePerson(person.id, val);
          showToast(`Renamed person to "${val}"`, 'success');
        } else {
          card.replaceChild(nameEl, input);
        }
      };

      input.addEventListener('blur', saveRename);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          saveRename();
        } else if (e.key === 'Escape') {
          card.replaceChild(nameEl, input);
        }
      });
    });

    // Merge Button click
    card.querySelector('.merge-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      const otherPeople = people.filter(p => p.id !== person.id);
      if (otherPeople.length === 0) {
        showToast('No other people clusters to merge with.', 'info');
        return;
      }

      const optionsText = otherPeople.map((p, idx) => `${idx + 1}. ${p.name} (${p.photoIds.length} photos)`).join('\n');
      const selection = prompt(
        `Merge all photos of "${person.name}" into another group:\n\n${optionsText}\n\nEnter the number of the target person to merge into:`
      );

      if (selection === null) return;
      const num = parseInt(selection);
      if (isNaN(num) || num < 1 || num > otherPeople.length) {
        showToast('Invalid selection.', 'error');
        return;
      }

      const targetPerson = otherPeople[num - 1];
      const confirmMsg = `Merge "${person.name}" into "${targetPerson.name}"?\nThis action cannot be undone.`;
      if (confirm(confirmMsg)) {
        await PeopleEngine.mergePeople(targetPerson.id, person.id);
        showToast(`Merged groups successfully!`, 'success');
      }
    });

    // Drag and Drop implementation
    card.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', person.id);
      card.classList.add('dragging');
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
    });

    card.addEventListener('dragover', (e) => {
      e.preventDefault();
      const draggingId = document.querySelector('.browser-person-card.dragging')?.getAttribute('data-id');
      if (draggingId && draggingId !== person.id) {
        card.classList.add('drag-over');
      }
    });

    card.addEventListener('dragleave', () => {
      card.classList.remove('drag-over');
    });

    card.addEventListener('drop', async (e) => {
      e.preventDefault();
      card.classList.remove('drag-over');
      const sourceId = e.dataTransfer.getData('text/plain');
      
      if (sourceId && sourceId !== person.id) {
        const sourcePerson = people.find(p => p.id === sourceId);
        if (sourcePerson && confirm(`Merge all photos of "${sourcePerson.name}" into "${person.name}"?`)) {
          await PeopleEngine.mergePeople(person.id, sourceId);
          showToast(`Merged groups successfully!`, 'success');
        }
      }
    });

    peopleBrowserGrid.appendChild(card);
  });

  lucide.createIcons();
}
