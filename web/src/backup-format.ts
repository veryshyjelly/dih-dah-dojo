export const MAX_BACKUP = 32 * 1024 * 1024;
export type BackupFrame = { type: number; input: 'keyboard' | 'touch'; bytes: Uint8Array };
export type ParsedBackup = {
  kind: 'account' | 'language';
  legacy: boolean;
  frames: BackupFrame[];
  digest: string;
};
export async function digest(bytes: Uint8Array) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes)))]
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('');
}
export async function parseBackup(bytes: Uint8Array): Promise<ParsedBackup> {
  if (bytes.length < 8 || bytes.length > MAX_BACKUP)
    throw new Error('Choose a Dojo backup under 32 MiB.');
  const magic = new TextDecoder().decode(bytes.subarray(0, 8)),
    language = magic === 'CWLANG01',
    legacy = magic === 'CWDOJOW1';
  if (!language && !legacy && magic !== 'CWDOJOW2')
    throw new Error('This is not a supported Dojo backup.');
  if (!language) {
    if (
      bytes.length < 40 ||
      (await digest(bytes.subarray(40))) !==
        [...bytes.subarray(8, 40)].map((n) => n.toString(16).padStart(2, '0')).join('')
    )
      throw new Error('The backup checksum does not match. Choose an undamaged export.');
  }
  const frames: BackupFrame[] = [];
  let at = language ? 8 : 40;
  while (at < bytes.length) {
    const size = language ? 4 : 6;
    if (bytes.length - at < size) throw new Error('The backup is truncated.');
    const type = language ? 2 : bytes[at],
      input = language ? 0 : bytes[at + 1],
      length = new DataView(bytes.buffer, bytes.byteOffset + at, size).getUint32(
        language ? 0 : 2,
        true,
      );
    at += size;
    if (
      !length ||
      length > (type === 3 ? 16 : 8) * 1024 * 1024 + 256 ||
      length > bytes.length - at ||
      input > 1 ||
      ![0, 2, legacy ? 1 : 3].includes(type)
    )
      throw new Error('Invalid or unsupported backup frame.');
    frames.push({ type, input: input ? 'touch' : 'keyboard', bytes: bytes.slice(at, at + length) });
    at += length;
    if (frames.length > 10000) throw new Error('This backup has too many records (limit 10,000).');
  }
  return { kind: language ? 'language' : 'account', legacy, frames, digest: await digest(bytes) };
}
export function richBlock(bytes: Uint8Array) {
  if (bytes.length < 16 || bytes[0] > 1) throw new Error('Invalid saved block metadata.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length),
    created = view.getFloat64(1, true),
    n = view.getUint16(9, true);
  let at = 11;
  if (!Number.isFinite(created) || created < 0 || !n || n > 100 || at + n + 4 > bytes.length)
    throw new Error('Invalid saved block metadata.');
  const id = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(at, at + n));
  at += n;
  const length = view.getUint32(at, true);
  at += 4;
  if (
    !/^[a-zA-Z0-9-]{8,100}$/.test(id) ||
    !length ||
    length > 8 * 1024 * 1024 ||
    at + length >= bytes.length
  )
    throw new Error('Invalid saved block metadata.');
  return {
    id,
    created,
    applied: bytes[0] === 1,
    packet: bytes.slice(at, at + length),
    record: bytes.slice(at + length),
  };
}
