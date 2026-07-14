import { BarChart3, Zap } from 'lucide-react'

export default function Navbar() {
  return (
    <nav className="h-10 bg-[#0a0b0d] border-b border-slate-800 flex items-center px-4 gap-3 shrink-0">
      <div className="flex items-center gap-2">
        <div className="w-5 h-5 rounded bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
          <BarChart3 size={12} className="text-white" />
        </div>
        <span className="text-xs font-bold text-white tracking-tight">Trader Market</span>
        <span className="text-[9px] px-1 py-0.5 rounded bg-purple-900/40 text-purple-400 border border-purple-800/30">LIVE</span>
      </div>
      <div className="h-3 w-px bg-slate-800" />
      <div className="flex items-center gap-1 text-[10px] text-slate-500">
        <Zap size={10} className="text-purple-400" />
        <span>Agnes AI + Binance</span>
      </div>
      <div className="flex-1" />
      <div className="flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
        <span className="text-[10px] text-slate-500">Realtime</span>
      </div>
    </nav>
  )
}
