import { useCallback, useEffect, useRef, useState } from "react";
import { AmbientSoundProvider, BrowserMediaProvider, EMPTY_MEDIA_STATE } from "./mediaProvider";

export function useDeskMedia({ ambientSound = "none", ambientVolume = 0.35, onAmbientChange } = {}) {
  const mediaProviderRef = useRef(null);
  const ambientProviderRef = useRef(null);
  if (!mediaProviderRef.current) mediaProviderRef.current = new BrowserMediaProvider();
  if (!ambientProviderRef.current) ambientProviderRef.current = new AmbientSoundProvider();
  const [media, setMedia] = useState(EMPTY_MEDIA_STATE);

  const refresh = useCallback(() => setMedia(mediaProviderRef.current.read()), []);
  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 1000);
    return () => window.clearInterval(timer);
  }, [refresh]);
  useEffect(() => () => ambientProviderRef.current?.stop(), []);

  const setAmbientSound = useCallback(async (sound) => {
    await ambientProviderRef.current.set(sound, ambientVolume);
    onAmbientChange?.({ sound, volume: ambientVolume });
  }, [ambientVolume, onAmbientChange]);
  const setAmbientVolume = useCallback((volume) => {
    ambientProviderRef.current.setVolume(volume);
    onAmbientChange?.({ sound: ambientSound, volume });
  }, [ambientSound, onAmbientChange]);

  return {
    media,
    refresh,
    play: async () => { await mediaProviderRef.current.play(); refresh(); },
    pause: () => { mediaProviderRef.current.pause(); refresh(); },
    previous: () => mediaProviderRef.current.previous(),
    next: () => mediaProviderRef.current.next(),
    seek: (position) => { mediaProviderRef.current.seek(position); refresh(); },
    setVolume: (volume) => { mediaProviderRef.current.setVolume(volume); refresh(); },
    setAmbientSound,
    setAmbientVolume,
  };
}
