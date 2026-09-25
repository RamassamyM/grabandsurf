// QR codes: read what a printed Grab&Surf QR contains, and decode a QR from a photo or a camera frame.
import jsQR from 'jsqr'

// Printed QR codes hold URLs: https://host/s/A (rack) or https://host/p/korko-01 (board).
export function parseQr(text) {
  const raw = String(text || '').trim()
  const board = raw.match(/\/p\/([a-z0-9-]+)/i) || raw.match(/^(korko-\d+)$/i)
  if (board) return { type: 'board', id: board[1].toLowerCase() }
  const rack = raw.match(/\/s\/([a-z0-9]+)/i)
  if (rack) return { type: 'rack', id: rack[1].toUpperCase() }
  return null
}

export function decodeCanvas(ctx, width, height) {
  const image = ctx.getImageData(0, 0, width, height)
  const found = jsQR(image.data, width, height, { inversionAttempts: 'attemptBoth' })
  return found ? found.data : null
}

// Decode a QR code in a photo (downscaled: phone photos are large and jsQR is CPU bound).
export async function decodeImageFile(file, maxSide = 1200) {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = reject
      i.src = url
    })
    for (const side of [maxSide, 800, 1600]) {
      const scale = Math.min(1, side / Math.max(img.width, img.height))
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      ctx.drawImage(img, 0, 0, w, h)
      const text = decodeCanvas(ctx, w, h)
      if (text) return text
    }
    return null
  } catch {
    return null
  } finally {
    URL.revokeObjectURL(url)
  }
}
