import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

const assetsDirectory = new URL("../dist/assets/", import.meta.url);
const limits = {
  mainJavaScript: 1_150_000,
  mainCss: 320_000,
};

const files = await readdir(assetsDirectory);
const sizes = await Promise.all(files.map(async (file) => ({
  file,
  bytes: (await stat(join(assetsDirectory.pathname, file))).size,
})));

const applicationJavaScript = sizes
  .filter(({ file }) => file.startsWith("index-") && file.endsWith(".js"))
  .sort((a, b) => b.bytes - a.bytes)[0];
const applicationCss = sizes
  .filter(({ file }) => file.startsWith("index-") && file.endsWith(".css"))
  .sort((a, b) => b.bytes - a.bytes)[0];

const failures = [];
if (!applicationJavaScript) failures.push("main JavaScript bundle was not found");
else if (applicationJavaScript.bytes > limits.mainJavaScript) {
  failures.push(`${applicationJavaScript.file} is ${applicationJavaScript.bytes} bytes (limit ${limits.mainJavaScript})`);
}
if (!applicationCss) failures.push("main CSS bundle was not found");
else if (applicationCss.bytes > limits.mainCss) {
  failures.push(`${applicationCss.file} is ${applicationCss.bytes} bytes (limit ${limits.mainCss})`);
}

if (failures.length) {
  console.error(`Build budget failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

console.log(
  `Build budget passed: JS ${applicationJavaScript.bytes}/${limits.mainJavaScript}, ` +
  `CSS ${applicationCss.bytes}/${limits.mainCss} bytes`,
);
