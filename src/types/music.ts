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
    isLocalFile?: boolean;
    fileDataUrl?: string | null;
    files?: { filename: string; blobUrl: string }[];
    cacheKey?: string;
    processed?: boolean;
    song_id?: string;
    uid?: string;
}
