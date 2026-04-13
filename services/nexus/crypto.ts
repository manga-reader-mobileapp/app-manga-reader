import * as ExpoCrypto from 'expo-crypto';

const SECRET = 'OrionNexus2025CryptoKey!Secure';

interface KeyEntry {
  key: Uint8Array;
  sbox: Uint8Array;
  rsbox: Uint8Array;
}

let _keys: KeyEntry[] = [];
let _initialized = false;
let _initPromise: Promise<void> | null = null;

function hexToBytes(hex: string): Uint8Array {
  return new Uint8Array(hex.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)));
}

function initSBoxForKey(entry: KeyEntry): void {
  const key = entry.key;
  for (let i = 0; i < 256; i++) entry.sbox[i] = i;
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + entry.sbox[i] + key[i % key.length]) % 256;
    [entry.sbox[i], entry.sbox[j]] = [entry.sbox[j], entry.sbox[i]];
  }
  for (let i = 0; i < 256; i++) entry.rsbox[entry.sbox[i]] = i;
}

function rotateRight(byte: number, bits: number): number {
  bits = bits % 8;
  return 255 & ((byte >>> bits) | (byte << (8 - bits)));
}

export function initCrypto(): Promise<void> {
  if (_initialized) return Promise.resolve();
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    console.log('[CRYPTO] Initializing...');
    const keys: KeyEntry[] = [];
    for (let i = 0; i < 5; i++) {
      const input = `_orion_key_${i}_v2_${SECRET}`;
      const hash = await ExpoCrypto.digestStringAsync(
        ExpoCrypto.CryptoDigestAlgorithm.SHA256,
        input,
      );
      console.log('[CRYPTO] Key', i, 'hash:', hash.substring(0, 16) + '...');
      const entry: KeyEntry = {
        key: hexToBytes(hash),
        sbox: new Uint8Array(256),
        rsbox: new Uint8Array(256),
      };
      initSBoxForKey(entry);
      keys.push(entry);
    }
    _keys = keys;
    _initialized = true;
    console.log('[CRYPTO] Initialized OK, keys count:', _keys.length);
  })();

  return _initPromise;
}

export function decrypt(keyIndex: number, base64Data: string): string {
  console.log('[CRYPTO] decrypt called, keyIndex:', keyIndex, 'data length:', base64Data?.length);
  if (!_initialized) throw new Error('Crypto not initialized');

  const entry = _keys[keyIndex];
  const key = entry.key;
  const rsbox = entry.rsbox;

  // base64 decode
  const raw = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
  const result = new Uint8Array(raw.length);
  const keyLen = key.length;

  for (let i = raw.length - 1; i >= 0; i--) {
    let byte = raw[i];
    byte ^= i > 0 ? raw[i - 1] : key[keyLen - 1];
    byte = rsbox[byte];
    const shift = (((key[(i + 3) % keyLen] + (255 & i)) & 255) % 7) + 1;
    byte = rotateRight(byte, shift);
    byte ^= key[i % keyLen];
    result[i] = byte;
  }

  return new TextDecoder().decode(result);
}
