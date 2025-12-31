import { useState, useEffect } from "react";
import { auth } from "@/lib/firebase";

export interface MusicLayer {
  id: string;
  name: string;
  icon: string;
  volume: number;
}

export interface MusicUrl {
  id: string;
  url: string;
  title: string;
  thumbnail: string;
  addedAt: Date;
  layers: MusicLayer[];
  // For uploaded audio files
  isLocalFile?: boolean;
  fileDataUrl?: string | null;
  // extracted files (filename + blobUrl)
  files?: { filename: string; blobUrl: string }[];
  // optional cache key returned by backend for uploads
  cacheKey?: string;
  // whether the entry finished processing and is available for download
  processed?: boolean;
  // R2 storage fields
  song_id?: string;  // Unique song ID for R2 storage
  uid?: string;      // Firebase user ID
}

const STORAGE_KEY = "music-analyzer-library";

export function useMusicLibrary() {
  const [urls, setUrls] = useState<MusicUrl[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const pendingDeletes = { current: new Map<string, { item: MusicUrl; timer: ReturnType<typeof setTimeout> }>() } as { current: Map<string, { item: MusicUrl; timer: ReturnType<typeof setTimeout> }> };
  const pendingClear = { current: null as null | { items: MusicUrl[]; timer: ReturnType<typeof setTimeout> } } as { current: null | { items: MusicUrl[]; timer: ReturnType<typeof setTimeout> } };

  // Load from localStorage and R2 on mount
  useEffect(() => {
    const loadLibrary = async () => {
      try {
        // Load from localStorage first
        const stored = localStorage.getItem(STORAGE_KEY);
        let localUrls: MusicUrl[] = [];

        if (stored) {
          const parsed = JSON.parse(stored);
          localUrls = parsed.map((url: any) => ({
            ...url,
            addedAt: new Date(url.addedAt),
            layers: ((url.layers && url.layers.length > 0) ? url.layers : (url.files ? generateLayersFromFiles(url.files) : [])).sort((a: any, b: any) => a.name.localeCompare(b.name))
          }));
        }

        // Try to load R2 songs if user is authenticated
        const user = auth.currentUser;
        if (user) {
          try {
            const token = await user.getIdToken();
            const base = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

            const response = await fetch(`${base}/my-songs`, {
              headers: {
                'Authorization': `Bearer ${token}`
              }
            });

            if (response.ok) {
              const data = await response.json();

              // Convert R2 songs to MusicUrl format
              const r2Urls: MusicUrl[] = data.songs.map((song: any) => ({
                id: song.song_id,
                url: `r2:${song.song_id}`,
                title: song.title || `Song ${song.song_id.substring(0, 8)}`,
                thumbnail: '',
                addedAt: song.created_at ? new Date(song.created_at) : new Date(),
                layers: generateLayersFromFiles(song.files.map((f: any) => ({ filename: f.filename }))),
                isLocalFile: false,
                fileDataUrl: null,
                files: song.files.map((f: any) => ({ filename: f.filename, blobUrl: '' })),
                song_id: song.song_id,
                uid: data.uid,
                processed: true,
              }));

              // Merge R2 songs with local songs (prefer R2 titles/metadata if song_id matches)
              const merged = [...localUrls];
              r2Urls.forEach(r2 => {
                const index = merged.findIndex(u => u.song_id === r2.song_id);
                if (index !== -1) {
                  // Update existing item with R2 metadata (title, etc.)
                  merged[index] = { ...merged[index], ...r2 };
                } else {
                  // Add new item
                  merged.push(r2);
                }
              });

              setUrls(merged);
            } else {
              // If R2 fetch fails, just use local storage
              setUrls(localUrls);
            }
          } catch (e) {
            console.warn('Failed to load R2 songs:', e);
            setUrls(localUrls);
          }
        } else {
          // Not authenticated, just use local storage
          setUrls(localUrls);
        }
      } catch (e) {
        console.error('Failed to load library:', e);
      } finally {
        setIsInitialized(true);
      }
    };

    loadLibrary();
  }, []);

  // Save to localStorage whenever urls change
  useEffect(() => {
    if (!isInitialized) return;
    try {
      if (urls.length > 0) {
        const sanitized = urls.map(u => ({
          ...u,
          files: u.files ? u.files.map(f => ({ filename: f.filename })) : undefined
        }));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch (e) {
      // noop
    }
  }, [urls, isInitialized]);

  const addAudioFile = async (file: File, tosAgreed: boolean): Promise<MusicUrl> => {
    setIsLoading(true);
    try {
      if (!tosAgreed) {
        throw new Error("You must agree to the Terms of Service.");
      }

      const formData = new FormData();
      formData.append('file', file);
      formData.append('tos_agreed', 'true');

      // Get reCAPTCHA token if site key is configured
      const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;
      if (siteKey && window.grecaptcha) {
        try {
          const token = await window.grecaptcha.execute(siteKey, { action: 'upload' });
          formData.append('recaptcha_token', token);
        } catch (e) {
          console.warn('reCAPTCHA execution failed:', e);
        }
      }

      // Get Firebase ID token if user is logged in
      const user = auth.currentUser;
      const headers: HeadersInit = {};

      if (user) {
        try {
          const token = await user.getIdToken();
          headers['Authorization'] = `Bearer ${token}`;
        } catch (e) {
          console.warn('Failed to get Firebase token:', e);
        }
      }

      // In production, set VITE_API_BASE_URL to your deployed backend URL
      const base = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
      const res = await fetch(`${base}/upload`, {
        method: 'POST',
        headers,
        body: formData,
      });

      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try {
          const json = await res.json();
          detail = json.detail || json.message || json.error || JSON.stringify(json);
        } catch (e) {
          try {
            const text = await res.text();
            detail = text || detail;
          } catch { }
        }

        // Provide helpful error messages
        if (res.status === 500) {
          detail = `Backend server error: ${detail}\n\nMake sure your backend server is running and properly configured. Check backend logs for details.`;
        } else if (res.status === 404) {
          detail = `Endpoint not found: /upload\n\nEnsure your backend server implements the /upload endpoint.`;
        }

        throw new Error(detail);
      }

      // Check if response is JSON (R2 mode) or blob (legacy ZIP mode)
      const contentType = res.headers.get('content-type');

      if (contentType?.includes('application/json')) {
        // R2 mode: response contains song_id, uid, and file list
        const data = await res.json();

        const newMusicUrl: MusicUrl = {
          id: Date.now().toString(),
          url: `file:${file.name}`,
          title: data.title || file.name,
          thumbnail: '',
          addedAt: new Date(),
          layers: generateLayersFromFiles(data.files.map((f: string) => ({ filename: f }))),
          isLocalFile: true,
          fileDataUrl: null,
          files: data.files.map((f: string) => ({ filename: f, blobUrl: '' })), // No blob URLs in R2 mode
          song_id: data.song_id,
          uid: data.uid,
          processed: true,
        };

        setUrls(prev => [newMusicUrl, ...prev]);
        return newMusicUrl;
      } else {
        // Legacy ZIP mode
        const blob = await res.blob();
        // dynamic import of jszip (ensure dependency installed)
        // @ts-ignore - allow dynamic import until types are available
        const JSZipModule = await import('jszip');
        // @ts-ignore - default export on some bundlers
        const JSZip = (JSZipModule as any).default || JSZipModule;
        // JSZip exposes a static `loadAsync` method
        const zip = await JSZip.loadAsync(blob);

        const files: { filename: string; blobUrl: string }[] = [];
        await Promise.all(Object.keys(zip.files).map(async (filename) => {
          if (filename.endsWith('/')) return;
          const fileData = await zip.files[filename].async('blob');
          const blobUrl = URL.createObjectURL(fileData);
          files.push({ filename, blobUrl });
        }));

        const newMusicUrl: MusicUrl = {
          id: Date.now().toString(),
          url: `file:${file.name}`,
          title: file.name,
          thumbnail: '',
          addedAt: new Date(),
          layers: generateLayersFromFiles(files),
          isLocalFile: true,
          fileDataUrl: null,
          files,
          cacheKey: res.headers.get('X-Cache-Key') || undefined,
          processed: true,
        };

        setUrls(prev => [newMusicUrl, ...prev]);
        return newMusicUrl;
      }
    } finally {
      setIsLoading(false);
    }
  };

  const removeMusicUrl = (id: string) => {
    setUrls(prev => prev.filter(url => url.id !== id));
    // revoking blob URLs
    const removed = urls.find(u => u.id === id);
    if (removed && removed.files) {
      removed.files.forEach(f => { if (f.blobUrl) URL.revokeObjectURL(f.blobUrl); });
    }
  };

  const finalizeRemoveMusicUrl = async (id: string) => {
    try {
      const entry = pendingDeletes.current.get(id);
      if (!entry) return;

      // If it's an R2 song, delete from backend
      if (entry.item.song_id) {
        try {
          const user = auth.currentUser;
          if (user) {
            const token = await user.getIdToken();
            const base = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
            await fetch(`${base}/songs/${entry.item.song_id}`, {
              method: 'DELETE',
              headers: {
                'Authorization': `Bearer ${token}`
              }
            });
            console.log(`Successfully deleted song ${entry.item.song_id} from R2`);
          }
        } catch (e) {
          console.error(`Failed to delete song ${entry.item.song_id} from R2:`, e);
        }
      }

      // Revoke blob URLs from removed item
      if (entry.item && entry.item.files) {
        for (const f of entry.item.files) {
          try { if (f.blobUrl) URL.revokeObjectURL(f.blobUrl); } catch { };
        }
      }
      pendingDeletes.current.delete(id);
    } catch (e) {
      // noop
    }
  };

  const scheduleRemoveMusicUrl = (id: string, ttl = 10000) => {
    const found = urls.find(u => u.id === id);
    if (!found) return;
    setUrls(prev => prev.filter(u => u.id !== id));

    // store pending delete with timer
    const timer = setTimeout(() => finalizeRemoveMusicUrl(id), ttl);
    pendingDeletes.current.set(id, { item: found, timer });
  };

  const undoRemoveMusicUrl = (id: string) => {
    const entry = pendingDeletes.current.get(id);
    if (!entry) return;
    clearTimeout(entry.timer);
    pendingDeletes.current.delete(id);
    setUrls(prev => {
      const next = [entry.item, ...prev];
      try {
        const sanitized = next.map(u => ({
          ...u,
          files: u.files ? u.files.map(f => ({ filename: f.filename })) : undefined
        }));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
      } catch { }
      return next;
    });
  };

  const updateMusicTitle = (id: string, newTitle: string) => {
    setUrls(prev => prev.map(u => u.id === id ? { ...u, title: newTitle } : u));
  };

  const clearLibrary = () => {
    // Schedule clear with undo window: move all items into pendingClear
    try {
      const items = [...urls];
      setUrls([]);
      localStorage.removeItem(STORAGE_KEY);
      const timer = setTimeout(async () => {
        // finalize: delete R2 items if authenticated
        const hasR2Items = items.some(u => u.song_id);
        if (hasR2Items) {
          try {
            const user = auth.currentUser;
            if (user) {
              const token = await user.getIdToken();
              const base = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
              await fetch(`${base}/songs`, {
                method: 'DELETE',
                headers: {
                  'Authorization': `Bearer ${token}`
                }
              });
              console.log('Successfully cleared all R2 songs');
            }
          } catch (e) {
            console.error('Failed to clear R2 songs:', e);
          }
        }

        // finalize: revoke any blob URLs
        try {
          for (const u of items) {
            if (u.files) {
              for (const f of u.files) {
                try { if (f.blobUrl) URL.revokeObjectURL(f.blobUrl); } catch { };
              }
            }
          }
        } catch { }
        pendingClear.current = null;
      }, 10000);
      pendingClear.current = { items, timer };
    } catch (e) {
      setUrls([]);
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  const undoClearLibrary = () => {
    if (!pendingClear.current) return;
    const { items, timer } = pendingClear.current;
    clearTimeout(timer);
    pendingClear.current = null;
    setUrls(items);
    try {
      const sanitized = items.map(u => ({ ...u, files: u.files ? u.files.map(f => ({ filename: f.filename })) : undefined }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
    } catch { }
  };

  // Helper function to get presigned URL for R2 files
  const getPresignedUrl = async (songId: string, filename: string): Promise<string> => {
    const user = auth.currentUser;
    if (!user) {
      throw new Error('Not authenticated');
    }

    const token = await user.getIdToken();
    const base = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

    const response = await fetch(`${base}/presigned-url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ song_id: songId, filename })
    });

    if (!response.ok) {
      throw new Error(`Failed to get presigned URL: ${response.statusText}`);
    }

    const data = await response.json();
    return data.url;
  };

  return {
    urls,
    isLoading,
    addAudioFile,
    removeMusicUrl,
    updateMusicTitle,
    scheduleRemoveMusicUrl,
    undoRemoveMusicUrl,
    scheduleClearLibrary: clearLibrary,
    undoClearLibrary,
    clearLibrary,
    getPresignedUrl
  };
}

function generateLayersFromFiles(files: { filename: string; blobUrl?: string }[]): MusicLayer[] {
  const mapping: Record<string, { name: string; icon: string }> = {
    'vocals': { name: 'Vocals', icon: 'Mic' },
    'vocal': { name: 'Vocals', icon: 'Mic' },
    'bass': { name: 'Bass', icon: 'Volume2' },
    'drums': { name: 'Percussion', icon: 'Drum' },
    'drum': { name: 'Percussion', icon: 'Drum' },
    'other': { name: 'Other', icon: 'Zap' },
    'instrumental': { name: 'Instrumental', icon: 'Music' },
  };

  const layers: MusicLayer[] = [];

  files.forEach(f => {
    if (!f.filename) return;
    // handle both / and \ paths, and remove extension
    const parts = f.filename.replace(/\\/g, '/').split('/');
    const lastPart = parts[parts.length - 1];
    const basename = lastPart.split('.')[0].toLowerCase();
    const extension = lastPart.split('.').pop()?.toLowerCase();

    // Only consider files with common audio extensions
    const isAudioFile = ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'].includes(extension || '');

    if (!isAudioFile) return; // Skip non-audio files

    const info = mapping[basename];
    if (info) {
      // avoid duplicates (e.g. if zip has both vocals.wav and vocals.mp3)
      if (!layers.find(l => l.id === basename)) {
        layers.push({
          id: basename,
          name: info.name,
          icon: info.icon,
          volume: 100
        });
      }
    } else if (f.filename.toLowerCase().endsWith('.mp3') || f.filename.toLowerCase().endsWith('.wav')) {
      if (!layers.find(l => l.id === basename)) {
        layers.push({
          id: basename,
          name: basename.charAt(0).toUpperCase() + basename.slice(1),
          icon: 'Music2',
          volume: 100
        });
      }
    }
  });

  // Sort layers alphabetically by name
  return layers.sort((a, b) => a.name.localeCompare(b.name));
}


