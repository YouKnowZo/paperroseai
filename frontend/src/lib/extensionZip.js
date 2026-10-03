const encoder = new TextEncoder();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function u16(view, offset, value) { view.setUint16(offset, value, true); }
function u32(view, offset, value) { view.setUint32(offset, value, true); }

export function createExtensionZip(files) {
  if (!Array.isArray(files) || files.length < 1 || files.length > 32) throw new Error("Invalid extension ZIP contents");
  const locals = [];
  const centrals = [];
  let offset = 0;
  const fileDate = 0x5c21; // stable 2026-01-01 for reproducible archives
  for (const file of files) {
    if (!/^[\w.-]+$/.test(file.name) || file.name === "..") throw new Error("Invalid ZIP file name");
    const name = encoder.encode(file.name);
    const data = encoder.encode(file.content);
    if (data.length > 2_000_000) throw new Error("Extension file exceeds the safe size limit");
    const crc = crc32(data);
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    u32(lv, 0, 0x04034b50); u16(lv, 4, 20); u16(lv, 6, 0); u16(lv, 8, 0);
    u16(lv, 10, 0); u16(lv, 12, fileDate); u32(lv, 14, crc); u32(lv, 18, data.length); u32(lv, 22, data.length);
    u16(lv, 26, name.length); u16(lv, 28, 0); local.set(name, 30);
    locals.push(local, data);

    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    u32(cv, 0, 0x02014b50); u16(cv, 4, 20); u16(cv, 6, 20); u16(cv, 8, 0); u16(cv, 10, 0);
    u16(cv, 12, 0); u16(cv, 14, fileDate); u32(cv, 16, crc); u32(cv, 20, data.length); u32(cv, 24, data.length);
    u16(cv, 28, name.length); u16(cv, 30, 0); u16(cv, 32, 0); u16(cv, 34, 0); u16(cv, 36, 0);
    u32(cv, 38, 0); u32(cv, 42, offset); central.set(name, 46);
    centrals.push(central);
    offset += local.length + data.length;
  }
  const centralLength = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  u32(ev, 0, 0x06054b50); u16(ev, 4, 0); u16(ev, 6, 0); u16(ev, 8, files.length); u16(ev, 10, files.length);
  u32(ev, 12, centralLength); u32(ev, 16, offset); u16(ev, 20, 0);
  return new Blob([...locals, ...centrals, end], { type: "application/zip" });
}
