import { describe, it, expect, afterEach } from "vitest";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  copyFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile),
  dirs: string[] = [];
afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "pfc-pwa-build-"));
  dirs.push(dir);
  await Promise.all(
    [".next/static/chunks", "public/icons", "scripts"].map((p) =>
      mkdir(join(dir, p), { recursive: true }),
    ),
  );
  await writeFile(join(dir, ".next/BUILD_ID"), "build-a");
  await writeFile(
    join(dir, ".next/static/chunks/app.js"),
    'console.log("app");',
  );
  await writeFile(join(dir, ".next/static/chunks/app.css"), "body{}");
  await writeFile(join(dir, ".next/static/chunks/app.js.map"), "{}");
  for (const p of [
    "offline.html",
    "icons/icon-192.png",
    "icons/icon-512.png",
    "icons/apple-touch-icon.png",
    "icons/maskable-512.png",
  ])
    await writeFile(join(dir, "public", p), "fixture");
  await copyFile("scripts/sw-template.js", join(dir, "scripts/sw-template.js"));
  return dir;
}
async function generate(dir: string) {
  await exec(process.execPath, [resolve("scripts/build-pwa.mjs")], {
    cwd: dir,
  });
  const source = await readFile(join(dir, "public/sw.js"), "utf8");
  const match = source.match(/const BUILD = (\{[^\n]+\});/);
  expect(match).not.toBeNull();
  return JSON.parse(match![1]) as {
    version: string;
    urls: string[];
    pages: string[];
  };
}
describe("PWA build portability", () => {
  it("generates the worker with no .next/server/app HTML directory", async () => {
    const dir = await fixture();
    const config = await generate(dir);
    expect(config.pages).toEqual(["/", "/foods", "/history", "/settings"]);
    expect(config.urls).toContain("/_next/static/chunks/app.js");
    expect(config.urls).toContain("/_next/static/chunks/app.css");
    expect(config.urls.some((url) => url.endsWith(".map"))).toBe(false);
    expect(config.urls.some((url) => url.includes("/api/"))).toBe(false);
  });
  it("supports Vercel-style relocated HTML and invalidates cache for a new build", async () => {
    const dir = await fixture();
    await mkdir(join(dir, ".next/server/route-cache/APP_PAGE/hash/$"), {
      recursive: true,
    });
    await writeFile(
      join(dir, ".next/server/route-cache/APP_PAGE/hash/$/index.html"),
      "<html/>",
    );
    const a = await generate(dir);
    await writeFile(join(dir, ".next/BUILD_ID"), "build-b");
    const b = await generate(dir);
    expect(b.version).not.toBe(a.version);
  });
  it("invalidates cache when worker logic changes and fails on missing required assets", async () => {
    const dir = await fixture();
    const a = await generate(dir);
    const template = join(dir, "scripts/sw-template.js");
    await writeFile(
      template,
      (await readFile(template, "utf8")) + "\n// new behavior",
    );
    expect((await generate(dir)).version).not.toBe(a.version);
    await rm(join(dir, "public/icons/icon-512.png"));
    await expect(generate(dir)).rejects.toThrow();
  });
});
