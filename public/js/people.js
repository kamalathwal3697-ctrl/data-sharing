// -------------------------------------------------------------
// Face Recognition and Clustering Module (Google Photos Style)
// Powered by @vladmandic/human (client-side TensorFlow.js)
// -------------------------------------------------------------

(function (global) {
  'use strict';

  // Config constants
  const DB_NAME = 'stepup_people_db';
  const DB_VERSION = 1;
  const MATCH_THRESHOLD = 0.58; // Euclidean distance threshold (lower = stricter match)
  const MAX_CONCURRENT_SCANS = 1; // Process one image at a time to prevent UI lag
  const MODEL_BASE_PATH = 'https://cdn.jsdelivr.net/gh/vladmandic/human-models/models/';

  // State variables
  let humanInstance = null;
  let isHumanInitializing = false;
  let isHumanReady = false;
  let idb = null;
  let scanQueue = [];
  let currentScanIndex = 0;
  let totalScanCount = 0;
  let isScanning = false;
  let scanProgressCallback = null;
  let peopleUpdateCallback = null;

  // Initialize IndexedDB
  function initDB() {
    return new Promise((resolve, reject) => {
      if (idb) return resolve(idb);

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = function (event) {
        const db = event.target.result;
        
        // Store scanned file IDs to avoid repeating scans
        if (!db.objectStoreNames.contains('scanned')) {
          db.createObjectStore('scanned', { keyPath: 'fileId' });
        }
        
        // Store people clusters
        if (!db.objectStoreNames.contains('people')) {
          db.createObjectStore('people', { keyPath: 'id' });
        }
      };

      request.onsuccess = function (event) {
        idb = event.target.result;
        resolve(idb);
      };

      request.onerror = function (event) {
        console.error('IndexedDB error:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  // DB Helpers
  function dbGet(storeName, key) {
    return initDB().then(db => {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    });
  }

  function dbGetAll(storeName) {
    return initDB().then(db => {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });
    });
  }

  function dbPut(storeName, value) {
    return initDB().then(db => {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.put(value);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    });
  }

  function dbDelete(storeName, key) {
    return initDB().then(db => {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.delete(key);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    });
  }

  // Initialize Human library for face recognition
  async function initHuman() {
    if (isHumanReady) return humanInstance;
    if (isHumanInitializing) {
      // Wait for it
      while (!isHumanReady) {
        await new Promise(r => setTimeout(r, 100));
      }
      return humanInstance;
    }

    isHumanInitializing = true;
    console.log('[People Engine] Initializing @vladmandic/human face engine...');

    try {
      if (typeof global.Human === 'undefined') {
        throw new Error('vladmandic/human library not loaded via script tag.');
      }

      // Configure Human instance for optimal performance and face description
      const config = {
        modelBasePath: MODEL_BASE_PATH,
        backend: 'webgl', // webgl is fast on modern browsers
        async: true,
        face: {
          enabled: true,
          detector: { enabled: true, return: true, rotation: true, maxDetected: 10, minConfidence: 0.45 },
          mesh: { enabled: false }, // mesh is not needed for grouping
          iris: { enabled: false },
          description: { enabled: true }, // Extract 128-D face embedding descriptor
          emotion: { enabled: false },
          antispoof: { enabled: false },
          liveness: { enabled: false }
        },
        body: { enabled: false },
        hand: { enabled: false },
        object: { enabled: false },
        gesture: { enabled: false },
        segmentation: { enabled: false }
      };

      // Instantiate Human
      // @ts-ignore
      humanInstance = new global.Human.Human(config);

      // Warm up/Load models
      console.log('[People Engine] Loading face detection/description models...');
      await humanInstance.load();
      await humanInstance.warmup();

      isHumanReady = true;
      isHumanInitializing = false;
      console.log('[People Engine] Face recognition ready.');
      return humanInstance;
    } catch (err) {
      isHumanInitializing = false;
      console.error('[People Engine] Failed to initialize Human:', err);
      throw err;
    }
  }

  // Helper to calculate Euclidean Distance between two 128-D embedding vectors
  function calculateEuclideanDistance(vec1, vec2) {
    if (!vec1 || !vec2 || vec1.length !== vec2.length) return 99.0;
    let sum = 0;
    for (let i = 0; i < vec1.length; i++) {
      const diff = vec1[i] - vec2[i];
      sum += diff * diff;
    }
    return Math.sqrt(sum);
  }

  // Helper to crop face area and return as a Base64 JPEG data URL
  function cropFaceThumbnail(imgElement, box) {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      // Add a slight padding around the face box for nicer circular presentation
      const padW = box.width * 0.15;
      const padH = box.height * 0.15;
      
      const sx = Math.max(0, box.x - padW);
      const sy = Math.max(0, box.y - padH);
      const sw = Math.min(imgElement.naturalWidth - sx, box.width + padW * 2);
      const sh = Math.min(imgElement.naturalHeight - sy, box.height + padH * 2);

      // Thumbnail width/height target
      canvas.width = 160;
      canvas.height = 160;

      ctx.drawImage(imgElement, sx, sy, sw, sh, 0, 0, 160, 160);
      return canvas.toDataURL('image/jpeg', 0.85);
    } catch (e) {
      console.error('[People Engine] Failed to crop face thumbnail:', e);
      return null;
    }
  }

  // Process a single image element for faces
  async function processImageFaces(fileId, imgElement) {
    const human = await initHuman();
    
    // Detect faces
    const result = await human.detect(imgElement);
    if (!result || !result.face || result.face.length === 0) {
      console.log(`[People Engine] No faces found in file: ${fileId}`);
      return [];
    }

    console.log(`[People Engine] Found ${result.face.length} face(s) in file: ${fileId}`);
    
    const people = await dbGetAll('people');
    const detectedFaces = [];

    for (let face of result.face) {
      const embedding = Array.from(face.embedding || []);
      if (embedding.length === 0) continue;

      const faceBox = {
        x: Math.round(face.box[0]),
        y: Math.round(face.box[1]),
        width: Math.round(face.box[2]),
        height: Math.round(face.box[3])
      };

      const faceThumb = cropFaceThumbnail(imgElement, faceBox);

      // Compare embedding with all existing people in DB
      let bestMatch = null;
      let minDistance = MATCH_THRESHOLD; // Must be closer than threshold

      for (let person of people) {
        // Compare against all embeddings saved for this person
        for (let savedEmb of person.embeddings) {
          const dist = calculateEuclideanDistance(embedding, savedEmb);
          if (dist < minDistance) {
            minDistance = dist;
            bestMatch = person;
          }
        }
      }

      if (bestMatch) {
        // Add to existing group
        console.log(`[People Engine] Matched face in ${fileId} to existing person: ${bestMatch.name || bestMatch.id}`);
        
        // Add photo reference if not already present
        if (!bestMatch.photoIds.includes(fileId)) {
          bestMatch.photoIds.push(fileId);
        }
        
        // Keep up to 5 representative embeddings for matching robustness
        if (bestMatch.embeddings.length < 5) {
          bestMatch.embeddings.push(embedding);
        }

        await dbPut('people', bestMatch);
        detectedFaces.push({ personId: bestMatch.id, name: bestMatch.name });
      } else {
        // Create new person group
        const newPersonId = 'person_' + Math.random().toString(36).substr(2, 9);
        const newPerson = {
          id: newPersonId,
          name: 'Person ' + (people.length + detectedFaces.length + 1),
          isUnnamed: true, // Tag to indicate it hasn't been custom named yet
          embeddings: [embedding],
          faceThumb: faceThumb, // Use first detected face crop as avatar
          photoIds: [fileId]
        };

        console.log(`[People Engine] Created new person cluster: ${newPerson.name}`);
        await dbPut('people', newPerson);
        detectedFaces.push({ personId: newPersonId, name: newPerson.name });
        
        // Push to local people array to avoid duplicate new persons within the same image run
        people.push(newPerson);
      }
    }

    return detectedFaces;
  }

  // Load preview image, process it, and mark as scanned
  async function scanPhoto(fileId) {
    return new Promise(async (resolve, reject) => {
      // Skip if already scanned
      const alreadyScanned = await dbGet('scanned', fileId);
      if (alreadyScanned) {
        return resolve({ fileId, skipped: true });
      }

      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      // Use our high-res proxy preview endpoint
      img.src = `/api/media/preview/${fileId}`;
      
      img.onload = async () => {
        try {
          const faces = await processImageFaces(fileId, img);
          
          // Mark as scanned
          await dbPut('scanned', { fileId, scannedAt: new Date().toISOString() });
          
          resolve({ fileId, scanned: true, facesCount: faces.length });
        } catch (err) {
          console.error(`[People Engine] Error processing image ${fileId}:`, err);
          reject(err);
        }
      };

      img.onerror = (e) => {
        console.error(`[People Engine] Failed to load image preview for scanning: ${fileId}`, e);
        reject(new Error('Image failed to load'));
      };
    });
  }

  // Background scanning orchestrator
  async function runScanLoop() {
    if (isScanning || scanQueue.length === 0) return;
    isScanning = true;
    console.log(`[People Engine] Background scan started. Total files to check: ${scanQueue.length}`);

    while (currentScanIndex < scanQueue.length && isScanning) {
      const fileId = scanQueue[currentScanIndex];
      
      // Update progress callback
      if (scanProgressCallback) {
        scanProgressCallback({
          scanned: currentScanIndex,
          total: totalScanCount,
          isScanning: true
        });
      }

      try {
        await scanPhoto(fileId);
        
        // Notify of update if people clusters changed
        if (peopleUpdateCallback) {
          const currentPeople = await dbGetAll('people');
          peopleUpdateCallback(currentPeople);
        }
      } catch (err) {
        console.warn(`[People Engine] Skipping problematic file ${fileId} during scan.`);
      }

      currentScanIndex++;
      
      // Let the main thread breathe for 200ms between scans to keep browser responsive
      await new Promise(r => setTimeout(r, 200));
    }

    isScanning = false;
    console.log('[People Engine] Scan loop ended.');
    
    if (scanProgressCallback) {
      scanProgressCallback({
        scanned: currentScanIndex,
        total: totalScanCount,
        isScanning: false
      });
    }
  }

  // Public Interface
  const PeopleEngine = {
    // Start progressive background scanning of media list
    startScanning: async function (mediaList, onProgress, onUpdate) {
      scanProgressCallback = onProgress;
      peopleUpdateCallback = onUpdate;

      // Filter only image formats (skip videos since face-api on large videos is heavy)
      const photos = mediaList.filter(file => {
        const mime = file.mimeType || '';
        const name = file.name || '';
        const isVideo = mime.startsWith('video/') || /\.(mp4|mov|m4v|avi|webm|qt|3gp|mkv|hevc)$/i.test(name);
        return !isVideo;
      });

      const photoIds = photos.map(p => p.id);
      
      // Determine unscanned photos
      const unscannedIds = [];
      for (let id of photoIds) {
        const scanned = await dbGet('scanned', id);
        if (!scanned) {
          unscannedIds.push(id);
        }
      }

      scanQueue = unscannedIds;
      currentScanIndex = 0;
      totalScanCount = scanQueue.length;

      if (totalScanCount > 0) {
        // Initialize Human asynchronously, then start scanning loop
        initHuman().then(() => {
          runScanLoop();
        }).catch(err => {
          console.error('[People Engine] Human initialization failed. Scanning aborted.', err);
        });
      } else {
        // No photos to scan, trigger final callback
        if (scanProgressCallback) {
          scanProgressCallback({
            scanned: 0,
            total: 0,
            isScanning: false
          });
        }
      }
    },

    stopScanning: function () {
      isScanning = false;
      console.log('[People Engine] Scanning stopped manually.');
    },

    // Get all people records ordered by the number of associated photos
    getPeople: async function () {
      const people = await dbGetAll('people');
      // Sort by photo count descending, and keep unnamed people at the bottom if counts are equal
      return people.sort((a, b) => {
        if (b.photoIds.length !== a.photoIds.length) {
          return b.photoIds.length - a.photoIds.length;
        }
        return (a.isUnnamed ? 1 : 0) - (b.isUnnamed ? 0 : 1);
      });
    },

    // Rename a person group
    renamePerson: async function (personId, newName) {
      const person = await dbGet('people', personId);
      if (person) {
        person.name = newName;
        delete person.isUnnamed; // Remove unnamed flag
        await dbPut('people', person);
        if (peopleUpdateCallback) {
          const currentPeople = await dbGetAll('people');
          peopleUpdateCallback(currentPeople);
        }
        return true;
      }
      return false;
    },

    // Merge two person clusters together (personId2 into personId1)
    mergePeople: async function (targetPersonId, sourcePersonId) {
      const target = await dbGet('people', targetPersonId);
      const source = await dbGet('people', sourcePersonId);

      if (target && source) {
        console.log(`[People Engine] Merging ${source.name} into ${target.name}`);
        
        // Merge photos (avoiding duplicates)
        source.photoIds.forEach(id => {
          if (!target.photoIds.includes(id)) {
            target.photoIds.push(id);
          }
        });

        // Merge embeddings (limit to 10 max)
        source.embeddings.forEach(emb => {
          if (target.embeddings.length < 10) {
            target.embeddings.push(emb);
          }
        });

        // Save target
        await dbPut('people', target);
        
        // Delete source
        await dbDelete('people', sourcePersonId);

        if (peopleUpdateCallback) {
          const currentPeople = await dbGetAll('people');
          peopleUpdateCallback(currentPeople);
        }
        return true;
      }
      return false;
    },

    // Reset everything in IndexedDB (clear all clusters and scan history)
    resetDatabase: async function () {
      isScanning = false;
      
      const db = await initDB();
      return new Promise((resolve, reject) => {
        // Close DB connection
        db.close();
        idb = null;

        const req = indexedDB.deleteDatabase(DB_NAME);
        req.onsuccess = () => {
          console.log('[People Engine] People database successfully cleared.');
          resolve();
        };
        req.onerror = () => {
          console.error('[People Engine] Failed to delete database.');
          reject(req.error);
        };
      });
    }
  };

  // Export to global scope
  // @ts-ignore
  global.PeopleEngine = PeopleEngine;

})(this);
