# Kitaplık odasının tuğla ve sıcak ahşap dokularını kullanıcının verdiği referans görselden
# (1024x572, gece ışıklı oda + LED'li raf) çıkarır: ışığı yönlü düzleştir, rengi doğal tona çek,
# aynalayarak dikişsiz yap, renk haritasından normal ve pürüzlülük haritası türet.
# Kullanım: python3 scripts/extract-room-textures.py <referans.png> public/textures/room
# Kesim koordinatları o görsele göredir (tuğla: iki pencere arası 4 sıra; ahşap: üst bölme).
from PIL import Image, ImageFilter, ImageOps
import sys, math
SRC, OUT = sys.argv[1], sys.argv[2]
src = Image.open(SRC).convert('RGB')

def flatten(img, cells, target):
    """Aydınlatmayı böl, tonu koru; ortalama parlaklık = target. Işık, görüntü cells=(sx, sy)
    hücreye ortalanıp yumuşakça büyütülerek bulunur (yönlü: yatayda geniş, dikeyde bir sıra)"""
    lum = img.convert('L')
    blur = lum.resize(cells, Image.BOX).resize(img.size, Image.BICUBIC).filter(ImageFilter.GaussianBlur(4))
    W, H = img.size
    P, L, B = img.load(), lum.load(), blur.load()
    out = Image.new('RGB', (W, H)); O = out.load()
    for y in range(H):
        for x in range(W):
            k = target / (B[x, y] + 1)
            r, g, b = P[x, y]
            O[x, y] = (min(255, round(r * k)), min(255, round(g * k)), min(255, round(b * k)))
    return out

def tint_to(img, target, desat):
    """Doygunluğu azalt, ortalama rengi hedefe taşı (dokudaki değişim korunur)"""
    W, H = img.size; P = img.load()
    out = Image.new('RGB', (W, H)); O = out.load()
    for y in range(H):
        for x in range(W):
            r, g, b = P[x, y]; l = 0.299 * r + 0.587 * g + 0.114 * b
            O[x, y] = tuple(round(l + (c - l) * (1 - desat)) for c in (r, g, b))
    n = W * H
    mean = [sum(px[i] for px in out.getdata()) / n for i in range(3)]
    k = [t / m for t, m in zip(target, mean)]
    return out.point(lambda v: v)  if False else Image.merge('RGB', [ch.point(lambda v, f=f: max(0, min(255, round(v * f)))) for ch, f in zip(out.split(), k)])

def mirror_tile(img, horizontal=True, vertical=True):
    W, H = img.size
    w = W * (2 if horizontal else 1); h = H * (2 if vertical else 1)
    out = Image.new('RGB', (w, h))
    out.paste(img, (0, 0))
    if horizontal: out.paste(ImageOps.mirror(img), (W, 0))
    if vertical:
        top = out.crop((0, 0, w, H))
        out.paste(ImageOps.flip(top), (0, H))
    return out

def normal_from(img, strength, invert=False):
    """Parlaklığı yükseklik sayıp Sobel ile OpenGL normal haritası (y yukarı)"""
    h = img.convert('L').filter(ImageFilter.GaussianBlur(0.8))
    W, H = h.size; P = h.load()
    out = Image.new('RGB', (W, H)); O = out.load()
    s = -1 if invert else 1
    for y in range(H):
        for x in range(W):
            def v(dx, dy): return P[(x + dx) % W, (y + dy) % H] / 255
            gx = (v(1, -1) + 2 * v(1, 0) + v(1, 1)) - (v(-1, -1) + 2 * v(-1, 0) + v(-1, 1))
            gy = (v(-1, 1) + 2 * v(0, 1) + v(1, 1)) - (v(-1, -1) + 2 * v(0, -1) + v(1, -1))
            nx, ny, nz = -gx * strength * s, gy * strength * s, 1.0
            l = math.sqrt(nx * nx + ny * ny + nz * nz)
            O[x, y] = tuple(round((c / l * 0.5 + 0.5) * 255) for c in (nx, ny, nz))
    return out

def rough_from(img, base, spread, invert=False):
    lum = img.convert('L'); W, H = lum.size
    m = sum(lum.getdata()) / (W * H)
    return lum.point(lambda v: max(0, min(255, round(255 * (base + (-(v - m) if invert else (v - m)) / 255 * spread)))))

# Tuğla: iki pencere arası, harç çizgileri y=42 ve y=149 (tam 4 sıra), lamba lekeleri düzleşir
brick = src.crop((380, 68, 610, 175))
brick = brick.resize((brick.width * 2, brick.height * 2), Image.LANCZOS)
brick = flatten(brick, (10, 4), 110)
brick = tint_to(brick, (150, 84, 64), 0.35)
brick = mirror_tile(brick, horizontal=True, vertical=False)
brick.save(OUT + '/brick_diff.jpg', quality=88)
normal_from(brick, 3.2).save(OUT + '/brick_nor.jpg', quality=90)
rough_from(brick, 0.86, 0.5, invert=True).resize((brick.width // 2, brick.height // 2)).save(OUT + '/brick_rough.jpg', quality=85)

# Ahşap: üst bölmenin arka panosu (LED şeridinin altından), yatay damar
wood = src.crop((345, 268, 688, 312))
wood = wood.resize((wood.width * 2, wood.height * 2), Image.LANCZOS)
wood = flatten(wood, (10, 3), 140)
wood = tint_to(wood, (184, 118, 70), 0.3)
wood = mirror_tile(wood, horizontal=True, vertical=True)
wood.save(OUT + '/warmwood_diff.jpg', quality=88)
normal_from(wood, 1.6).save(OUT + '/warmwood_nor.jpg', quality=90)
rough_from(wood, 0.62, 0.4, invert=True).resize((wood.width // 2, wood.height // 2)).save(OUT + '/warmwood_rough.jpg', quality=85)
for n in ('brick', 'warmwood'):
    print(n, Image.open(f'{OUT}/{n}_diff.jpg').size)
