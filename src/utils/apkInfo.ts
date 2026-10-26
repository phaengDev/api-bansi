import fs from "fs";
import zlib from "zlib";

/** ຂໍ້ມູນຈາກ AndroidManifest.xml ຂອງໄຟລ໌ APK — versionCode = ເລກ build (flutter: version 1.0.1+2 → 2) */
export type ApkInfo = { packageName: string; versionCode: number; versionName: string | null };

// zip (APK ເປັນ zip)
const ZIP_END = 0x06054b50;
const ZIP_CENTRAL = 0x02014b50;
const ZIP_LOCAL = 0x04034b50;
// binary XML ຂອງ Android (AXML)
const RES_STRING_POOL = 0x0001;
const RES_XML_RESOURCE_MAP = 0x0180;
const RES_XML_START_ELEMENT = 0x0102;
const UTF8_POOL = 0x100;
const TYPE_STRING = 0x03;
/** resource id ຂອງ android:versionCode / android:versionName (ຊື່ຂອງ attribute ອາດຖືກຕັດອອກ ແຕ່ id ຢູ່ສະເໝີ) */
const ATTR_VERSION_CODE = 0x0101021b;
const ATTR_VERSION_NAME = 0x0101021c;

/** ໄຟລ໌ໜຶ່ງໃນ zip — null = ບໍ່ພົບ / ບີບອັດແບບທີ່ບໍ່ຮູ້ຈັກ */
const readZipEntry = (zip: Buffer, name: string): Buffer | null => {
  // ທ້າຍສາລະບານ (end of central directory) ຢູ່ທ້າຍໄຟລ໌ — ຫຼັງມັນມີ comment ໄດ້ບໍ່ເກີນ 64KB
  let end = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 0xffff); i--) {
    if (zip.readUInt32LE(i) === ZIP_END) {
      end = i;
      break;
    }
  }
  if (end < 0) return null;
  const count = zip.readUInt16LE(end + 10);
  let p = zip.readUInt32LE(end + 16);
  for (let n = 0; n < count && p + 46 <= zip.length && zip.readUInt32LE(p) === ZIP_CENTRAL; n++) {
    const nameLength = zip.readUInt16LE(p + 28);
    if (zip.toString("utf8", p + 46, p + 46 + nameLength) === name) {
      const method = zip.readUInt16LE(p + 10);
      const size = zip.readUInt32LE(p + 20);
      const local = zip.readUInt32LE(p + 42);
      if (zip.readUInt32LE(local) !== ZIP_LOCAL) return null;
      const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
      const data = zip.subarray(start, start + size);
      return method === 0 ? data : method === 8 ? zlib.inflateRawSync(data) : null;
    }
    p += 46 + nameLength + zip.readUInt16LE(p + 30) + zip.readUInt16LE(p + 32);
  }
  return null;
};

/** ຂໍ້ຄວາມທັງໝົດໃນ string pool (UTF-8 ຫຼື UTF-16) */
const readStringPool = (xml: Buffer, at: number) => {
  const headerSize = xml.readUInt16LE(at + 2);
  const count = xml.readUInt32LE(at + 8);
  const utf8 = (xml.readUInt32LE(at + 16) & UTF8_POOL) !== 0;
  const stringsStart = at + xml.readUInt32LE(at + 20);
  const strings: string[] = [];
  for (let i = 0; i < count; i++) {
    let p = stringsStart + xml.readUInt32LE(at + headerSize + i * 4);
    if (utf8) {
      // ຄວາມຍາວແບບ UTF-16 (ຂ້າມ) ແລ້ວແບບ UTF-8 — ຕົວລະ 1 ຫຼື 2 byte
      p += xml[p] & 0x80 ? 2 : 1;
      let length = xml[p];
      if (length & 0x80) {
        length = ((length & 0x7f) << 8) | xml[p + 1];
        p += 2;
      } else p += 1;
      strings.push(xml.toString("utf8", p, p + length));
    } else {
      let length = xml.readUInt16LE(p);
      if (length & 0x8000) {
        length = ((length & 0x7fff) << 16) | xml.readUInt16LE(p + 2);
        p += 4;
      } else p += 2;
      strings.push(xml.toString("utf16le", p, p + length * 2));
    }
  }
  return strings;
};

/** attribute ຂອງ <manifest> (element ທຳອິດ) */
const parseManifest = (xml: Buffer): ApkInfo | null => {
  let strings: string[] = [];
  const ids: number[] = [];
  for (let p = xml.readUInt16LE(2); p + 8 <= xml.length; ) {
    const type = xml.readUInt16LE(p);
    const headerSize = xml.readUInt16LE(p + 2);
    const size = xml.readUInt32LE(p + 4);
    if (type === RES_STRING_POOL) strings = readStringPool(xml, p);
    else if (type === RES_XML_RESOURCE_MAP) for (let i = p + headerSize; i < p + size; i += 4) ids.push(xml.readUInt32LE(i));
    else if (type === RES_XML_START_ELEMENT) {
      const ext = p + headerSize;
      const attributeStart = xml.readUInt16LE(ext + 8);
      const attributeSize = xml.readUInt16LE(ext + 10);
      const attributeCount = xml.readUInt16LE(ext + 12);
      let packageName = "";
      let versionCode = 0;
      let versionName: string | null = null;
      for (let i = 0; i < attributeCount; i++) {
        const a = ext + attributeStart + i * attributeSize;
        const nameIndex = xml.readUInt32LE(a + 4);
        const raw = xml.readInt32LE(a + 8);
        const dataType = xml[a + 15];
        const data = xml.readUInt32LE(a + 16);
        const text = raw >= 0 ? strings[raw] : dataType === TYPE_STRING ? strings[data] : undefined;
        if (ids[nameIndex] === ATTR_VERSION_CODE || strings[nameIndex] === "versionCode") versionCode = data;
        else if (ids[nameIndex] === ATTR_VERSION_NAME || strings[nameIndex] === "versionName") versionName = text ?? null;
        else if (strings[nameIndex] === "package") packageName = text ?? "";
      }
      return packageName && versionCode > 0 ? { packageName, versionCode, versionName } : null;
    }
    if (size <= 0) break;
    p += size;
  }
  return null;
};

/** ອ່ານ package / versionCode / versionName ຈາກໄຟລ໌ APK — ບໍ່ແມ່ນ APK ຫຼື ອ່ານບໍ່ໄດ້ = null */
export const readApkInfo = async (filePath: string): Promise<ApkInfo | null> => {
  try {
    const manifest = readZipEntry(await fs.promises.readFile(filePath), "AndroidManifest.xml");
    return manifest ? parseManifest(manifest) : null;
  } catch {
    return null;
  }
};
