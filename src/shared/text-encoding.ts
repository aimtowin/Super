/** Bounded preview decoding. Legacy fallback is not proof of encoding. */
export type TextEncoding = 'utf-8' | 'utf-16le' | 'utf-16be' | 'gb18030';

export function decodeTextBytes(bytes: Uint8Array, truncated = false): {
  encoding: TextEncoding; text: string; binary: boolean;
} {
  const starts = (...prefix: number[]) => prefix.every((byte, index) => bytes[index] === byte);
  let encoding: TextEncoding = 'utf-8';
  let body = bytes;
  let explicit = false;
  if (starts(0xef, 0xbb, 0xbf)) { body = bytes.subarray(3); explicit = true; }
  else if (starts(0xff, 0xfe) && !starts(0xff, 0xfe, 0, 0)) {
    encoding = 'utf-16le'; body = bytes.subarray(2); explicit = true;
  } else if (starts(0xfe, 0xff)) {
    encoding = 'utf-16be'; body = bytes.subarray(2); explicit = true;
  } else if (bytes.length >= 8) {
    const pairs = Math.floor(Math.min(bytes.length, 4096) / 2);
    let even = 0; let odd = 0;
    for (let index = 0; index < pairs * 2; index += 2) {
      if (bytes[index] === 0) even++;
      if (bytes[index + 1] === 0) odd++;
    }
    if (odd / pairs >= 0.3 && even / pairs <= 0.1) encoding = 'utf-16le';
    else if (even / pairs >= 0.3 && odd / pairs <= 0.1) encoding = 'utf-16be';
  }
  const binary = { encoding, text: '', binary: true };
  if (encoding === 'utf-8' && bytes.includes(0)) return binary;
  const decode = (label: TextEncoding) => new TextDecoder(label, { fatal: true })
    .decode(body, { stream: truncated });
  let text: string;
  try { text = decode(encoding); }
  catch {
    if (explicit || encoding !== 'utf-8') return binary;
    encoding = 'gb18030';
    try { text = decode(encoding); } catch { return { ...binary, encoding }; }
  }
  // UTF-16 has structural NUL bytes; inspect decoded controls instead.
  // Reject binary controls, while allowing tab, CR and LF.
  if (Array.from(text).some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 && code !== 9 && code !== 10 && code !== 13;
  })) return { ...binary, encoding };
  return { encoding, text, binary: false };
}
