// Fosforlu kalem şeridinin SVG yolları (bkz. HighlightStroke)

// Her açılışta kalem aynı yerden geçmiş görünsün diye sabit tohumlu rastgele sayı üreteci
function seeded(seed) {
  let s = Math.max(1, Math.abs(Math.round(seed)) % 2147483646)
  return () => {
    s = (s * 16807) % 2147483647
    return s / 2147483647
  }
}

export function strokePaths(width, height, seed) {
  const rand = seeded(seed)
  const jitter = (n) => (rand() - 0.5) * n
  const f = (n) => n.toFixed(1)
  const pass = (top, bottom) => {
    const slant = (bottom - top) * 0.35
    const left = 1 + jitter(4)
    const right = width - 1 + jitter(4)
    return (
      `M${f(left + slant)} ${f(top + jitter(1.5))}` +
      ` Q${f(width / 2)} ${f(top + jitter(3))} ${f(right)} ${f(top + jitter(1.5))}` +
      ` L${f(right - slant)} ${f(bottom + jitter(1.5))}` +
      ` Q${f(width / 2)} ${f(bottom + jitter(3))} ${f(left)} ${f(bottom + jitter(1.5))} Z`
    )
  }
  return [pass(height * 0.08, height * 0.66), pass(height * 0.34, height * 0.92)]
}

