import { useState, useEffect, useRef } from "react";
import { ChevronDown, ChevronRight, Music, Volume2, Piano, Drum, Zap, Mic, Music2, Trash2, Loader2, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMusicLibrary } from "@/hooks/useMusicLibrary";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const iconMap = {
  Volume2,
  Drum,
  Mic,
  Piano,
  Music,
  Zap,
  Music2
};

interface MusicSidebarProps {
  onUrlSelect?: (url: string) => void;
}

export function MusicSidebar({ onUrlSelect }: MusicSidebarProps) {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState<Record<string, boolean>>({});
  const [downloadControllers, setDownloadControllers] = useState<Record<string, AbortController | null>>({});
  const [availableFiles, setAvailableFiles] = useState<Record<string, Set<string>>>({});
  const [titleOverrides, setTitleOverrides] = useState<Record<string, string>>({});
  // Multi-stem playback state
  const audioPoolRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const [playingKeys, setPlayingKeys] = useState<Set<string>>(new Set());
  const [currentTimes, setCurrentTimes] = useState<Record<string, number>>({});
  const [durations, setDurations] = useState<Record<string, number>>({});
  const { urls, removeMusicUrl, clearLibrary, updateMusicTitle, scheduleRemoveMusicUrl, undoRemoveMusicUrl, scheduleClearLibrary, undoClearLibrary, getPresignedUrl } = useMusicLibrary();
  const { toast } = useToast();

  // Auto-refresh caches when library changes
  useEffect(() => {
    setAvailableFiles({});
    setTitleOverrides({});
    setDownloading({});
  }, [urls]);

  // In production, set VITE_API_BASE_URL to your deployed backend URL
  const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

  const toggleExpanded = (id: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedItems(newExpanded);
  };

  // Helper: find a specific file entry in a JSZip archive and return a Blob
  const findEntryInZip = async (zipBlob: Blob, filename: string): Promise<Blob | null> => {
    // @ts-ignore
    const JSZipModule = await import('jszip');
    // @ts-ignore
    const JSZip = (JSZipModule as any).default || JSZipModule;
    const zip = await JSZip.loadAsync(zipBlob);
    let entry = zip.files[filename] || null;
    if (!entry) {
      const keys = Object.keys(zip.files);
      const found = keys.find(k => k.endsWith(filename));
      if (found) entry = zip.files[found];
    }
    if (!entry) return null;
    const fileData = await entry.async('blob');
    return fileData;
  };

  // Helper: Play or stop a file preview (multi-stem support)
  const handlePlayToggle = async (e: any, key: string, f: any, musicUrl: any) => {
    e.stopPropagation();
    try {
      const audioPool = audioPoolRef.current;

      // If already playing, pause and remove
      if (playingKeys.has(key)) {
        const audio = audioPool.get(key);
        if (audio) {
          audio.pause();
          audioPool.delete(key);
        }
        setPlayingKeys(prev => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
        return;
      }

      // Create and play new audio
      let srcUrl: string | null = null;

      // Check if this is an R2-stored file (has song_id)
      if (musicUrl.song_id && !f.blobUrl) {
        try {
          srcUrl = await getPresignedUrl(musicUrl.song_id, f.filename);
        } catch (error) {
          console.error('Failed to get presigned URL:', error);
          throw new Error('Failed to load audio file. Please try again.');
        }
      } else if (f.blobUrl) {
        srcUrl = f.blobUrl;
      } else if (musicUrl.cacheKey) {
        srcUrl = `${apiBase}/stems/${musicUrl.cacheKey}/${f.filename}`;
      }

      if (!srcUrl) throw new Error('No playable source');
      const audio = new Audio(srcUrl);

      // Set volume to 100%
      audio.volume = 1.0;

      // Sync with other playing audio (if any)
      const firstPlaying = Array.from(audioPool.values())[0];
      if (firstPlaying && !firstPlaying.paused) {
        audio.currentTime = firstPlaying.currentTime;
      }

      // Update time and duration
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
    } catch (err: any) {
      toast({ title: 'Playback failed', description: err?.message || String(err), variant: 'destructive' });
    }
  };

  // Helper: Handle seek/timestamp change
  const handleSeek = (key: string, time: number) => {
    const audio = audioPoolRef.current.get(key);
    if (audio) {
      audio.currentTime = time;
      setCurrentTimes(prev => ({ ...prev, [key]: time }));
    }
  };

  // Helper: Format time as MM:SS
  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Helper: Play all stems
  const handlePlayAll = async (musicUrl: any) => {
    if (!musicUrl.files) return;
    for (const file of musicUrl.files) {
      const key = `${musicUrl.id}-${file.filename}`;
      if (!playingKeys.has(key)) {
        await handlePlayToggle({ stopPropagation: () => { } }, key, file, musicUrl);
      }
    }
  };

  // Helper: Stop all stems
  const handleStopAll = () => {
    audioPoolRef.current.forEach(audio => audio.pause());
    audioPoolRef.current.clear();
    setPlayingKeys(new Set());
  };

  // Helper: download a file (from blobUrl or by extracting from remote ZIP)
  const handleDownload = async (e: any, key: string, f: any, musicUrl: any) => {
    e.stopPropagation();
    if (downloading[key]) return;
    const controller = new AbortController();
    setDownloadControllers(prev => ({ ...prev, [key]: controller }));
    setDownloading(prev => ({ ...prev, [key]: true }));
    try {
      // Check if this is an R2-stored file (has song_id)
      if (musicUrl.song_id && !f.blobUrl) {
        try {
          const presignedUrl = await getPresignedUrl(musicUrl.song_id, f.filename);
          const a = document.createElement('a');
          a.href = presignedUrl;
          a.download = f.filename;
          document.body.appendChild(a);
          a.click();
          a.remove();
        } catch (error) {
          console.error('Failed to get presigned URL for download:', error);
          throw new Error('Failed to download file. Please try again.');
        }
      } else if (f.blobUrl) {
        const a = document.createElement('a');
        a.href = f.blobUrl;
        a.download = f.filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } else if (musicUrl.cacheKey) {
        // use individual stem endpoint
        const url = `${apiBase}/stems/${musicUrl.cacheKey}/${f.filename}`;
        const a = document.createElement('a');
        a.href = url;
        a.download = f.filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } else {
        throw new Error('Original uploaded file not available for re-download in this session.');
      }
    } catch (err: any) {
      if (err && err.name === 'AbortError') {
        toast({ title: 'Download cancelled', description: 'The download was stopped.', variant: 'default' });
      } else {
        toast({ title: 'Download failed', description: err?.message || String(err), variant: 'destructive' });
      }
    } finally {
      setDownloading(prev => ({ ...prev, [key]: false }));
      setDownloadControllers(prev => ({ ...prev, [key]: null }));
    }
  };

  return (
    <div className="w-80 md:w-80 h-full md:h-screen bg-card border-r border-border/50 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 md:p-6 border-b border-border/50 bg-gradient-secondary flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground mb-2">Music Library</h2>
          <p className="hidden md:block text-sm text-muted-foreground">{urls.length} tracks analyzed</p>
        </div>
        <div>
          {urls.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive"
              onClick={() => {
                try {
                  scheduleClearLibrary();
                  toast({
                    title: 'Library cleared',
                    description: 'All items removed. Undo?',
                    action: (
                      <button className="text-sm underline" onClick={() => undoClearLibrary()}>
                        Undo
                      </button>
                    )
                  });
                } catch (err: any) {
                  toast({ title: 'Error', description: err?.message || 'Failed to clear library', variant: 'destructive' });
                }
              }}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* URL List */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-3">
          {urls.map((musicUrl, idx) => {
            const isExpanded = expandedItems.has(musicUrl.id);

            return (
              <div
                key={musicUrl.id}
                className={cn(
                  "bg-muted/10 rounded-xl border border-border/10 overflow-hidden transition-all duration-300",
                  "animate-fade-in"
                )}
                style={{ animationDelay: `${idx * 60}ms` }}
              >
                {/* URL Header */}
                <button
                  onClick={() => toggleExpanded(musicUrl.id)}
                  className="w-full p-3 text-left flex items-center gap-3 hover:bg-muted/10 transition-colors"
                >
                  <div className="flex-shrink-0">
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-primary" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-foreground text-sm">
                        {titleOverrides[musicUrl.id] || musicUrl.title}
                      </h3>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {musicUrl.addedAt.toLocaleDateString()}
                    </p>
                  </div>

                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      try {
                        scheduleRemoveMusicUrl(musicUrl.id);
                        toast({
                          title: 'Item deleted',
                          description: 'The item has been removed. Undo?',
                          action: (
                            <button className="text-sm underline" onClick={() => undoRemoveMusicUrl(musicUrl.id)}>
                              Undo
                            </button>
                          )
                        });
                      } catch (err: any) {
                        toast({ title: 'Error', description: err?.message || 'Failed to delete item', variant: 'destructive' });
                      }
                    }}
                    className="p-1 hover:bg-destructive/20 rounded transition-colors inline-flex items-center"
                  >
                    <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                  </span>
                </button>

                {/* Layers Dropdown */}
                {isExpanded && (
                  <div className="border-t border-border/20 bg-card/0 animate-slide-up">
                    <div className="p-2 space-y-2">
                      <div className="space-y-1 mt-1">
                        {musicUrl.layers.map((layer) => {
                          const IconComponent = iconMap[layer.icon as keyof typeof iconMap] || Music;
                          const f = musicUrl.files?.find(file => {
                            const parts = file.filename.replace(/\\/g, '/').split('/');
                            const basename = parts[parts.length - 1].split('.')[0].toLowerCase();
                            return basename === layer.id.toLowerCase();
                          });

                          if (!f) return null;
                          const trackKey = `${musicUrl.id}__${f.filename}`;
                          const isPlaying = playingKeys.has(trackKey);
                          const isOriginal = f.filename === 'original.mp3';
                          const displayName = isOriginal ? 'Original Audio' : layer.name;
                          const DisplayIcon = isOriginal ? Music2 : IconComponent;

                          return (
                            <div
                              key={layer.id}
                              className={cn(
                                "group flex flex-col p-2 rounded-lg transition-all duration-200",
                                "bg-background/40 hover:bg-background/60 border border-border/5 mb-1",
                                isPlaying && "ring-1 ring-primary/30 bg-background/80"
                              )}
                            >
                              <div className="flex items-center gap-3">
                                <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-md bg-muted/20 group-hover:bg-primary/10 transition-colors">
                                  <DisplayIcon className={cn("w-4 h-4 transition-colors", isPlaying ? "text-primary" : "text-muted-foreground")} />
                                </div>

                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-sm font-medium text-foreground truncate">{displayName}</span>
                                    <div className="flex items-center gap-1">
                                      <button
                                        onClick={(e) => handlePlayToggle(e, trackKey, f, musicUrl)}
                                        className={cn(
                                          "p-1.5 rounded-md transition-all",
                                          isPlaying ? "bg-primary/20 text-primary" : "hover:bg-primary/10 text-muted-foreground"
                                        )}
                                      >
                                        {isPlaying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Volume2 className="w-3.5 h-3.5" />}
                                      </button>
                                      <button
                                        onClick={(e) => handleDownload(e, trackKey, f, musicUrl)}
                                        disabled={!!downloading[trackKey]}
                                        className="p-1.5 rounded-md hover:bg-primary/10 text-muted-foreground"
                                      >
                                        {downloading[trackKey] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {isPlaying && (
                                <div className="mt-2 flex items-center gap-2 px-1">
                                  <span className="text-xs text-muted-foreground w-10 text-left">
                                    {formatTime(currentTimes[trackKey] || 0)}
                                  </span>
                                  <input
                                    type="range"
                                    min="0"
                                    max={durations[trackKey] || 100}
                                    value={currentTimes[trackKey] || 0}
                                    onChange={(e) => handleSeek(trackKey, Number(e.target.value))}
                                    className="flex-1 h-1 bg-muted rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
                                  />
                                  <span className="text-xs text-muted-foreground w-10 text-right">
                                    {formatTime(durations[trackKey] || 0)}
                                  </span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {musicUrl.processed && (
                        <div className="pt-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full text-xs gap-2 py-4 bg-primary/5 border-primary/10 hover:bg-primary/10 text-primary transition-all rounded-xl"
                            onClick={(e) => {
                              e.stopPropagation();
                              const base = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
                              window.open(`${base}/cache/${musicUrl.cacheKey}`, '_blank');
                            }}
                          >
                            <Download className="w-3.5 h-3.5" />
                            Download Complete ZIP Archive
                          </Button>
                        </div>
                      )}

                      {musicUrl.layers.length === 0 && (
                        <div className="text-xs text-muted-foreground p-4 bg-muted/5 rounded-xl italic text-center border border-dashed border-border/20">
                          No audio tracks found for this analysis.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}