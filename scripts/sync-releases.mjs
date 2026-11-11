import fs from "node:fs/promises";

const repo = "limitlessClient/limitless";
const headers = { "User-Agent": "limitless-releases", Accept: "application/vnd.github+json" };
if (process.env.GH_TOKEN) headers.Authorization = `Bearer ${process.env.GH_TOKEN}`;

const response = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=100`, { headers });
if (!response.ok) throw new Error(`GitHub releases returned ${response.status}`);
const releases = (await response.json()).filter(r => !r.draft && !r.prerelease);
if (!releases.length) throw new Error("Publish a release with manifest.json first");

const latestResponse = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers });
if (!latestResponse.ok) throw new Error(`Latest release returned ${latestResponse.status}`);
const latest = await latestResponse.json();
const asset = latest.assets.find(a => a.name === "manifest.json");
if (!asset) throw new Error(`Release ${latest.tag_name} has no manifest.json`);
const manifestResponse = await fetch(asset.browser_download_url);
if (!manifestResponse.ok) throw new Error(`Manifest download returned ${manifestResponse.status}`);
const manifest = await manifestResponse.json();
if (manifest.tag !== latest.tag_name) throw new Error("The manifest tag differs from its release");
for (const file of [manifest.client, manifest.launcher, ...(manifest.mods || [])]) {
  const releaseAsset = latest.assets.find(a => a.name === file.file);
  if (!releaseAsset || releaseAsset.size !== file.size) throw new Error(`Missing or inconsistent asset ${file.file}`);
}
const history = JSON.parse(await fs.readFile("release-history.json", "utf8"));
const entries = new Map(history.map(r => [r.tag_name, r]));
for (const release of releases) {
  entries.set(release.tag_name, {
    name: release.name, tag_name: release.tag_name,
    published_at: release.published_at, body: release.body || "",
  });
}
const logs = [...entries.values()].sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at));
await fs.writeFile("manifest.json", JSON.stringify(manifest, null, 2) + "\n");
await fs.writeFile("devlog.json", JSON.stringify(logs, null, 2) + "\n");
await fs.writeFile("CHANGELOG.md", "# Limitless Client\n\n" + logs.map(r =>
  `## ${r.name || r.tag_name}\n\n${r.body || ""}\n`
).join("\n"));
console.log(`Published metadata for ${manifest.tag}, ${logs.length} changelog entries`);
