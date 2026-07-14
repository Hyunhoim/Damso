import argparse
import struct
import zlib
from pathlib import Path


FREESECT = 0xFFFFFFFF
ENDOFCHAIN = 0xFFFFFFFE
DIFSECT = 0xFFFFFFFC


def u16(data, off):
    return struct.unpack_from("<H", data, off)[0]


def u32(data, off):
    return struct.unpack_from("<I", data, off)[0]


def u64(data, off):
    return struct.unpack_from("<Q", data, off)[0]


class CFB:
    def __init__(self, path):
        self.path = Path(path)
        self.data = self.path.read_bytes()
        if self.data[:8] != bytes.fromhex("D0CF11E0A1B11AE1"):
            raise ValueError("Not an OLE compound file")
        self.sector_size = 1 << u16(self.data, 30)
        self.mini_sector_size = 1 << u16(self.data, 32)
        self.first_dir_sector = u32(self.data, 48)
        self.mini_cutoff = u32(self.data, 56)
        self.first_mini_fat_sector = u32(self.data, 60)
        self.num_mini_fat_sectors = u32(self.data, 64)
        self.first_difat_sector = u32(self.data, 68)
        self.num_difat_sectors = u32(self.data, 72)
        self.difat = self._read_difat()
        self.fat = self._read_fat()
        self.entries = self._read_directory()
        self.root = next((e for e in self.entries if e["type"] == 5), None)
        self.minifat = self._read_minifat()
        self.root_stream = self._read_regular_stream(self.root["start"], self.root["size"]) if self.root else b""
        self.paths = {}
        if self.entries:
            self._walk_children(0, "")

    def sector(self, sid):
        start = (sid + 1) * self.sector_size
        return self.data[start:start + self.sector_size]

    def _read_difat(self):
        entries = [u32(self.data, 76 + i * 4) for i in range(109)]
        next_sid = self.first_difat_sector
        for _ in range(self.num_difat_sectors):
            if next_sid in (FREESECT, ENDOFCHAIN):
                break
            sec = self.sector(next_sid)
            count = self.sector_size // 4 - 1
            entries.extend(u32(sec, i * 4) for i in range(count))
            next_sid = u32(sec, self.sector_size - 4)
        return [x for x in entries if x not in (FREESECT, ENDOFCHAIN, DIFSECT)]

    def _read_fat(self):
        fat = []
        for sid in self.difat:
            sec = self.sector(sid)
            fat.extend(u32(sec, i) for i in range(0, self.sector_size, 4))
        return fat

    def chain(self, start):
        out = []
        sid = start
        seen = set()
        while sid not in (FREESECT, ENDOFCHAIN) and sid < len(self.fat) and sid not in seen:
            seen.add(sid)
            out.append(sid)
            sid = self.fat[sid]
        return out

    def _read_regular_stream(self, start, size):
        if start in (FREESECT, ENDOFCHAIN):
            return b""
        raw = b"".join(self.sector(sid) for sid in self.chain(start))
        return raw[:size]

    def _read_minifat(self):
        if self.first_mini_fat_sector in (FREESECT, ENDOFCHAIN) or self.num_mini_fat_sectors == 0:
            return []
        raw = self._read_regular_stream(
            self.first_mini_fat_sector,
            self.num_mini_fat_sectors * self.sector_size,
        )
        return [u32(raw, i) for i in range(0, len(raw), 4)]

    def _read_mini_stream(self, start, size):
        out = []
        sid = start
        seen = set()
        while sid not in (FREESECT, ENDOFCHAIN) and sid < len(self.minifat) and sid not in seen:
            seen.add(sid)
            off = sid * self.mini_sector_size
            out.append(self.root_stream[off:off + self.mini_sector_size])
            sid = self.minifat[sid]
        return b"".join(out)[:size]

    def stream_bytes(self, entry):
        if entry["type"] != 2:
            return b""
        if entry["size"] < self.mini_cutoff:
            return self._read_mini_stream(entry["start"], entry["size"])
        return self._read_regular_stream(entry["start"], entry["size"])

    def _read_directory(self):
        raw = self._read_regular_stream(self.first_dir_sector, 1 << 30)
        entries = []
        for off in range(0, len(raw), 128):
            ent = raw[off:off + 128]
            if len(ent) < 128:
                break
            name_len = u16(ent, 64)
            if name_len < 2:
                name = ""
            else:
                name = ent[:name_len - 2].decode("utf-16le", errors="ignore")
            entries.append({
                "id": len(entries),
                "name": name,
                "type": ent[66],
                "left": u32(ent, 68),
                "right": u32(ent, 72),
                "child": u32(ent, 76),
                "start": u32(ent, 116),
                "size": u64(ent, 120),
            })
        return entries

    def _child_ids(self, child_id):
        if child_id == FREESECT or child_id >= len(self.entries):
            return []
        e = self.entries[child_id]
        return self._child_ids(e["left"]) + [child_id] + self._child_ids(e["right"])

    def _walk_children(self, entry_id, prefix):
        entry = self.entries[entry_id]
        for child_id in self._child_ids(entry["child"]):
            child = self.entries[child_id]
            path = f"{prefix}/{child['name']}" if prefix else child["name"]
            self.paths[path] = child
            if child["type"] in (1, 5):
                self._walk_children(child_id, path)


def hwp_text_from_records(blob):
    pos = 0
    pieces = []
    while pos + 4 <= len(blob):
        header = u32(blob, pos)
        pos += 4
        tag = header & 0x3FF
        size = (header >> 20) & 0xFFF
        if size == 0xFFF:
            if pos + 4 > len(blob):
                break
            size = u32(blob, pos)
            pos += 4
        payload = blob[pos:pos + size]
        pos += size
        if tag == 67:
            # HWPTAG_PARA_TEXT. Control codes are mixed in; decode leniently and filter later.
            txt = payload.decode("utf-16le", errors="ignore")
            pieces.append(txt)
    return "\n".join(pieces)


def rough_utf16_strings(blob, min_chars=3):
    txt = blob.decode("utf-16le", errors="ignore")
    out = []
    buf = []
    for ch in txt:
        if ch == "\n" or ch == "\r" or ch == "\t" or (" " <= ch <= "\uffff" and not (0x0000 <= ord(ch) < 0x0020)):
            if ch == "\x00":
                ch = " "
            buf.append(ch)
        else:
            s = "".join(buf).strip()
            if len(s) >= min_chars:
                out.append(s)
            buf = []
    s = "".join(buf).strip()
    if len(s) >= min_chars:
        out.append(s)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("hwp")
    ap.add_argument("--list", action="store_true")
    args = ap.parse_args()

    cfb = CFB(args.hwp)
    print(f"sector_size={cfb.sector_size} mini_sector_size={cfb.mini_sector_size} streams={len(cfb.paths)}")
    if args.list:
        for path, entry in sorted(cfb.paths.items()):
            typ = {1: "storage", 2: "stream", 5: "root"}.get(entry["type"], str(entry["type"]))
            print(f"{typ:7} {entry['size']:8} {path}")

    header = cfb.stream_bytes(cfb.paths.get("FileHeader", {})) if "FileHeader" in cfb.paths else b""
    compressed = bool(header and len(header) > 36 and (u32(header, 36) & 1))
    print(f"compressed={compressed}")

    texts = []
    for path, entry in sorted(cfb.paths.items()):
        if not (path.startswith("BodyText/Section") or path.startswith("ViewText/Section")):
            continue
        data = cfb.stream_bytes(entry)
        if compressed:
            try:
                data = zlib.decompress(data, -15)
            except zlib.error:
                try:
                    data = zlib.decompress(data)
                except zlib.error as exc:
                    print(f"[warn] decompress failed for {path}: {exc}")
        text = hwp_text_from_records(data)
        if not text.strip():
            text = "\n".join(rough_utf16_strings(data))
        texts.append((path, text))

    for path, text in texts:
        print(f"\n--- {path} ---")
        cleaned = text.replace("\x00", "")
        print(cleaned)


if __name__ == "__main__":
    main()
