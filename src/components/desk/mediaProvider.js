const EMPTY_MEDIA_STATE = {
  available: false,
  title: "Nothing playing",
  artist: "Open music in Nora or connect a native media provider.",
  album: "",
  artwork: null,
  playbackState: "none",
  position: null,
  duration: null,
  volume: null,
  outputDevice: "This device",
};

function activeMediaElement(doc = globalThis.document) {
  const elements = [...(doc?.querySelectorAll?.("audio, video") ?? [])];
  return elements.find((element) => !element.paused) ?? elements[0] ?? null;
}

export class BrowserMediaProvider {
  constructor({ navigatorObject = globalThis.navigator, documentObject = globalThis.document } = {}) {
    this.navigator = navigatorObject;
    this.document = documentObject;
  }

  read() {
    const session = this.navigator?.mediaSession;
    const metadata = session?.metadata;
    const element = activeMediaElement(this.document);
    const artwork = metadata?.artwork?.length
      ? metadata.artwork[metadata.artwork.length - 1]?.src
      : null;
    const available = Boolean(metadata || element);
    return {
      ...EMPTY_MEDIA_STATE,
      available,
      title: metadata?.title || element?.getAttribute?.("data-title") || (available ? "Browser media" : EMPTY_MEDIA_STATE.title),
      artist: metadata?.artist || element?.getAttribute?.("data-artist") || EMPTY_MEDIA_STATE.artist,
      album: metadata?.album || "",
      artwork,
      playbackState: session?.playbackState || (element ? (element.paused ? "paused" : "playing") : "none"),
      position: Number.isFinite(element?.currentTime) ? element.currentTime : null,
      duration: Number.isFinite(element?.duration) ? element.duration : null,
      volume: Number.isFinite(element?.volume) ? element.volume : null,
    };
  }

  async play() {
    const element = activeMediaElement(this.document);
    if (!element?.play) return false;
    await element.play();
    return true;
  }

  pause() {
    const element = activeMediaElement(this.document);
    if (!element?.pause) return false;
    element.pause();
    return true;
  }

  previous() {
    return this.dispatch("nora:media-previous");
  }

  next() {
    return this.dispatch("nora:media-next");
  }

  seek(position) {
    const element = activeMediaElement(this.document);
    if (!element || !Number.isFinite(element.duration)) return false;
    element.currentTime = Math.max(0, Math.min(element.duration, position));
    return true;
  }

  setVolume(volume) {
    const element = activeMediaElement(this.document);
    if (!element) return false;
    element.volume = Math.max(0, Math.min(1, volume));
    return true;
  }

  dispatch(type) {
    if (!this.document?.dispatchEvent) return false;
    this.document.dispatchEvent(new CustomEvent(type));
    return true;
  }
}

export class AmbientSoundProvider {
  constructor() {
    this.context = null;
    this.nodes = [];
    this.gain = null;
    this.sound = "none";
  }

  async set(sound, volume = 0.35) {
    this.stop();
    this.sound = sound;
    if (sound === "none") return;
    const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContext) return;
    this.context = new AudioContext();
    await this.context.resume();
    this.gain = this.context.createGain();
    this.gain.gain.value = Math.max(0, Math.min(1, volume)) * 0.22;
    this.gain.connect(this.context.destination);

    if (["brown", "pink", "white", "rain", "ocean"].includes(sound)) {
      const buffer = this.context.createBuffer(1, this.context.sampleRate * 2, this.context.sampleRate);
      const data = buffer.getChannelData(0);
      let brown = 0;
      for (let index = 0; index < data.length; index++) {
        const white = Math.random() * 2 - 1;
        brown = (brown + 0.02 * white) / 1.02;
        data[index] = sound === "white" || sound === "rain"
          ? white * (sound === "rain" ? 0.55 : 0.35)
          : brown * 3.5;
      }
      const source = this.context.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      const filter = this.context.createBiquadFilter();
      filter.type = sound === "rain" ? "highpass" : "lowpass";
      filter.frequency.value = sound === "rain" ? 1200 : sound === "ocean" ? 420 : 720;
      source.connect(filter);
      filter.connect(this.gain);
      source.start();
      this.nodes.push(source, filter);
    } else {
      const base = sound === "cafe" ? 196 : 174;
      [1, 1.5, 2].forEach((ratio, index) => {
        const oscillator = this.context.createOscillator();
        const localGain = this.context.createGain();
        oscillator.type = sound === "forest" ? "sine" : "triangle";
        oscillator.frequency.value = base * ratio;
        localGain.gain.value = 0.018 / (index + 1);
        oscillator.connect(localGain);
        localGain.connect(this.gain);
        oscillator.start();
        this.nodes.push(oscillator, localGain);
      });
    }
  }

  setVolume(volume) {
    if (this.gain) this.gain.gain.value = Math.max(0, Math.min(1, volume)) * 0.22;
  }

  stop() {
    this.nodes.forEach((node) => {
      try { node.stop?.(); } catch {}
      try { node.disconnect?.(); } catch {}
    });
    this.nodes = [];
    try { this.context?.close?.(); } catch {}
    this.context = null;
    this.gain = null;
  }
}

export { EMPTY_MEDIA_STATE };
