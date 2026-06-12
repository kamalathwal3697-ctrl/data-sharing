const express = require('express');
const cookieParser = require('cookie-parser');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { drive, auth } = require('@googleapis/drive');
const multer = require('multer');

// Configure multer for temp uploads
const upload = multer({ dest: path.join(__dirname, 'uploads/') });

// Load environment variables
dotenv.config();

const CONFIG_FILE = path.join(__dirname, 'config.json');

function readConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    const defaultData = {
      upiId: '6284048021@upi',
      upiName: 'StepUp Dance Studio',
      subscriptions: [],
      approvedCookies: [],
      downloads: {}
    };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(defaultData, null, 2));
    return defaultData;
  }
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
    return JSON.parse(raw);
  } catch(e) {
    console.error('Failed to read config.json:', e);
    return { upiId: '6284048021@upi', upiName: 'StepUp Dance Studio', subscriptions: [], approvedCookies: [], downloads: {} };
  }
}

function writeConfig(data) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2));
  } catch(e) {
    console.error('Failed to write config.json:', e);
  }
}

const app = express();
const PORT = process.env.PORT || 3000;
const PASSWORD = process.env.SHARED_PASSWORD || 'camp2026';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin2026';

// Middleware
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Google Drive Client
let driveClient = null;

function getDriveClient() {
  if (driveClient) return driveClient;

  const serviceAccountPath = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const apiKey = process.env.GOOGLE_API_KEY;

  if (serviceAccountPath && fs.existsSync(serviceAccountPath)) {
    console.log(`[Google Drive] Initializing client using Service Account JSON: ${serviceAccountPath}`);
    const authClient = new auth.GoogleAuth({
      keyFile: serviceAccountPath,
      scopes: ['https://www.googleapis.com/auth/drive'],
    });
    driveClient = drive({
      version: 'v3',
      auth: authClient,
    });
  } else if (apiKey) {
    console.log('[Google Drive] Initializing client using API Key.');
    driveClient = drive({
      version: 'v3',
      auth: apiKey,
    });
  } else {
    console.warn('[Google Drive] WARNING: Neither GOOGLE_SERVICE_ACCOUNT_JSON nor GOOGLE_API_KEY is configured. Drive operations will fail.');
  }

  return driveClient;
}

// Authentication Middleware
function requireAuth(req, res, next) {
  if (req.cookies.camp_auth === 'true') {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized. Passcode required.' });
  }
}

function requireAdmin(req, res, next) {
  if (req.cookies.camp_auth === 'true' && req.cookies.admin_auth === 'true') {
    next();
  } else {
    res.status(403).json({ error: 'Forbidden. Admin access required.' });
  }
}

// Memory Cache for Media List
let mediaCache = null;
let cacheTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes in ms

// Auth Endpoints
app.post('/api/auth/login', (req, res) => {
  const { passcode } = req.body;
  const cookieOptions = {
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  };

  if (passcode === ADMIN_PASSWORD) {
    res.cookie('camp_auth', 'true', cookieOptions);
    res.cookie('admin_auth', 'true', cookieOptions);
    res.json({ success: true, isAdmin: true });
  } else if (passcode === PASSWORD) {
    res.cookie('camp_auth', 'true', cookieOptions);
    res.json({ success: true, isAdmin: false });
  } else {
    res.status(401).json({ error: 'Incorrect passcode. Please try again.' });
  }
});

app.get('/api/auth/check', (req, res) => {
  if (req.cookies.camp_auth === 'true') {
    res.json({ 
      authenticated: true, 
      isAdmin: req.cookies.admin_auth === 'true' 
    });
  } else {
    res.json({ authenticated: false });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('camp_auth');
  res.clearCookie('admin_auth');
  res.json({ success: true });
});

// Fetch Media List
async function fetchMediaList() {
  const driveInstance = getDriveClient();
  if (!driveInstance) {
    throw new Error('Google Drive API client is not configured.');
  }

  const rootFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!rootFolderId || rootFolderId === 'replace_with_actual_folder_id') {
    throw new Error('GOOGLE_DRIVE_FOLDER_ID is not configured in your .env file.');
  }

  console.log(`[Google Drive] Querying files in root folder: ${rootFolderId}`);

  // Fetch direct children of root folder
  const rootResponse = await driveInstance.files.list({
    q: `'${rootFolderId}' in parents and trashed = false`,
    fields: 'files(id, name, mimeType, createdTime, size, thumbnailLink, webContentLink, videoMediaMetadata)',
    pageSize: 1000,
  });

  const rootItems = rootResponse.data.files || [];
  const filesList = [];
  const subfolders = [];

  for (const item of rootItems) {
    if (item.mimeType === 'application/vnd.google-apps.folder') {
      subfolders.push(item);
    } else {
      filesList.push({
        id: item.id,
        name: item.name,
        mimeType: item.mimeType,
        createdTime: item.createdTime,
        size: parseInt(item.size || '0', 10),
        category: 'General',
        thumbnailLink: item.thumbnailLink,
        webContentLink: item.webContentLink,
        videoMetadata: item.videoMediaMetadata,
      });
    }
  }

  // Fetch children of 1st level subfolders (e.g. "Day 1", "Day 2")
  for (const folder of subfolders) {
    console.log(`[Google Drive] Querying files in subfolder: ${folder.name} (${folder.id})`);
    try {
      const subResponse = await driveInstance.files.list({
        q: `'${folder.id}' in parents and trashed = false`,
        fields: 'files(id, name, mimeType, createdTime, size, thumbnailLink, webContentLink, videoMediaMetadata)',
        pageSize: 1000,
      });

      const subItems = subResponse.data.files || [];
      for (const item of subItems) {
        if (item.mimeType !== 'application/vnd.google-apps.folder') {
          filesList.push({
            id: item.id,
            name: item.name,
            mimeType: item.mimeType,
            createdTime: item.createdTime,
            size: parseInt(item.size || '0', 10),
            category: folder.name,
            thumbnailLink: item.thumbnailLink,
            webContentLink: item.webContentLink,
            videoMetadata: item.videoMediaMetadata,
          });
        }
      }
    } catch (err) {
      console.error(`[Google Drive] Error fetching subfolder ${folder.name}:`, err.message);
    }
  }

  // Sort files: newest first
  filesList.sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime));
  return filesList;
}

// Media Endpoints
app.get('/api/media', requireAuth, async (req, res) => {
  try {
    const now = Date.now();
    if (mediaCache && (now - cacheTime < CACHE_DURATION)) {
      console.log('[Cache] Serving media list from memory cache.');
      return res.json(mediaCache);
    }

    const files = await fetchMediaList();
    mediaCache = files;
    cacheTime = now;
    res.json(files);
  } catch (err) {
    console.error('[API Error] Fetch media failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Proxy High-Resolution Thumbnail (HEIC friendly)
app.get('/api/media/preview/:id', requireAuth, async (req, res) => {
  const fileId = req.params.id;
  const driveInstance = getDriveClient();
  if (!driveInstance) {
    return res.status(500).json({ error: 'Google Drive client not initialized' });
  }

  try {
    let fileMeta = null;
    if (mediaCache) {
      fileMeta = mediaCache.find(f => f.id === fileId);
    }

    if (!fileMeta) {
      const metaRes = await driveInstance.files.get({
        fileId: fileId,
        fields: 'thumbnailLink, mimeType',
      });
      fileMeta = metaRes.data;
    }

    if (!fileMeta || !fileMeta.thumbnailLink) {
      return res.status(404).json({ error: 'Preview not available for this file' });
    }

    // Replace the default small width =s220 with high-res =s1600
    const highResUrl = fileMeta.thumbnailLink.replace(/=s\d+$/, '=s1600');

    // Prepare authorization headers if service account credentials exist
    const authHeaders = {};
    const authClient = driveInstance.context._options.auth;
    if (authClient && typeof authClient.getRequestHeaders === 'function') {
      const headers = await authClient.getRequestHeaders();
      Object.assign(authHeaders, headers);
    }

    // Stream from Google's content server using Node's core https module
    https.get(highResUrl, { headers: authHeaders }, (googleRes) => {
      if (googleRes.statusCode !== 200) {
        console.error(`[Proxy Error] Google server returned status: ${googleRes.statusCode}`);
        return res.status(googleRes.statusCode).json({ error: 'Failed to retrieve preview from Google' });
      }

      res.setHeader('Content-Type', googleRes.headers['content-type'] || 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache in browser for 24h
      googleRes.pipe(res);
    }).on('error', (err) => {
      console.error(`[Proxy Error] Connection failure:`, err.message);
      res.status(500).json({ error: 'Failed to proxy preview' });
    });

  } catch (err) {
    console.error(`[Proxy Error] Error handler:`, err.message);
    res.status(500).json({ error: 'Internal server error while loading preview' });
  }
});

// Proxy File Download
app.get('/api/media/download/:id', requireAuth, async (req, res) => {
  const fileId = req.params.id;
  const driveInstance = getDriveClient();
  if (!driveInstance) {
    return res.status(500).json({ error: 'Google Drive client not initialized' });
  }

  // Check if Admin
  const isAdmin = req.cookies.admin_auth === 'true';
  let parentSessionId = req.cookies.parent_session_id;

  if (!parentSessionId && !isAdmin) {
    parentSessionId = Math.random().toString(36).substring(2, 15);
    res.cookie('parent_session_id', parentSessionId, { maxAge: 30 * 24 * 60 * 60 * 1000, httpOnly: true });
  }

  try {
    let fileMeta = null;
    if (mediaCache) {
      fileMeta = mediaCache.find(f => f.id === fileId);
    }

    if (!fileMeta) {
      const metaRes = await driveInstance.files.get({
        fileId: fileId,
        fields: 'name, mimeType, size',
      });
      fileMeta = metaRes.data;
    }

    // Gating check for parents
    if (!isAdmin) {
      const config = readConfig();
      const isSubscribed = config.approvedCookies && config.approvedCookies.includes(parentSessionId);

      if (!isSubscribed) {
        const isVideo = (fileMeta.mimeType && fileMeta.mimeType.startsWith('video/')) || 
                        (fileMeta.name && /\.(mp4|mov|m4v|avi|webm|qt|3gp|mkv|hevc)$/i.test(fileMeta.name));
        
        if (!config.downloads) config.downloads = {};
        if (!config.downloads[parentSessionId]) {
          config.downloads[parentSessionId] = { photos: 0, videos: 0 };
        }

        const stats = config.downloads[parentSessionId];

        if (isVideo) {
          if (stats.videos >= 3) {
            return res.status(402).json({ error: 'Limit exceeded', limitType: 'video' });
          }
          stats.videos++;
        } else {
          if (stats.photos >= 3) {
            return res.status(402).json({ error: 'Limit exceeded', limitType: 'photo' });
          }
          stats.photos++;
        }

        writeConfig(config);
      }
    }

    // Get file media stream from Google Drive API
    const driveRes = await driveInstance.files.get(
      { fileId: fileId, alt: 'media' },
      { responseType: 'stream' }
    );

    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileMeta.name)}"`);
    res.setHeader('Content-Type', fileMeta.mimeType);
    if (fileMeta.size) {
      res.setHeader('Content-Length', fileMeta.size);
    }

    driveRes.data.pipe(res);
  } catch (err) {
    console.error(`[Download Error] Failed to stream file ${fileId}:`, err.message);
    res.status(500).json({ error: 'Failed to download file' });
  }
});

// Clear Cache endpoint (useful if owner uploads new photos and wants instant update)
app.post('/api/media/clear-cache', requireAuth, (req, res) => {
  mediaCache = null;
  cacheTime = 0;
  res.json({ success: true, message: 'Media list cache cleared.' });
});

// Rename File Endpoint (Admin Only)
app.patch('/api/media/:id', requireAdmin, async (req, res) => {
  const fileId = req.params.id;
  const { name } = req.body;
  const driveInstance = getDriveClient();
  if (!driveInstance) {
    return res.status(500).json({ error: 'Google Drive client not initialized' });
  }

  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'Name is required' });
  }

  try {
    console.log(`[Admin] Renaming file ${fileId} to: ${name}`);
    await driveInstance.files.update({
      fileId: fileId,
      resource: { name: name }
    });
    
    // Clear cache to fetch fresh names
    mediaCache = null;
    cacheTime = 0;
    
    res.json({ success: true, message: 'File renamed successfully' });
  } catch (err) {
    console.error(`[Admin Error] Rename file ${fileId} failed:`, err.message);
    res.status(500).json({ error: `Failed to rename: ${err.message}. Ensure you are using a Service Account with editor permissions.` });
  }
});

// Delete/Trash File Endpoint (Admin Only)
app.delete('/api/media/:id', requireAdmin, async (req, res) => {
  const fileId = req.params.id;
  const driveInstance = getDriveClient();
  if (!driveInstance) {
    return res.status(500).json({ error: 'Google Drive client not initialized' });
  }

  try {
    console.log(`[Admin] Deleting (unlinking) file ${fileId}`);
    
    // Fetch file parents first
    const fileMeta = await driveInstance.files.get({
      fileId: fileId,
      fields: 'parents'
    });

    const parents = fileMeta.data.parents;
    if (parents && parents.length > 0) {
      // Remove the file from its parent folders.
      // This unlinks it from the shared folder, which is allowed for Editors.
      await driveInstance.files.update({
        fileId: fileId,
        removeParents: parents.join(','),
        fields: 'id, parents'
      });
      console.log(`[Admin] Unlinked file ${fileId} from parents: ${parents.join(',')}`);
    } else {
      // If no parents, try setting trashed (fallback)
      await driveInstance.files.update({
        fileId: fileId,
        resource: { trashed: true }
      });
      console.log(`[Admin] Trashed file ${fileId} (no parents found)`);
    }

    // Clear cache
    mediaCache = null;
    cacheTime = 0;

    res.json({ success: true, message: 'File deleted successfully' });
  } catch (err) {
    console.error(`[Admin Error] Delete file ${fileId} failed:`, err.message);
    res.status(500).json({ error: `Failed to delete: ${err.message}. Ensure you are using a Service Account with editor permissions.` });
  }
});

// Admin File Upload Endpoint
app.post('/api/media/upload', requireAdmin, upload.single('file'), async (req, res) => {
  const file = req.file;
  let { category } = req.body; // e.g. "Day 1", "Day 2", etc. (defaults to General/root)
  
  if (!file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const driveInstance = getDriveClient();
  if (!driveInstance) {
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    return res.status(500).json({ error: 'Google Drive client not initialized' });
  }

  try {
    const rootFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
    let targetFolderId = rootFolderId;

    // Resolve or create category folder inside root if it's not "General"
    if (category && category !== 'General' && category.trim() !== '') {
      category = category.trim();
      
      const listRes = await driveInstance.files.list({
        q: `'${rootFolderId}' in parents and name = '${category}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: 'files(id, name)'
      });

      const folders = listRes.data.files || [];
      if (folders.length > 0) {
        targetFolderId = folders[0].id;
      } else {
        console.log(`[Upload] Creating new category folder: ${category}`);
        const createFolderRes = await driveInstance.files.create({
          resource: {
            name: category,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [rootFolderId]
          },
          fields: 'id'
        });
        targetFolderId = createFolderRes.data.id;
      }
    }

    console.log(`[Upload] Uploading file "${file.originalname}" to Google Drive folder: ${targetFolderId}`);

    const media = {
      mimeType: file.mimetype,
      body: fs.createReadStream(file.path),
    };

    const driveFileRes = await driveInstance.files.create({
      resource: {
        name: file.originalname,
        parents: [targetFolderId]
      },
      media: media,
      fields: 'id, name, mimeType'
    });

    console.log(`[Upload] Uploaded successfully: ${driveFileRes.data.name} (${driveFileRes.data.id})`);

    if (fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }

    // Flush cache
    mediaCache = null;
    cacheTime = 0;

    res.json({
      success: true,
      fileId: driveFileRes.data.id,
      name: driveFileRes.data.name,
      message: 'File uploaded successfully'
    });

  } catch (err) {
    console.error('[Upload Error] Failed to upload file to Google Drive:', err.message);
    if (fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }
    res.status(500).json({ error: `Upload failed: ${err.message}` });
  }
});

// Get Parent Download stats
app.get('/api/auth/download-stats', requireAuth, (req, res) => {
  const isAdmin = req.cookies.admin_auth === 'true';
  if (isAdmin) {
    return res.json({ isAdmin: true, photosLeft: 9999, videosLeft: 9999, isSubscribed: true });
  }
  
  let parentSessionId = req.cookies.parent_session_id;
  if (!parentSessionId) {
    parentSessionId = Math.random().toString(36).substring(2, 15);
    res.cookie('parent_session_id', parentSessionId, { maxAge: 30 * 24 * 60 * 60 * 1000, httpOnly: true });
  }

  const config = readConfig();
  const isSubscribed = config.approvedCookies && config.approvedCookies.includes(parentSessionId);
  
  if (isSubscribed) {
    return res.json({ isSubscribed: true, photosLeft: 9999, videosLeft: 9999 });
  }

  if (!config.downloads) config.downloads = {};
  if (!config.downloads[parentSessionId]) {
    config.downloads[parentSessionId] = { photos: 0, videos: 0 };
  }

  const stats = config.downloads[parentSessionId];
  res.json({
    isSubscribed: false,
    photosDownloaded: stats.photos,
    videosDownloaded: stats.videos,
    photosLeft: Math.max(0, 3 - stats.photos),
    videosLeft: Math.max(0, 3 - stats.videos)
  });
});

// Get UPI configuration for paywall
app.get('/api/subscription/config', requireAuth, (req, res) => {
  const config = readConfig();
  res.json({
    upiId: config.upiId || '6284048021@upi',
    upiName: config.upiName || 'StepUp Dance Studio'
  });
});

// Update UPI Configuration (Admin Only)
app.post('/api/admin/config', requireAdmin, (req, res) => {
  const { upiId, upiName } = req.body;
  if (!upiId || !upiName) {
    return res.status(400).json({ error: 'UPI ID and Beneficiary Name are required' });
  }
  
  const config = readConfig();
  config.upiId = upiId.trim();
  config.upiName = upiName.trim();
  writeConfig(config);
  
  res.json({ success: true, message: 'UPI configurations updated successfully' });
});

// Submit Payment UTR / Transaction Reference ID
app.post('/api/subscription/submit', requireAuth, (req, res) => {
  const { utr } = req.body;
  if (!utr || utr.trim().length < 8) {
    return res.status(400).json({ error: 'Please enter a valid Transaction Reference ID / UTR' });
  }

  let parentSessionId = req.cookies.parent_session_id;
  if (!parentSessionId) {
    parentSessionId = Math.random().toString(36).substring(2, 15);
    res.cookie('parent_session_id', parentSessionId, { maxAge: 30 * 24 * 60 * 60 * 1000, httpOnly: true });
  }

  const config = readConfig();
  
  if (!config.subscriptions) config.subscriptions = [];
  const exists = config.subscriptions.find(sub => sub.utr === utr.trim());
  if (exists) {
    return res.status(400).json({ error: 'This UTR Reference ID is already submitted and is pending verification.' });
  }

  config.subscriptions.push({
    id: Math.random().toString(36).substring(2, 10).toUpperCase(),
    utr: utr.trim(),
    parentSessionId: parentSessionId,
    status: 'pending',
    createdTime: new Date().toISOString()
  });

  writeConfig(config);
  res.json({ success: true, message: 'Payment reference submitted successfully for verification!' });
});

// Fetch All Subscriptions (Admin Only)
app.get('/api/admin/subscriptions', requireAdmin, (req, res) => {
  const config = readConfig();
  res.json(config.subscriptions || []);
});

// Approve / Reject Subscription (Admin Only)
app.post('/api/admin/subscriptions/verify', requireAdmin, (req, res) => {
  const { subId, action } = req.body; // action: 'approve' | 'delete'
  if (!subId || !action) {
    return res.status(400).json({ error: 'Subscription ID and action are required' });
  }

  const config = readConfig();
  if (!config.subscriptions) config.subscriptions = [];

  const subIndex = config.subscriptions.findIndex(sub => sub.id === subId);
  if (subIndex === -1) {
    return res.status(404).json({ error: 'Subscription not found' });
  }

  const sub = config.subscriptions[subIndex];

  if (action === 'approve') {
    sub.status = 'approved';
    if (!config.approvedCookies) config.approvedCookies = [];
    if (!config.approvedCookies.includes(sub.parentSessionId)) {
      config.approvedCookies.push(sub.parentSessionId);
    }
  } else {
    // Delete/reject subscription
    config.subscriptions.splice(subIndex, 1);
  }

  writeConfig(config);
  res.json({ success: true, message: `Subscription reference ${action}d successfully` });
});

// Catch-all route to serve Frontend index.html for client side routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
app.listen(PORT, () => {
  console.log(`========================================================`);
  console.log(` Summer Camp Media sharing portal running on port ${PORT}`);
  console.log(` Access link: http://localhost:${PORT}`);
  console.log(`========================================================`);
});
