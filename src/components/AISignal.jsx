import { useState, useEffect, useCallback } from 'react'
import { Bot, Zap, RefreshCw, TrendingUp, TrendingDown, Minus, Target, Shield, Loader2 } from 'lucide-react'
import { getAISignal, fetch24hr } from '../lib/api'

export default function AISignal({ symbol }) {
  const [signal, setSignal] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [priceData, setPriceData] = useState(null)

  useEffect(() => {
    fetch24hr(symbol).then(setPriceData)
    setSignal(null)
    setError('')
  }, [symbol])

  const analyze = useCallback(async () => {
    setLoading(true)
    setError('')
    setSignal(null)
    try {
      const data = await fetch24hr(symbol)
      setPriceData(data)
      const result = await getAISignal(symbol, data, '15m')
      setSignal(result)
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }, [symbol])

  const color = signal?.signal === 'BUY' ? 'emerald' : signal?.signal === 'SELL' ? 'red' : 'slate'
  const Icon = signal?.signal === 'BUY' ? TrendingUp : signal?.signal === 'SELL' ? TrendingDown : Minus

  return (
    <div className="flex flex-col h-full bg-[#0d0e12] border-l border-slate-800">
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Bot size={14} className="text-purple-400" />
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">AI Signal</span>
        </div>
        <span className="text-[9px] text-purple-500 bg-purple-500/10 px-1.5 py-0.5 rounded">Agnes AI</span>
      </div>

      {/* Price Info */}
      {priceData && (
        <div className="px-3 py-2 border-b border-slate-800/50 space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">Price</span>
            <span className="text-slate-200 font-medium">${priceData.price < 1 ? priceData.price.toFixed(4) : priceData.price.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">24h Change</span>
            <span className={priceData.change >= 0 ? 'text-emerald-400 font-medium' : 'text-red-400 font-medium'}>
              {priceData.change >= 0 ? '+' : ''}{priceData.change?.toFixed(2)}%
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">24h High / Low</span>
            <span className="text-slate-400">
              ${priceData.high?.toFixed(2)} / ${priceData.low?.toFixed(2)}
            </span>
          </div>
        </div>
      )}

      {/* Analyze Button */}
      <div className="px-3 py-2">
        <button
          onClick={analyze}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-xs font-medium transition-all active:scale-95"
        >
          {loading ? (
            <><Loader2 size={14} className="animate-spin" /> Analyzing...</>
          ) : (
            <><Zap size={14} /> Analyze with Agnes AI</>
          )}
        </button>
      </div>

      {/* Signal Result */}
      <div className="flex-1 px-3 pb-3 overflow-y-auto">
        {error && (
          <div className="p-3 rounded-lg bg-red-900/20 border border-red-800/30 text-xs text-red-400">
            {error}
          </div>
        )}

        {signal && (
          <div className={`p-3 rounded-lg border ${
            signal.signal === 'BUY' ? 'bg-emerald-900/20 border-emerald-800/30' :
            signal.signal === 'SELL' ? 'bg-red-900/20 border-red-800/30' :
            'bg-slate-800/30 border-slate-700/30'
          }`}>
            {/* Signal Header */}
            <div className="flex items-center gap-2 mb-3">
              <div className={`p-1.5 rounded-lg ${signal.signal === 'BUY' ? 'bg-emerald-500/20' : signal.signal === 'SELL' ? 'bg-red-500/20' : 'bg-slate-500/20'}`}>
                <Icon size={20} className={`text-${color}-400`} />
              </div>
              <div>
                <span className={`text-sm font-bold text-${color}-400`}>{signal.signal}</span>
                <span className="text-[10px] text-slate-500 ml-1">{signal.confidence}% confidence</span>
              </div>
            </div>

            {/* Levels */}
            <div className="space-y-1.5 mb-2">
              {signal.entry && (
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-slate-500 flex items-center gap-1"><Target size={10} /> Entry</span>
                  <span className="text-slate-200">${signal.entry}</span>
                </div>
              )}
              {signal.target && (
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-slate-500 flex items-center gap-1"><TrendingUp size={10} /> Target</span>
                  <span className="text-emerald-400">${signal.target}</span>
                </div>
              )}
              {signal.stopLoss && (
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-slate-500 flex items-center gap-1"><Shield size={10} /> Stop Loss</span>
                  <span className="text-red-400">${signal.stopLoss}</span>
                </div>
              )}
            </div>

            {/* Reason */}
            <p className="text-[10px] text-slate-400 leading-relaxed border-t border-slate-700/50 pt-2 mt-2">
              {signal.reason}
            </p>
          </div>
        )}

        {!signal && !error && !loading && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-2 mt-6">
            <Bot size={32} className="text-slate-600" />
            <p className="text-xs text-slate-500">Tap analyze to get AI-powered trading signals</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-1.5 border-t border-slate-800 flex items-center gap-1 text-[9px] text-slate-600">
        <RefreshCw size={8} className={loading ? 'animate-spin' : ''} />
        <span>Agnes-2.0-Flash</span>
      </div>
    </div>
  )
}
