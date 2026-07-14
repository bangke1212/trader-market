import { useEffect, useRef, useState } from 'react'
import { fetchKlines, subscribeToKlines } from '../lib/api'

export default function CandlestickChart({ symbol, timeframe }) {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const dataRef = useRef([])
  const [price, setPrice] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const draw = (ctx, w, h, data, currentPrice) => {
    if (!data.length) {
      ctx.fillStyle = '#555'; ctx.font = '14px Inter'
      ctx.fillText('No data yet...', w / 2 - 50, h / 2)
      return
    }
    ctx.clearRect(0, 0, w, h)

    const p = { top: 20, right: 65, bottom: 30, left: 10 }
    const cw = w - p.left - p.right, ch = h - p.top - p.bottom

    let min = Infinity, max = -Infinity
    for (const d of data) { if (d.low < min) min = d.low; if (d.high > max) max = d.high }
    const range = max - min || 1
    min -= range * 0.05; max += range * 0.05
    const ys = ch / (max - min)
    const tx = (i) => p.left + (i / (data.length - 1)) * cw
    const ty = (v) => p.top + (max - v) * ys

    // Grid
    ctx.strokeStyle = '#1a1a22'; ctx.lineWidth = 0.5
    for (let i = 0; i < 5; i++) {
      const y = p.top + (ch / 4) * i
      ctx.beginPath(); ctx.moveTo(p.left, y); ctx.lineTo(w - p.right, y); ctx.stroke()
      ctx.fillStyle = '#666'; ctx.font = '10px Inter, sans-serif'
      ctx.fillText('$' + (max - (range / 4) * i).toFixed(1), w - p.right + 4, y + 3)
    }

    // Candles
    const bw = Math.max(1, cw / data.length * 0.7)
    for (const d of data) {
      const i = data.indexOf(d), x = tx(i), isUp = d.close >= d.open
      ctx.strokeStyle = isUp ? '#00c853' : '#ff1744'; ctx.fillStyle = isUp ? '#00c853' : '#ff1744'
      ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, ty(d.high)); ctx.lineTo(x, ty(d.low)); ctx.stroke()
      ctx.fillRect(x - bw / 2, ty(Math.max(d.open, d.close)), bw, Math.max(1, Math.abs(d.open - d.close) * ys))
    }

    // Current price line
    if (currentPrice && data.length) {
      const py = ty(currentPrice)
      ctx.strokeStyle = '#aaa'; ctx.lineWidth = 1; ctx.setLineDash([4, 4])
      ctx.beginPath(); ctx.moveTo(p.left, py); ctx.lineTo(w - p.right, py); ctx.stroke(); ctx.setLineDash([])
      ctx.fillStyle = '#ddd'; ctx.font = 'bold 11px Inter, sans-serif'
      ctx.fillText('$' + currentPrice.toFixed(1), w - p.right + 4, py + 4)
    }
  }

  // Resize handler
  useEffect(() => {
    const canvas = canvasRef.current, container = containerRef.current
    if (!canvas || !container) return

    const resize = () => {
      const r = container.getBoundingClientRect()
      if (r.width <= 0 || r.height <= 0) return
      canvas.width = r.width * devicePixelRatio; canvas.height = r.height * devicePixelRatio
      canvas.style.width = r.width + 'px'; canvas.style.height = r.height + 'px'
      const ctx = canvas.getContext('2d')
      ctx.scale(devicePixelRatio, devicePixelRatio)
      draw(ctx, r.width, r.height, dataRef.current, price)
    }
    window.addEventListener('resize', resize)
    resize()
    return () => window.removeEventListener('resize', resize)
  }, [price])

  // Load data
  useEffect(() => {
    setLoading(true); setError('')
    let unsub, cancelled = false

    const load = async () => {
      try {
        const klines = await fetchKlines(symbol, timeframe)
        if (cancelled) return
        if (!klines?.length) { setError('No data from Binance'); setLoading(false); return }
        dataRef.current = klines
        setPrice(klines[klines.length - 1].close)
        setLoading(false)
      } catch (e) {
        if (cancelled) return
        console.error('Chart fetch error:', e)
        if (e.name === 'AbortError') setError('Request timed out — Binance may be blocked in your region')
        else setError(`Failed to load: ${e.message}`)
        setLoading(false)
      }
    }

    load().then(() => {
      if (cancelled) return
      unsub = subscribeToKlines(symbol, timeframe, (kline) => {
        const last = dataRef.current[dataRef.current.length - 1]
        if (last && last.time === kline.time) {
          Object.assign(last, kline)
        } else {
          dataRef.current.push(kline)
          if (dataRef.current.length > 300) dataRef.current.shift()
        }
        setPrice(kline.close)
      })
    })

    return () => { cancelled = true; unsub?.() }
  }, [symbol, timeframe])

  return (
    <div className="relative flex-1" ref={containerRef}>
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0d0e12]/90">
          <div className="flex flex-col items-center gap-2 text-sm text-slate-400">
            <div className="w-5 h-5 border-2 border-slate-600 border-t-blue-500 rounded-full animate-spin" />
            <span>Loading chart...</span>
            <span className="text-[10px] text-slate-600">{symbol} • {timeframe}</span>
          </div>
        </div>
      )}
      {error && !loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0d0e12]/90">
          <div className="flex flex-col items-center gap-3 text-center px-6 max-w-sm">
            <div className="w-10 h-10 rounded-full bg-red-900/30 flex items-center justify-center text-red-400 text-lg">!</div>
            <p className="text-sm text-red-400 font-medium">Chart Error</p>
            <p className="text-xs text-slate-400">{error}</p>
            <button
              onClick={() => { setLoading(true); setError('')
                fetchKlines(symbol, timeframe).then(d => { dataRef.current = d; setPrice(d[d.length-1]?.close || 0); setLoading(false); })
                .catch(e => { setError(e.message); setLoading(false) })
              }}
              className="mt-1 px-4 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-xs transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      )}
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  )
}
