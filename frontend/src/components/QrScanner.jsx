import { useEffect, useRef, useState } from 'react'
import { Camera, X } from 'lucide-react'
import { useT } from '@/i18n.jsx'
import { decodeCanvas, decodeImageFile, parseQr } from '@/qr.js'
import { Button } from '@/components/ui/button'

// Camera QR scanner (needs HTTPS or localhost); falls back to taking a photo of the QR code.
export default function QrScanner({ expect, onResult, onClose }) {
  const { t } = useT()
  const video = useRef(null)
  const [cameraOk, setCameraOk] = useState(Boolean(navigator.mediaDevices?.getUserMedia))
  const [error, setError] = useState(null)

  const accept = (text) => {
    const parsed = parseQr(text)
    if (parsed && (!expect || parsed.type === expect)) {
      onResult(parsed)
      return true
    }
    setError(t('scan_wrong'))
    return false
  }

  useEffect(() => {
    if (!cameraOk) return undefined
    let stream = null
    let frame = 0
    let stopped = false
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    const tick = () => {
      if (stopped) return
      const v = video.current
      if (v && v.readyState >= 2 && v.videoWidth) {
        const scale = Math.min(1, 640 / v.videoWidth)
        canvas.width = Math.round(v.videoWidth * scale)
        canvas.height = Math.round(v.videoHeight * scale)
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height)
        const text = decodeCanvas(ctx, canvas.width, canvas.height)
        if (text && accept(text)) return
      }
      frame = requestAnimationFrame(tick)
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then((s) => {
        stream = s
        if (video.current) {
          video.current.srcObject = s
          video.current.play().catch(() => {})
        }
        frame = requestAnimationFrame(tick)
      })
      .catch(() => setCameraOk(false))
    return () => {
      stopped = true
      cancelAnimationFrame(frame)
      if (stream) stream.getTracks().forEach((tr) => tr.stop())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraOk])

  const fromPhoto = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await decodeImageFile(file)
    if (!text) setError(t('qr_not_found'))
    else accept(text)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy/70 p-4 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true">
      <div className="w-full max-w-sm rounded-3xl bg-card p-5 shadow-2xl animate-in fade-in-0 slide-in-from-bottom-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-extrabold">{t('scan_title')}</h3>
          <button onClick={onClose} className="rounded-full p-1.5 text-muted-foreground hover:bg-muted" aria-label={t('scan_close')}>
            <X className="h-5 w-5" />
          </button>
        </div>
        {cameraOk ? (
          <>
            <div className="relative mt-4 aspect-square overflow-hidden rounded-2xl bg-navy">
              <video ref={video} playsInline muted className="h-full w-full object-cover" />
              <div className="pointer-events-none absolute inset-10 rounded-2xl border-4 border-sun/90" />
            </div>
            <p className="mt-3 text-sm text-muted-foreground">{t('scan_hint')}</p>
          </>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">{t('scan_no_camera')}</p>
        )}
        {error && <p role="alert" className="mt-3 rounded-xl bg-coral-50 px-3 py-2 text-sm text-coral">{error}</p>}
        <input type="file" accept="image/*" capture="environment" onChange={fromPhoto} className="hidden" id="qr-photo" />
        <Button variant="outline" size="lg" className="mt-4 w-full" onClick={() => document.getElementById('qr-photo').click()}>
          <Camera /> {t('scan_photo')}
        </Button>
      </div>
    </div>
  )
}
