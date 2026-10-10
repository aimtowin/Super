import { closeSync, fstatSync, openSync, readSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
export interface EmbeddedGenerationInfo { generator: 'stable-diffusion' | 'comfyui'; fields: Record<string,string>; }
const BUDGET = 128 * 1024;
/** Read bounded PNG text, skipping pixel chunks. Embedded markers are not proof of origin. */
export function readEmbeddedGeneration(filename: string): EmbeddedGenerationInfo | null {
  if (!filename.toLowerCase().endsWith('.png')) return null;
  const fd = openSync(filename,'r');
  try {
    const size = fstatSync(fd).size, signature = Buffer.alloc(8);
    if (readSync(fd,signature,0,8,0) !== 8 || signature.toString('hex') !== '89504e470d0a1a0a') return null;
    const fields: Record<string,string> = {}; let offset = 8, total = 0, readBytes = 0;
    for (let chunks = 0; offset + 12 <= size && chunks < 8192; chunks++) {
      const header = Buffer.alloc(8);
      if (readSync(fd,header,0,8,offset) !== 8) return null;
      const length = header.readUInt32BE(0), type = header.toString('ascii',4);
      if (offset + length + 12 > size) return null;
      if (['tEXt','zTXt','iTXt'].includes(type) && length <= BUDGET - readBytes) {
        readBytes += length;
        const data = Buffer.alloc(length); if (readSync(fd,data,0,length,offset+8) !== length) return null;
        const separator = data.indexOf(0);
        if (separator > 0 && separator <= 79) {
          const key = data.toString('latin1',0,separator).toLowerCase();
          if (['parameters','prompt','workflow'].includes(key)) {
            let content: Buffer | null = null;
            try {
              if (type === 'tEXt') content = data.subarray(separator+1);
              if (type === 'zTXt' && data[separator+1] === 0) content = inflateSync(data.subarray(separator+2),{maxOutputLength:BUDGET-total});
              if (type === 'iTXt' && data[separator+2] === 0) {
                const languageEnd = data.indexOf(0,separator+3), translatedEnd = languageEnd >= 0 ? data.indexOf(0,languageEnd+1) : -1;
                if (translatedEnd >= 0) content = data[separator+1] === 0 ? data.subarray(translatedEnd+1) :
                  data[separator+1] === 1 ? inflateSync(data.subarray(translatedEnd+1),{maxOutputLength:BUDGET-total}) : null;
              }
            } catch { /* malformed or compressed bomb: never abort ordinary image import */ }
            if (content && content.length <= BUDGET-total) { fields[key] = new TextDecoder('utf-8').decode(content); total += content.length; }
          }
        }
      }
      offset += length + 12;
      if (type === 'IEND') break;
    }
    if (/Steps:\s*\d+/iu.test(fields.parameters ?? '') && /(?:Sampler|Seed):/iu.test(fields.parameters ?? '')) return {generator:'stable-diffusion',fields};
    for (const name of ['prompt','workflow']) {
      try { const parsed: unknown = JSON.parse(fields[name] ?? '');
        if (parsed && typeof parsed === 'object' && /"(?:class_type|type)"\s*:\s*"(?:KSampler|KSamplerAdvanced|CheckpointLoaderSimple|CLIPTextEncode)"/u.test(fields[name]!))
          return {generator:'comfyui',fields};
      } catch { /* ordinary prompt text is not an AI marker */ }
    }
    return null;
  } finally { closeSync(fd); }
}
