import { BrowserMediaProvider } from "./mediaProvider";

test("gracefully reports unavailable browser media", () => {
  const provider = new BrowserMediaProvider({
    navigatorObject: {},
    documentObject: { querySelectorAll: () => [] },
  });
  expect(provider.read()).toMatchObject({ available: false, title: "Nothing playing" });
});

test("reads media session metadata and playback state", () => {
  const provider = new BrowserMediaProvider({
    navigatorObject: {
      mediaSession: {
        metadata: { title: "Flow", artist: "Nora", album: "Focus", artwork: [{ src: "cover.png" }] },
        playbackState: "playing",
      },
    },
    documentObject: { querySelectorAll: () => [] },
  });
  expect(provider.read()).toMatchObject({
    available: true,
    title: "Flow",
    artist: "Nora",
    artwork: "cover.png",
    playbackState: "playing",
  });
});
