import { useState, useEffect } from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'

const PAIRS = [
  { symbol: 'BTCUSDT', name: 'BTC/USDT' },
  { symbol: 'ETHUSDT', name: 'ETH/USDT' },
  { symbol: 'BNBUSDT', name: 'BNB/USDT' },
  { symbol: 'SOLUSDT', name: 'SOL/USDT' },
  { symbol: 'XRPUSDT', name: 'XRP/USDT' },
  { symbol: 'DOGEUSDT', name: 'DOGE/USDT' },
  { symbol: 'ADAUSDT', name: 'ADA/USDT' },
]

const CG_IDS = { BTCUSDT:'bitcoin', ETHUSDT:'ethereum', BNBUSDT:'binancecoin', SOLUSDT:'solana', XRPUSDT:'ripple', DOGEUSDT:'dogecoin', ADAUSDT:'cardano' }

export default function TickerBar({ onSelectPair, activePair }) {
  const [tickers, setTickers] = useState({})
  const [flash, setFlash] = useState({})

  // Batch poll CoinGecko for ALL pairs in 1 call every 15s
  useEffect(() => {
    const ids = PAIRS.map(p => CG_IDS[p.symbol]).join(',')
    const symbols = PAIRS.map(p => p.symbol)

    const poll = async () => {
      try {
        const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_24hr_high_low=true`)
        const d = await res.json()
        setTickers(prev => {
          const next = { ...prev }
          symbols.forEach(sym => {
            const id = CG_IDS[sym]
            if (!d[id]) return
            const old = prev[sym]
            const price = d[id].usd
            if (old && old.price !== price) {
              setFlash(f => ({ ...f, [sym]: price > old.price ? 'up' : 'down' }))
              setTimeout(() => setFlash(f => ({ ...f, [sym]: null })), 500)
            }
            next[sym] = {
              price,
              change: d[id].usd_24h_change || 0,
              high: d[id].usd_24h_high || price,
              low: d[id].usd_24h_low || price,
              volume: 0,
            }
          })
          return next
        })
      } catch {}
    }

    poll()
    const timer = setInterval(poll, 15000)
    return () => clearInterval(timer)
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
