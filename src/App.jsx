import { useState } from 'react'
import Navbar from './components/Navbar'
import TickerBar from './components/TickerBar'
import CandlestickChart from './components/CandlestickChart'
import OrderBook from './components/OrderBook'
import AISignal from './components/AISignal'
import { Clock } from 'lucide-react'

const TIMEFRAMES = [
  { value: '1m', label: '1m' },
  { value: '5m', label: '5m' },
  { value: '15m', label: '15m' },
  { value: '1h', label: '1H' },
  { value: '4h', label: '4H' },
  { value: '1d', label: '1D' },
]

export default function App() {
  const [symbol, setSymbol] = useState('BTCUSDT')
  const [timeframe, setTimeframe] = useState('15m')

  return (
    <div className="h-screen flex flex-col bg-[#0a0b0d] overflow-hidden">
      <Navbar />
      <TickerBar onSelectPair={setSymbol} activePair={symbol} />

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-[#0d0e12] border-b border-slate-800 shrink-0">
        <Clock size={12} className="text-slate-500" />
        {TIMEFRAMES.map(tf => (
          <button
            key={tf.value}
            onClick={() => setTimeframe(tf.value)}
            className={`px-2.5 py-0.5 text-[11px] rounded font-medium transition-colors ${
              timeframe === tf.value
                ? 'bg-blue-600 text-white'
                : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
            }`}
          >
            {tf.label}
          </button>
        ))}
        <div className="flex-1" />
        <span className="text-[10px] text-slate-600">{symbol} • {timeframe}</span>
      </div>

      {/* Main workspace */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden">
          <CandlestickChart symbol={symbol} timeframe={timeframe} />
        </div>
        <div className="w-64 xl:w-72 shrink-0 flex flex-col">
          <div className="flex-1">
            <OrderBook symbol={symbol} />
          </div>
          <div className="h-[380px]">
            <AISignal symbol={symbol} />
          </div>
        </div>
      </div>
    </div>
  )
}
