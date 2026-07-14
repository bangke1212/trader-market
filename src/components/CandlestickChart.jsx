import { useEffect, useRef, useState } from 'react'
import { createChart } from 'lightweight-charts'
import { fetchKlines, subscribeToKlines } from '../lib/api'

export default function CandlestickChart({ symbol, timeframe }) {
  const containerRef = useRef(null)
  const chartRef = useRef(null)
  const candleRef = useRef(null)
  const volumeRef = useRef(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!containerRef.current) return

    const chart = createChart(containerRef.current, {
      layout: { background: { color: '#0d0e12' }, textColor: '#8b8b93' },
      grid: { vertLines: { color: '#1a1a22' }, horzLines: { color: '#1a1a22' } },
      crosshair: { mode: 0 },
      rightPriceScale: { borderColor: '#2a2a30', scaleMargins: { top: 0.05, bottom: 0.25 } },
      timeScale: { borderColor: '#2a2a30', timeVisible: true, secondsVisible: false },
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
    })

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#00c853', downColor: '#ff1744',
      borderUpColor: '#00c853', borderDownColor: '#ff1744',
      wickUpColor: '#00c853', wickDownColor: '#ff1744',
    })

    const volumeSeries = chart.addHistogramSeries({
      color: '#26a69a33', priceFormat: { type: 'volume' },
      priceScaleId: '',
    })
    volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } })

    chartRef.current = chart
    candleRef.current = candleSeries
    volumeRef.current = volumeSeries

    const resizeObserver = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth, height: containerRef.current.clientHeight })
      }
    })
    resizeObserver.observe(containerRef.current)

    return () => { resizeObserver.disconnect(); chart.remove() }
  }, [])

  // Load historical + subscribe realtime
  useEffect(() => {
    if (!candleRef.current || !volumeRef.current) return
    setLoading(true)

    const loadData = async () => {
      const klines = await fetchKlines(symbol, timeframe)
      const candleData = klines.map(k => ({ time: k.time, open: k.open, high: k.high, low: k.low, close: k.close }))
      const volumeData = klines.map(k => ({ time: k.time, value: k.volume, color: k.close >= k.open ? '#00c85333' : '#ff174433' }))

      candleRef.current.setData(candleData)
      volumeRef.current.setData(volumeData)
      setLoading(false)

      // Subscribe to realtime updates
      const unsub = subscribeToKlines(symbol, timeframe, (kline) => {
        candleRef.current?.update({ time: kline.time, open: kline.open, high: kline.high, low: kline.low, close: kline.close })
        volumeRef.current?.update({ time: kline.time, value: kline.volume, color: kline.close >= kline.open ? '#00c85333' : '#ff174433' })
      })
      return unsub
    }

    let cleanup
    loadData().then(c => { cleanup = c })

    return () => { cleanup?.() }
  }, [symbol, timeframe])

  return (
    <div className="relative flex-1">
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0d0e12]/80">
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <div className="w-4 h-4 border-2 border-slate-600 border-t-blue-500 rounded-full animate-spin" />
            Loading chart...
          </div>
        </div>
      )}
      <div ref={containerRef} className="w-full h-full" />
    </div>
  )
}
