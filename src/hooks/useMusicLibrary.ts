import { useContext } from "react";
import { MusicLibraryContext } from "@/contexts/MusicLibraryContext";
import type { MusicLayer, MusicUrl } from "@/types/music";

export type { MusicLayer, MusicUrl };

export function useMusicLibrary() {
  const context = useContext(MusicLibraryContext);
  if (context === undefined) {
    throw new Error('useMusicLibrary must be used within a MusicLibraryProvider');
  }
  return context;
}
