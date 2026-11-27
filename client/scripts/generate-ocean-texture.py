"""Generate the static 2D sea texture with the Python standard library."""
from pathlib import Path
import math
import struct
import zlib

size = 256
rows = []
for y in range(size):
    raw = bytearray()
    for x in range(size):
        u, v = x / size, y / size
        swell = math.sin(u * 13 + math.sin(v * 11) * 1.3) + math.sin(v * 19 - u * 8) * .5
        ridge = math.sin(u * 110 + v * 54 + math.sin(v * 30) * 3 + math.sin(u * 23) * 2)
        fine = math.sin(u * 270 - v * 90 + math.sin(v * 63) * 2)
        glint = max(0, ridge) ** 16 * (.3 + .7 * (math.sin(u * 8 - v * 9) * .5 + .5))
        light = max(0, 1 - ((u - .68) ** 2 + (v - .25) ** 2) * 2)
        raw.extend(max(0, min(255, round(c))) for c in (
            10 + 3 * swell + 10 * light + 13 * glint,
            36 + 5 * swell + 17 * light + 23 * glint + fine,
            48 + 6 * swell + 19 * light + 25 * glint + fine,
        ))
    # PNG Sub filter makes the smoothly varying surface compact.
    rows.append(bytes([1]) + bytes((c - (raw[i - 3] if i >= 3 else 0)) & 255 for i, c in enumerate(raw)))

def chunk(kind, data):
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)

output = Path(__file__).resolve().parents[1] / 'public' / 'ocean-surface.png'
output.write_bytes(b'\x89PNG\r\n\x1a\n'
    + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0))
    + chunk(b'IDAT', zlib.compress(b''.join(rows), 9)) + chunk(b'IEND', b''))
print(f'{output.name}: {output.stat().st_size:,} bytes')
