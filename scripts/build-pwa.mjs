import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((e) =>
        e.isDirectory() ? files(`${dir}/${e.name}`) : `${dir}/${e.name}`,
      ),
    )
  ).flat();
}
const assets = (await files(".next/static"))
  .filter((file) => !file.endsWith(".map"))
  .sort();
const pages = ["/", "/foods", "/history", "/settings"];
const publicFiles = [
  "/manifest.webmanifest",
  "/offline.html",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
  "/icons/maskable-512.png",
];
const digest = createHash("sha256");
digest.update(await readFile(".next/BUILD_ID"));
for (const file of assets) digest.update(await readFile(file));
for (const file of ["index", "foods", "history", "settings"])
  digest.update(await readFile(`.next/server/app/${file}.html`));
for (const file of publicFiles.filter(
  (file) => file !== "/manifest.webmanifest",
))
  digest.update(await readFile(`public${file}`));
const config = {
  version: digest.digest("hex").slice(0, 16),
  pages,
  urls: [
    ...pages,
    ...publicFiles,
    ...assets.map((file) => file.replace(".next/static/", "/_next/static/")),
  ],
};
const template = await readFile("scripts/sw-template.js", "utf8");
await writeFile(
  "public/sw.js",
  template.replace('"__PFC_PRECACHE__"', JSON.stringify(config)),
);
console.log(
  `PWA: ${config.urls.length} public shell resources, version ${config.version}`,
);
