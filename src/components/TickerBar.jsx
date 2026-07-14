import { useState, useEffect, useRef } from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { subscribeToTicker, fetch24hr } from '../lib/api'

const PAIRS = [
  { symbol: 'BTCUSDT', name: 'BTC/USDT' },
  { symbol: 'ETHUSDT', name: 'ETH/USDT' },
  { symbol: 'BNBUSDT', name: 'BNB/USDT' },
  { symbol: 'SOLUSDT', name: 'SOL/USDT' },
  { symbol: 'XRPUSDT', name: 'XRP/USDT' },
  { symbol: 'DOGEUSDT', name: 'DOGE/USDT' },
  { symbol: 'ADAUSDT', name: 'ADA/USDT' },
]

export default function TickerBar({ onSelectPair, activePair }) {
  const [tickers, setTickers] = useState({})
  const [flash, setFlash] = useState({})

  useEffect(() => {
    const cleanups = []
    PAIRS.forEach((p, i) => {
      setTimeout(() => {
        const unsub = subscribeToTicker(p.symbol, (data) => {
          setTickers(prev => {
            const old = prev[p.symbol]
            if (old && old.price !== data.price) {
              setFlash(f => ({ ...f, [p.symbol]: data.price > old.price ? 'up' : 'down' }))
              setTimeout(() => setFlash(f => ({ ...f, [p.symbol]: null })), 500)
            }
            return { ...prev, [p.symbol]: data }
          })
        })
        cleanups.push(unsub)
      }, i * 200)
    })
    return () => cleanups.forEach(c => c())
  }, [])

  return (
    <div className="flex items-center gap-0 bg-[#0d0e12] border-b border-slate-800 overflow-x-auto shrink-0">
      {PAIRS.map(pair => {
        const t = tickers[pair.symbol]
        const isUp = t?.change >= 0
        const isActive = activePair === pair.symbol
        return (
          <button
            key={pair.symbol}
            onClick={() => onSelectPair(pair.symbol)}
            className={`flex items-center gap-2 px-4 py-2 text-xs whitespace-nowrap transition-colors border-r border-slate-800 hover:bg-slate-800/50 ${
              isActive ? 'bg-slate-800/80 border-b-2 border-b-blue-500' : ''
            } ${flash[pair.symbol] === 'up' ? 'flash-up' : flash[pair.symbol] === 'down' ? 'flash-down' : ''}`}
          >
            <span className="font-semibold text-slate-200">{pair.name}</span>
            {t ? (
              <>
                <span className={isUp ? 'text-emerald-400' : 'text-red-400'}>
                  ${t.price < 1 ? t.price.toFixed(4) : t.price < 10 ? t.price.toFixed(2) : t.price.toFixed(1)}
                </span>
                <span className={`flex items-center gap-0.5 text-[10px] ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
                  {isUp ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                  {isUp ? '+' : ''}{t.change?.toFixed(2)}%
                </span>
              </>
            ) : (
              <span className="text-slate-600">Loading...</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
