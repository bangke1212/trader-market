import { useState, useEffect, useRef } from 'react'
import { subscribeToDepth } from '../lib/api'

export default function OrderBook({ symbol }) {
  const [depth, setDepth] = useState({ bids: [], asks: [] })
  const [maxBid, setMaxBid] = useState(0)
  const [maxAsk, setMaxAsk] = useState(0)

  useEffect(() => {
    const unsub = subscribeToDepth(symbol, (data) => {
      setDepth(data)
      const bidTotal = data.bids.slice(0, 10).reduce((s, [, q]) => s + q, 0) || 1
      const askTotal = data.asks.slice(0, 10).reduce((s, [, q]) => s + q, 0) || 1
      setMaxBid(bidTotal)
      setMaxAsk(askTotal)
    })
    return () => unsub()
  }, [symbol])

  const bids = [...depth.bids].slice(0, 10).reduce((acc, [price, qty]) => {
    const prev = acc.length ? acc[acc.length - 1].cumulative : 0
    acc.push({ price, qty, cumulative: prev + qty })
    return acc
  }, [])

  const asks = [...depth.asks].slice(0, 10).reduce((acc, [price, qty]) => {
    const prev = acc.length ? acc[acc.length - 1].cumulative : 0
    acc.push({ price, qty, cumulative: prev + qty })
    return acc
  }, [])

  const spread = depth.asks[0] && depth.bids[0] ? depth.asks[0][0] - depth.bids[0][0] : 0
  const spreadPct = depth.asks[0] ? ((spread / depth.asks[0][0]) * 100).toFixed(3) : '0'

  return (
    <div className="flex flex-col h-full bg-[#0d0e12] border-l border-slate-800">
      <div className="flex items-center px-3 py-2 border-b border-slate-800">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Order Book</span>
      </div>

      {/* Header */}
      <div className="grid grid-cols-3 px-3 py-1.5 text-[10px] text-slate-600 font-medium border-b border-slate-800/50">
        <span>Price</span>
        <span className="text-right">Amount</span>
        <span className="text-right">Total</span>
      </div>

      {/* Asks (red) */}
      <div className="flex-1 overflow-hidden flex flex-col-reverse">
        {asks.map((a, i) => (
          <div key={`ask-${i}`} className="grid grid-cols-3 px-3 py-0.5 text-[10px] relative group hover:bg-slate-800/30">
            <div className="absolute inset-y-0 right-0 bg-red-500/10" style={{ width: `${(a.cumulative / maxAsk) * 100}%` }} />
            <span className="relative text-red-400">{a.price.toFixed(2)}</span>
            <span className="relative text-right text-slate-400">{a.qty.toFixed(4)}</span>
            <span className="relative text-right text-slate-500">{a.cumulative.toFixed(4)}</span>
          </div>
        ))}
      </div>

      {/* Spread */}
      <div className="px-3 py-2 border-y border-slate-800 text-center">
        <span className="text-sm font-bold text-slate-200">
          ${depth.bids[0]?.[0]?.toFixed(2) || '--'}
        </span>
        <span className="text-[10px] text-slate-500 ml-2">
          Spread: {spread.toFixed(2)} ({spreadPct}%)
        </span>
      </div>

      {/* Bids (green) */}
      <div className="flex-1 overflow-hidden">
        {bids.map((b, i) => (
          <div key={`bid-${i}`} className="grid grid-cols-3 px-3 py-0.5 text-[10px] relative group hover:bg-slate-800/30">
            <div className="absolute inset-y-0 right-0 bg-emerald-500/10" style={{ width: `${(b.cumulative / maxBid) * 100}%` }} />
            <span className="relative text-emerald-400">{b.price.toFixed(2)}</span>
            <span className="relative text-right text-slate-400">{b.qty.toFixed(4)}</span>
            <span className="relative text-right text-slate-500">{b.cumulative.toFixed(4)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
