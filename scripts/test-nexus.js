const crypto = require("crypto");

const SECRET = "OrionNexus2025CryptoKey!Secure";

// --- OrionCrypto reimplementation ---

function hexToBytes(hex) {
  return new Uint8Array(hex.match(/.{1,2}/g).map((b) => parseInt(b, 16)));
}

function initSBoxForKey(entry) {
  const key = entry.key;
  for (let i = 0; i < 256; i++) entry.sbox[i] = i;
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + entry.sbox[i] + key[i % key.length]) % 256;
    [entry.sbox[i], entry.sbox[j]] = [entry.sbox[j], entry.sbox[i]];
  }
  for (let i = 0; i < 256; i++) entry.rsbox[entry.sbox[i]] = i;
}

function rotateRight(byte, bits) {
  bits = bits % 8;
  return 255 & ((byte >>> bits) | (byte << (8 - bits)));
}

function deriveKeys(secret) {
  const keys = [];
  for (let i = 0; i < 5; i++) {
    const input = `_orion_key_${i}_v2_${secret}`;
    const hash = crypto.createHash("sha256").update(input).digest("hex");
    const entry = {
      key: hexToBytes(hash),
      sbox: new Uint8Array(256),
      rsbox: new Uint8Array(256),
    };
    initSBoxForKey(entry);
    keys.push(entry);
  }
  return keys;
}

function decrypt(keys, keyIndex, base64Data) {
  const a = keys[keyIndex];
  const s = a.key;
  const r = a.rsbox;

  // base64 decode
  const raw = Buffer.from(base64Data, "base64");
  const l = new Uint8Array(raw);
  const result = new Uint8Array(l.length);
  const o = s.length;

  // decrypt in reverse
  for (let c = l.length - 1; c >= 0; c--) {
    let e = l[c];
    e ^= c > 0 ? l[c - 1] : s[o - 1];
    e = r[e];
    const t = (((s[(c + 3) % o] + (255 & c)) & 255) % 7) + 1;
    e = rotateRight(e, t);
    e ^= s[c % o];
    result[c] = e;
  }

  return new TextDecoder().decode(result);
}

// --- Main ---

async function main() {
  console.log("=== Derivando chaves ===\n");
  const keys = deriveKeys(SECRET);
  console.log("5 chaves derivadas OK\n");

  console.log("=== Buscando API ===\n");
  const res = await fetch(
    "https://nx-toons.xyz/api/mangas?limit=5&includeNsfw=true&sortBy=views",
    {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        Accept: "application/json",
        Referer: "https://nx-toons.xyz/",
      },
    },
  );

  const json = await res.json();
  console.log("k (key index):", json.k);
  console.log("v (version):", json.v);
  console.log("d length:", json.d?.length);
  console.log();

  console.log("=== Decriptando ===\n");
  const decrypted = decrypt(keys, json.k, json.d);

  // Try to parse as JSON
  try {
    const data = JSON.parse(decrypted);
    console.log("SUCESSO! JSON parseado.");
    console.log(JSON.stringify(data, null, 2).substring(0, 3000));
  } catch {
    console.log("Resultado (primeiros 500 chars):");
    console.log(decrypted.substring(0, 500));
  }
}

main().catch(console.error);
