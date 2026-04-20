const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const SECRET = "OrionNexus2025CryptoKey!Secure";

// --- Crypto ---
function hexToBytes(hex) { return new Uint8Array(hex.match(/.{1,2}/g).map(b => parseInt(b, 16))); }
function initSBoxForKey(e) { const t = e.key; for (let s = 0; s < 256; s++) e.sbox[s] = s; let a = 0; for (let s = 0; s < 256; s++) { a = (a + e.sbox[s] + t[s % t.length]) % 256;[e.sbox[s], e.sbox[a]] = [e.sbox[a], e.sbox[s]]; } for (let s = 0; s < 256; s++) e.rsbox[e.sbox[s]] = s; }
function rotateRight(b, bits) { bits %= 8; return 255 & ((b >>> bits) | (b << (8 - bits))); }
function deriveKeys() { const keys = []; for (let i = 0; i < 5; i++) { const hash = crypto.createHash("sha256").update(`_orion_key_${i}_v2_${SECRET}`).digest("hex"); const e = { key: hexToBytes(hash), sbox: new Uint8Array(256), rsbox: new Uint8Array(256) }; initSBoxForKey(e); keys.push(e); } return keys; }
function decrypt(keys, ki, b64) { const a = keys[ki], s = a.key, r = a.rsbox; const raw = Buffer.from(b64, "base64"); const l = new Uint8Array(raw); const res = new Uint8Array(l.length); const o = s.length; for (let c = l.length - 1; c >= 0; c--) { let e = l[c]; e ^= c > 0 ? l[c - 1] : s[o - 1]; e = r[e]; const t = (((s[(c + 3) % o] + (255 & c)) & 255) % 7) + 1; e = rotateRight(e, t); e ^= s[c % o]; res[c] = e; } return new TextDecoder().decode(res); }

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  Accept: "application/json",
  Referer: "https://nx-toons.xyz/",
};

async function fetchDecrypted(endpoint, keys) {
  const res = await fetch(`https://nx-toons.xyz/api${endpoint}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${endpoint}`);
  const json = await res.json();
  return JSON.parse(decrypt(keys, json.k, json.d));
}

async function downloadFile(url, filepath) {
  const res = await fetch(url, { headers: { Referer: "https://nx-toons.xyz/" }, redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(filepath, buffer);
  return buffer.length;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log("Uso:");
    console.log("  node scripts/download-chapter.js <slug>                  - lista capitulos");
    console.log("  node scripts/download-chapter.js <slug> <chapterId>      - baixa capitulo");
    console.log("  node scripts/download-chapter.js <slug> all              - baixa tudo");
    console.log("");
    console.log("Exemplo:");
    console.log("  node scripts/download-chapter.js despertar-em-tempo-integral");
    console.log("  node scripts/download-chapter.js despertar-em-tempo-integral 316106");
    process.exit(0);
  }

  const keys = deriveKeys();
  const slug = args[0];
  const target = args[1];

  console.log(`\nBuscando manga: ${slug}...`);
  const manga = await fetchDecrypted(`/manga/${slug}`, keys);
  console.log(`${manga.title} (${manga.type}) - ${manga.chapters.length} capitulos\n`);

  const sorted = [...manga.chapters].sort((a, b) => parseFloat(a.number) - parseFloat(b.number));

  if (!target) {
    console.log("Capitulos disponíveis:");
    sorted.forEach((ch) => {
      console.log(`  Cap ${ch.number.padStart(5)} | ID: ${ch.id} | ${ch.views} views`);
    });
    console.log(`\nTotal: ${sorted.length} capitulos`);
    return;
  }

  const toDownload = target === "all"
    ? sorted
    : sorted.filter((ch) => ch.id === Number(target) || ch.number === target);

  if (toDownload.length === 0) {
    console.log("Capitulo não encontrado:", target);
    return;
  }

  const outDir = path.join("downloads", slug);

  for (const ch of toDownload) {
    const chapterDir = path.join(outDir, `cap-${ch.number.padStart(4, "0")}`);
    if (fs.existsSync(chapterDir) && fs.readdirSync(chapterDir).length > 0) {
      console.log(`[SKIP] Cap ${ch.number} - ja existe`);
      continue;
    }
    fs.mkdirSync(chapterDir, { recursive: true });

    console.log(`[CAP ${ch.number}] Buscando paginas...`);
    const data = await fetchDecrypted(`/read/${ch.id}`, keys);
    console.log(`[CAP ${ch.number}] ${data.totalPages} paginas`);

    for (let i = 0; i < data.totalPages; i++) {
      const pageUrl = `https://nx-toons.xyz/api/p/${data.pageToken}/${i}`;
      const filename = `${String(i + 1).padStart(3, "0")}.webp`;
      const filepath = path.join(chapterDir, filename);

      try {
        const size = await downloadFile(pageUrl, filepath);
        process.stdout.write(`  ${filename} (${(size / 1024).toFixed(0)}KB)`);
      } catch (err) {
        console.log(`  ${filename} ERRO: ${err.message}`);
      }
    }
    console.log(`\n[CAP ${ch.number}] Salvo em: ${chapterDir}`);
  }

  console.log("\nConcluido!");
}

main().catch(console.error);
