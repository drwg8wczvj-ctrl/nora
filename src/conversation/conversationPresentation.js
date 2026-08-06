export function progressiveTextFrames(text = "", maxFrames = 24) {
  if (!text) return [""];
  const tokens = text.match(/\S+\s*/g) ?? [text];
  const chunkSize = Math.max(1, Math.ceil(tokens.length / maxFrames));
  const frames = [];
  for (let index = chunkSize; index < tokens.length; index += chunkSize) {
    frames.push(tokens.slice(0, index).join(""));
  }
  frames.push(text);
  return frames;
}
