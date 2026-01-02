import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";

import { MusicLayer, MusicUrl } from "@/types/music";

interface MusicLibraryContextType {
    urls: MusicUrl[];
    isLoading: boolean;
    isInitialized: boolean;
    addAudioFile: (file: File, tosAgreed: boolean, stems?: string[]) => Promise<MusicUrl>;
    removeMusicUrl: (id: string) => Promise<void>;
    updateMusicTitle: (id: string, newTitle: string) => void;
    clearLibrary: () => Promise<void>;
    getPresignedUrl: (songId: string, filename: string) => Promise<string>;
    refreshLibrary: () => Promise<void>;
    // Playback state and controls
    playingKeys: Set<string>;
    pausedKeys: Set<string>;
    currentTimes: Record<string, number>;
    durations: Record<string, number>;
    handlePlayToggle: (key: string, f: any, musicUrl: any) => Promise<void>;
    handleSeek: (key: string, time: number) => void;
    stopAllPlayback: () => void;
    handlePlayAll: (musicUrl: any) => Promise<void>;
}

export const MusicLibraryContext = createContext<MusicLibraryContextType | undefined>(undefined);

const STORAGE_KEY = "music-analyzer-library";

export function MusicLibraryProvider({ children }: { children: ReactNode }) {
    const { currentUser } = useAuth();
    const [urls, setUrls] = useState<MusicUrl[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isInitialized, setIsInitialized] = useState(false);

    // Playback state
    const audioPoolRef = React.useRef<Map<string, HTMLAudioElement>>(new Map());
    const [playingKeys, setPlayingKeys] = useState<Set<string>>(new Set());
    const [pausedKeys, setPausedKeys] = useState<Set<string>>(new Set());
    const [currentTimes, setCurrentTimes] = useState<Record<string, number>>({});
    const [durations, setDurations] = useState<Record<string, number>>({});

    const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

    const loadLibrary = async () => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            let localUrls: MusicUrl[] = [];

            if (stored) {
                const parsed = JSON.parse(stored);
                localUrls = parsed.map((url: any) => ({
                    ...url,
                    addedAt: new Date(url.addedAt),
                    layers: ((url.layers && url.layers.length > 0) ? url.layers : (url.files ? generateLayersFromFiles(url.files) : [])).sort((a: any, b: any) => a.name.localeCompare(b.name))
                }));

                // Filter by UID to prevent leakage between accounts
                // Also ensure we don't load R2 files from storage (they must come from API)
                if (currentUser) {
                    localUrls = localUrls.filter(u => (!u.uid || u.uid === currentUser.uid) && u.isLocalFile !== false);
                } else {
                    localUrls = localUrls.filter(u => !u.uid && u.isLocalFile !== false);
                }
            }

            const user = currentUser;
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

                        const merged = [...localUrls];
                        r2Urls.forEach(r2 => {
                            const index = merged.findIndex(u => u.song_id === r2.song_id);
                            if (index !== -1) {
                                merged[index] = { ...merged[index], ...r2 };
                            } else {
                                merged.push(r2);
                            }
                        });

                        // Robust sort by addedAt (most recent first)
                        const sorted = [...merged].sort((a, b) => {
                            const timeA = a.addedAt instanceof Date ? a.addedAt.getTime() : new Date(a.addedAt).getTime();
                            const timeB = b.addedAt instanceof Date ? b.addedAt.getTime() : new Date(b.addedAt).getTime();
                            return (timeB || 0) - (timeA || 0);
                        });
                        setUrls(sorted);
                    } else {
                        const sorted = [...localUrls].sort((a, b) => {
                            const timeA = a.addedAt instanceof Date ? a.addedAt.getTime() : new Date(a.addedAt).getTime();
                            const timeB = b.addedAt instanceof Date ? b.addedAt.getTime() : new Date(b.addedAt).getTime();
                            return (timeB || 0) - (timeA || 0);
                        });
                        setUrls(sorted);
                    }
                } catch (e) {
                    console.warn('Failed to load R2 songs:', e);
                    const sorted = [...localUrls].sort((a, b) => {
                        const timeA = a.addedAt instanceof Date ? a.addedAt.getTime() : new Date(a.addedAt).getTime();
                        const timeB = b.addedAt instanceof Date ? b.addedAt.getTime() : new Date(b.addedAt).getTime();
                        return (timeB || 0) - (timeA || 0);
                    });
                    setUrls(sorted);
                }
            } else {
                const sorted = [...localUrls].sort((a, b) => {
                    const timeA = a.addedAt instanceof Date ? a.addedAt.getTime() : new Date(a.addedAt).getTime();
                    const timeB = b.addedAt instanceof Date ? b.addedAt.getTime() : new Date(b.addedAt).getTime();
                    return (timeB || 0) - (timeA || 0);
                });
                setUrls(sorted);
            }
        } catch (e) {
            console.error('Failed to load library:', e);
        } finally {
            setIsInitialized(true);
        }
    };

    useEffect(() => {
        setUrls([]);
        setIsInitialized(false);
        loadLibrary();
    }, [currentUser]);

    useEffect(() => {
        if (!isInitialized) return;
        try {
            // Only save local files to localStorage. 
            // R2 songs (isLocalFile: false) should only be fetched from the API.
            const localUrls = urls.filter(u => u.isLocalFile !== false);

            if (localUrls.length > 0) {
                const sanitized = localUrls.map(u => ({
                    ...u,
                    files: u.files ? u.files.map(f => ({ filename: f.filename })) : undefined
                }));
                localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
            } else {
                // If there are no local files, clear the storage to avoid stale data
                localStorage.removeItem(STORAGE_KEY);
            }
        } catch (e) { }
    }, [urls, isInitialized]);

    const addAudioFile = async (file: File, tosAgreed: boolean, stems?: string[]): Promise<MusicUrl> => {
        setIsLoading(true);
        try {
            if (!tosAgreed) throw new Error("You must agree to the Terms of Service.");

            const formData = new FormData();
            formData.append('file', file);
            formData.append('tos_agreed', 'true');
            if (stems && stems.length > 0) {
                formData.append('stems', stems.join(','));
            }

            const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;
            if (siteKey && window.grecaptcha) {
                try {
                    const token = await window.grecaptcha.execute(siteKey, { action: 'upload' });
                    formData.append('recaptcha_token', token);
                } catch (e) { }
            }

            const user = currentUser;
            const headers: HeadersInit = {};
            if (user) {
                try {
                    const token = await user.getIdToken();
                    headers['Authorization'] = `Bearer ${token}`;
                } catch (e) { }
            }

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
                } catch (e) { }
                throw new Error(detail);
            }

            const contentType = res.headers.get('content-type');
            let newMusicUrl: MusicUrl;

            if (contentType?.includes('application/json')) {
                const data = await res.json();
                newMusicUrl = {
                    id: Date.now().toString(),
                    url: `file:${file.name}`,
                    title: data.title || file.name,
                    thumbnail: '',
                    addedAt: new Date(),
                    layers: generateLayersFromFiles(data.files.map((f: string) => ({ filename: f }))),
                    isLocalFile: true,
                    fileDataUrl: null,
                    files: data.files.map((f: string) => ({ filename: f, blobUrl: '' })),
                    song_id: data.song_id,
                    uid: data.uid,
                    processed: true,
                };
            } else {
                const blob = await res.blob();
                const JSZipModule = await import('jszip');
                const JSZip = (JSZipModule as any).default || JSZipModule;
                const zip = await JSZip.loadAsync(blob);

                const files: { filename: string; blobUrl: string }[] = [];
                await Promise.all(Object.keys(zip.files).map(async (filename) => {
                    if (filename.endsWith('/')) return;
                    const fileData = await zip.files[filename].async('blob');
                    const blobUrl = URL.createObjectURL(fileData);
                    files.push({ filename, blobUrl });
                }));

                newMusicUrl = {
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
            }

            setUrls(prev => [newMusicUrl, ...prev]);
            return newMusicUrl;
        } finally {
            setIsLoading(false);
        }
    };

    const removeMusicUrl = async (id: string) => {
        const itemToRemove = urls.find(u => u.id === id);
        if (!itemToRemove) return;

        setUrls(prev => prev.filter(url => url.id !== id));

        if (itemToRemove.files) {
            itemToRemove.files.forEach(f => {
                if (f.blobUrl) {
                    try { URL.revokeObjectURL(f.blobUrl); } catch { }
                }
            });
        }

        if (itemToRemove.song_id) {
            try {
                const user = currentUser;
                if (user) {
                    const token = await user.getIdToken();
                    const base = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
                    await fetch(`${base}/songs/${itemToRemove.song_id}`, {
                        method: 'DELETE',
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                }
            } catch (e) { }
        }

        // Stop all audio for this song
        const prefix = `${id}__`;
        audioPoolRef.current.forEach((audio, key) => {
            if (key.startsWith(prefix)) {
                audio.pause();
                audio.src = "";
                audioPoolRef.current.delete(key);
                setPlayingKeys(prev => {
                    const next = new Set(prev);
                    next.delete(key);
                    return next;
                });
                setPausedKeys(prev => {
                    const next = new Set(prev);
                    next.delete(key);
                    return next;
                });
            }
        });
    };

    const clearLibrary = async () => {
        const items = [...urls];
        setUrls([]);
        localStorage.removeItem(STORAGE_KEY);

        const hasR2Items = items.some(u => u.song_id);
        if (hasR2Items && currentUser) {
            try {
                const token = await currentUser.getIdToken();
                const base = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
                await fetch(`${base}/songs`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
            } catch (e) { }
        }

        try {
            for (const u of items) {
                if (u.files) {
                    for (const f of u.files) {
                        try { if (f.blobUrl) URL.revokeObjectURL(f.blobUrl); } catch { }
                    }
                }
            }
        } catch { }
    };

    const updateMusicTitle = (id: string, newTitle: string) => {
        setUrls(prev => prev.map(u => u.id === id ? { ...u, title: newTitle } : u));
    };

    const getPresignedUrl = async (songId: string, filename: string): Promise<string> => {
        const user = currentUser;
        if (!user) throw new Error('Not authenticated');

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

        if (!response.ok) throw new Error(`Failed to get presigned URL: ${response.statusText}`);

        const data = await response.json();
        return data.url;
    };

    const handlePlayToggle = async (key: string, f: any, musicUrl: any) => {
        try {
            const audioPool = audioPoolRef.current;

            if (audioPool.has(key)) {
                const audio = audioPool.get(key);
                if (audio) {
                    if (playingKeys.has(key)) {
                        audio.pause();
                        setPlayingKeys(prev => {
                            const next = new Set(prev);
                            next.delete(key);
                            return next;
                        });
                        setPausedKeys(prev => new Set(prev).add(key));
                    } else {
                        await audio.play();
                        setPausedKeys(prev => {
                            const next = new Set(prev);
                            next.delete(key);
                            return next;
                        });
                        setPlayingKeys(prev => new Set(prev).add(key));
                    }
                }
                return;
            }

            let srcUrl: string | null = null;
            if (musicUrl.song_id && !f.blobUrl) {
                srcUrl = await getPresignedUrl(musicUrl.song_id, f.filename);
            } else if (f.blobUrl) {
                srcUrl = f.blobUrl;
            } else if (musicUrl.cacheKey) {
                srcUrl = `${apiBase}/stems/${musicUrl.cacheKey}/${f.filename}`;
            }

            if (!srcUrl) throw new Error('No playable source');
            const audio = new Audio(srcUrl);
            audio.volume = 1.0;

            const firstPlaying = Array.from(audioPool.values())[0];
            if (firstPlaying && !firstPlaying.paused) {
                audio.currentTime = firstPlaying.currentTime;
            }

            audio.ontimeupdate = () => {
                setCurrentTimes(prev => ({ ...prev, [key]: audio.currentTime }));
            };

            audio.onloadedmetadata = () => {
                setDurations(prev => ({ ...prev, [key]: audio.duration }));
            };

            audio.onended = () => {
                audioPool.delete(key);
                setPlayingKeys(prev => {
                    const next = new Set(prev);
                    next.delete(key);
                    return next;
                });
            };

            await audio.play();
            audioPool.set(key, audio);
            setPlayingKeys(prev => new Set(prev).add(key));
        } catch (err) {
            console.error('Playback failed:', err);
            throw err;
        }
    };

    const handleSeek = (key: string, time: number) => {
        const audio = audioPoolRef.current.get(key);
        if (audio) {
            audio.currentTime = time;
            setCurrentTimes(prev => ({ ...prev, [key]: time }));
        }
    };

    const stopAllPlayback = () => {
        audioPoolRef.current.forEach(audio => {
            audio.pause();
            audio.src = "";
        });
        audioPoolRef.current.clear();
        setPlayingKeys(new Set());
        setPausedKeys(new Set());
    };

    const handlePlayAll = async (musicUrl: any) => {
        if (!musicUrl.files) return;
        for (const file of musicUrl.files) {
            if (file.filename === 'original.mp3') continue;
            const key = `${musicUrl.id}__${file.filename}`;
            if (!playingKeys.has(key)) {
                await handlePlayToggle(key, file, musicUrl);
            }
        }
    };

    return (
        <MusicLibraryContext.Provider value={{
            urls,
            isLoading,
            isInitialized,
            addAudioFile,
            removeMusicUrl,
            updateMusicTitle,
            clearLibrary,
            getPresignedUrl,
            refreshLibrary: loadLibrary,
            playingKeys,
            pausedKeys,
            currentTimes,
            durations,
            handlePlayToggle,
            handleSeek,
            stopAllPlayback,
            handlePlayAll,
        }}>
            {children}
        </MusicLibraryContext.Provider>
    );
}

// useMusicLibraryContext removed and moved to src/hooks/useMusicLibrary.ts to satisfy Vite Fast Refresh

function generateLayersFromFiles(files: { filename: string; blobUrl?: string }[]): MusicLayer[] {
    const mapping: Record<string, { name: string; icon: string }> = {
        'original': { name: 'Original Audio', icon: 'Music' },
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
        const parts = f.filename.replace(/\\/g, '/').split('/');
        const lastPart = parts[parts.length - 1];
        const basename = lastPart.split('.')[0].toLowerCase();
        const extension = lastPart.split('.').pop()?.toLowerCase();
        const isAudioFile = ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'].includes(extension || '');
        if (!isAudioFile) return;

        const info = mapping[basename];
        if (info) {
            if (!layers.find(l => l.id === basename)) {
                layers.push({ id: basename, name: info.name, icon: info.icon, volume: 100 });
            }
        } else if (f.filename.toLowerCase().endsWith('.mp3') || f.filename.toLowerCase().endsWith('.wav')) {
            if (!layers.find(l => l.id === basename)) {
                layers.push({ id: basename, name: basename.charAt(0).toUpperCase() + basename.slice(1), icon: 'Music2', volume: 100 });
            }
        }
    });

    return layers.sort((a, b) => {
        if (a.id === 'original') return -1;
        if (b.id === 'original') return 1;
        return a.name.localeCompare(b.name);
    });
}
