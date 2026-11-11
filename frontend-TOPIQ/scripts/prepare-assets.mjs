import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const root = new URL("../", import.meta.url);
const source = new URL("node_modules/garu-ko/", root);
const output = new URL("public/garu-0.13.0/", root);
const notices = new URL("public/open-source/", root);
const metadata = JSON.parse(await readFile(new URL("package.json", source), "utf8"));
if (metadata.version !== "0.13.0") throw new Error("Update the Garu asset version and checksums before upgrading.");
for (const [file, expected] of Object.entries({
  "models/base.gmdl": "bb3f0ddaa9878bdb5ffba28e5634266a6197ab2f588deb8c625be38202d1ee4d",
  "pkg/garu_wasm_bg.wasm": "b5a7e8f935bc588a36a396baea797ff5c5abac1a9b2b09a598d05a51bbb8962b",
})) {
  const digest = createHash("sha256").update(await readFile(new URL(file, source))).digest("hex");
  if (digest !== expected) throw new Error(`Garu asset checksum mismatch: ${file}`);
}

async function copy(from, to) {
  await mkdir(new URL(".", to), { recursive: true });
  await copyFile(from, to);
}
async function filesIn(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      for (const file of await filesIn(new URL(`${entry.name}/`, directory))) files.push(`${entry.name}/${file}`);
    } else files.push(entry.name);
  }
  return files.sort();
}
for (const file of ["dist/browser.js", "dist/core.js", "dist/normalize.js", "models/base.gmdl",
  ...(await filesIn(new URL("pkg/", source))).filter(file => /\.(js|wasm)$/.test(file)).map(file => `pkg/${file}`)]) {
  await copy(new URL(file, source), new URL(file, output));
}

const entries = [];
async function licenseEntry(name, sourceUrl, licenseFiles, license) {
  const directory = new URL(`node_modules/${name}/`, root);
  const pkg = JSON.parse(await readFile(new URL("package.json", directory), "utf8"));
  const documents = [];
  for (const file of licenseFiles) {
    await copy(new URL(file, directory), new URL(`${name}/${file}`, notices));
    documents.push({ name: file, href: `/open-source/${name}/${file}` });
  }
  entries.push({ name, version: pkg.version, license: license ?? pkg.license, sourceUrl, documents });
}
await licenseEntry("garu-ko", "https://github.com/ongjin/garu", ["LICENSE", "NOTICE", "models/NOTICE.md",
  "models/bulk-provenance.json", "models/sentence-provenance.json",
  ...(await filesIn(new URL("models/licenses/", source))).map(file => `models/licenses/${file}`)],
  "Apache-2.0 · dictionary data: Apache-2.0 / CC BY-SA 2.0 KR");
for (const [name, url, file] of [
  ["next", "https://github.com/vercel/next.js", "license.md"],
  ["react", "https://github.com/facebook/react", "LICENSE"],
  ["react-dom", "https://github.com/facebook/react", "LICENSE"],
  ["lucide-react", "https://github.com/lucide-icons/lucide", "LICENSE"],
  ["tailwindcss", "https://github.com/tailwindlabs/tailwindcss", "LICENSE"],
  ["scheduler", "https://github.com/facebook/react", "LICENSE"],
  ["styled-jsx", "https://github.com/vercel/styled-jsx", "license.md"],
  ["@swc/helpers", "https://github.com/swc-project/swc", "LICENSE"],
  ["postcss", "https://github.com/postcss/postcss", "LICENSE"],
]) await licenseEntry(name, url, [file], name === "lucide-react" ? "ISC · MIT (Feather-derived icons)" : undefined);
await copy(new URL("public/fonts/Pretendard-LICENSE.txt", root), new URL("pretendard/LICENSE.txt", notices));
entries.push({ name: "Pretendard", version: "", license: "SIL Open Font License 1.1",
  sourceUrl: "https://github.com/orioncactus/pretendard",
  documents: [{ name: "LICENSE.txt", href: "/open-source/pretendard/LICENSE.txt" }] });

// Preserve notices shipped inside Next.js, including its bundled React/runtime dependencies.
const compiled = new URL("node_modules/next/dist/compiled/", root);
const bundled = [];
for (const file of (await filesIn(compiled)).filter(file => /(?:^|\/)(?:license|notice|copying)(?:\.[^/]*)?$/i.test(file))) {
  await copy(new URL(file, compiled), new URL(`next/compiled/${file}`, notices));
  bundled.push({ name: file, href: `/open-source/next/compiled/${file}` });
}
await mkdir(notices, { recursive: true });
await writeFile(new URL("licenses.json", notices), JSON.stringify({ entries, bundled }, null, 2) + "\n");
console.log("Garu browser assets and open-source notices prepared from installed packages; no database access.");
