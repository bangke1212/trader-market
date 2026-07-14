import { useEffect, useRef, useState } from 'react'
import { fetchKlines, subscribeToKlines } from '../lib/api'

export default function CandlestickChart({ symbol, timeframe }) {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const dataRef = useRef([])
  const [price, setPrice] = useState(0)
  const [change, setChange] = useState(0)
  const [loading, setLoading] = useState(true)

  // Draw chart using Canvas 2D
  const draw = (ctx, w, h, data, currentPrice) => {
    if (!data.length) return
    ctx.clearRect(0, 0, w, h)

    const padding = { top: 20, right: 60, bottom: 30, left: 10 }
    const chartW = w - padding.left - padding.right
    const chartH = h - padding.top - padding.bottom

    let min = Infinity, max = -Infinity
    data.forEach(d => { if (d.low < min) min = d.low; if (d.high > max) max = d.high })
    const range = max - min || 1
    min -= range * 0.05; max += range * 0.05
    const yScale = chartH / (max - min)

    const toX = (i) => padding.left + (i / (data.length - 1)) * chartW
    const toY = (v) => padding.top + (max - v) * yScale

    // Grid
    ctx.strokeStyle = '#1a1a22'; ctx.lineWidth = 0.5
    for (let i = 0; i < 5; i++) {
      const y = padding.top + (chartH / 4) * i
      ctx.beginPath(); ctx.moveTo(padding.left, y); ctx.lineTo(w - padding.right, y); ctx.stroke()
      ctx.fillStyle = '#555'; ctx.font = '10px Inter'; ctx.fillText('$' + (max - (range / 4) * i).toFixed(1), w - padding.right + 4, y + 3)
    }

    // Candles
    const candleW = Math.max(1, chartW / data.length * 0.7)
    data.forEach((d, i) => {
      const x = toX(i), isUp = d.close >= d.open
      ctx.strokeStyle = isUp ? '#00c853' : '#ff1744'
      ctx.fillStyle = isUp ? '#00c853' : '#ff1744'
      ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(x, toY(d.high)); ctx.lineTo(x, toY(d.low)); ctx.stroke()
      ctx.fillRect(x - candleW / 2, toY(Math.max(d.open, d.close)), candleW, Math.max(1, Math.abs(d.open - d.close) * yScale))
    })

    // Current price line
    if (currentPrice) {
      const py = toY(currentPrice)
      ctx.strokeStyle = '#f0f0f0'; ctx.lineWidth = 1; ctx.setLineDash([4, 4])
      ctx.beginPath(); ctx.moveTo(padding.left, py); ctx.lineTo(w - padding.right, py); ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = '#f0f0f0'; ctx.font = 'bold 11px Inter'
      ctx.fillText('$' + currentPrice.toFixed(1), w - padding.right + 4, py + 4)
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const resize = () => {
      const rect = container.getBoundingClientRect()
      canvas.width = rect.width * window.devicePixelRatio
      canvas.height = rect.height * window.devicePixelRatio
      canvas.style.width = rect.width + 'px'
      canvas.style.height = rect.height + 'px'
      const ctx = canvas.getContext('2d')
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio)
      draw(ctx, rect.width, rect.height, dataRef.current, price)
    }

    window.addEventListener('resize', resize)
    resize()

    return () => window.removeEventListener('resize', resize)
  }, [price])

  useEffect(() => {
    setLoading(true)
    let unsub

    const load = async () => {
      const klines = await fetchKlines(symbol, timeframe)
      dataRef.current = klines
      if (klines.length) {
        setPrice(klines[klines.length - 1].close)
        setChange(((klines[klines.length - 1].close - klines[0].close) / klines[0].close) * 100)
      }
      setLoading(false)

      unsub = subscribeToKlines(symbol, timeframe, (kline) => {
        const last = dataRef.current[dataRef.current.length - 1]
        if (last && last.time === kline.time) {
          last.open = kline.open; last.high = kline.high; last.low = kline.low; last.close = kline.close; last.volume = kline.volume
        } else {
          dataRef.current.push(kline)
          if (dataRef.current.length > 300) dataRef.current.shift()
        }
        setPrice(kline.close)
      })
    }

    load()
    return () => unsub?.()
  }, [symbol, timeframe])

  // Redraw when price updates
  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return
    const ctx = canvas.getContext('2d')
    const rect = container.getBoundingClientRect()
    draw(ctx, rect.width, rect.height, dataRef.current, price)
  }, [price])

  return (
    <div className="relative flex-1" ref={containerRef}>
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0d0e12]/80">
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <div className="w-4 h-4 border-2 border-slate-600 border-t-blue-500 rounded-full animate-spin" />
            Loading chart...
          </div>
        </div>
      )}
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  )
}
