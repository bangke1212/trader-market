import { useEffect, useRef, useState } from 'react'
import { fetchKlines, subscribeToKlines } from '../lib/api'

export default function CandlestickChart({ symbol, timeframe }) {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const dataRef = useRef([])
  const [price, setPrice] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retryCount, setRetryCount] = useState(0)

  const draw = (ctx, w, h, data, p) => {
    if (!data.length) { ctx.fillStyle='#555'; ctx.font='14px sans-serif'; ctx.fillText('No data', w/2-30, h/2); return }
    ctx.clearRect(0, 0, w, h)
    const pad = { top:20, right:65, bottom:30, left:10 }
    const cw = w-pad.left-pad.right, ch = h-pad.top-pad.bottom
    let min=Infinity,max=-Infinity
    for (const d of data) { if(d.low<min)min=d.low; if(d.high>max)max=d.high }
    const range=max-min||1; min-=range*.05; max+=range*.05
    const ys=ch/(max-min), tx=i=>pad.left+(i/(data.length-1||1))*cw, ty=v=>pad.top+(max-v)*ys
    ctx.strokeStyle='#1a1a22'; ctx.lineWidth=.5
    for(let i=0;i<5;i++){const y=pad.top+(ch/4)*i,v=max-(range/4)*i;ctx.beginPath();ctx.moveTo(pad.left,y);ctx.lineTo(w-pad.right,y);ctx.stroke();ctx.fillStyle='#666';ctx.font='10px sans-serif';ctx.fillText('$'+v.toFixed(1),w-pad.right+4,y+3)}
    const bw=Math.max(1.5,cw/data.length*.7)
    for(let i=0;i<data.length;i++){const d=data[i],x=tx(i),up=d.close>=d.open;ctx.strokeStyle=up?'#00c853':'#ff1744';ctx.fillStyle=up?'#00c853':'#ff1744';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,ty(d.high));ctx.lineTo(x,ty(d.low));ctx.stroke();ctx.fillRect(x-bw/2,ty(Math.max(d.open,d.close)),bw,Math.max(1,Math.abs(d.open-d.close)*ys))}
    if(p&&data.length){const py=ty(p);ctx.strokeStyle='#aaa';ctx.lineWidth=1;ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(pad.left,py);ctx.lineTo(w-pad.right,py);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#ddd';ctx.font='bold 11px sans-serif';ctx.fillText('$'+p.toFixed(1),w-pad.right+4,py+4)}
  }

  useEffect(() => {
    const c=canvasRef.current,ct=containerRef.current; if(!c||!ct)return
    const resize=()=>{const r=ct.getBoundingClientRect();if(r.width<=0||r.height<=0)return;c.width=r.width*devicePixelRatio;c.height=r.height*devicePixelRatio;c.style.width=r.width+'px';c.style.height=r.height+'px';const ctx=c.getContext('2d');ctx.scale(devicePixelRatio,devicePixelRatio);draw(ctx,r.width,r.height,dataRef.current,price)}
    window.addEventListener('resize',resize);resize()
    return ()=>window.removeEventListener('resize',resize)
  },[price])

  useEffect(() => {
    setLoading(true);setError('');let cancelled=false,unsub
    (async()=>{
      try{
        const klines=await fetchKlines(symbol,timeframe)
        if(cancelled)return
        if(!klines?.length){setError('No data received');setLoading(false);return}
        dataRef.current=klines;setPrice(klines[klines.length-1].close);setLoading(false)
        unsub=subscribeToKlines(symbol,timeframe,(u)=>{if(cancelled)return
          const last=dataRef.current[dataRef.current.length-1]
          if(u.open!==undefined){if(last&&last.time===u.time)Object.assign(last,u);else{dataRef.current.push(u);if(dataRef.current.length>300)dataRef.current.shift()}}
          else if(last&&u.price){last.close=u.price;if(u.price>last.high)last.high=u.price;if(u.price<last.low)last.low=u.price}
          setPrice(u.close||u.price||price)
        })
      }catch(e){if(cancelled)return;setError(`Failed: ${e.message}`);setLoading(false)}
    })()
    return ()=>{cancelled=true;unsub?.()}
  },[symbol,timeframe,retryCount])

  return (
    <div className="relative flex-1" ref={containerRef}>
      {loading&&<div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0d0e12]/90"><div className="flex flex-col items-center gap-2"><div className="w-5 h-5 border-2 border-slate-600 border-t-blue-500 rounded-full animate-spin"/><span className="text-xs text-slate-400">Loading chart...</span><span className="text-[10px] text-slate-600">{symbol} • {timeframe}</span></div></div>}
      {error&&!loading&&<div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0d0e12]/90"><div className="flex flex-col items-center gap-3 px-6 text-center max-w-sm"><div className="w-10 h-10 rounded-full bg-red-900/30 flex items-center justify-center text-red-400 text-lg">!</div><p className="text-sm text-red-400">Chart Error</p><p className="text-xs text-slate-400">{error}</p><button onClick={()=>setRetryCount(c=>c+1)} className="mt-1 px-4 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-xs">Retry</button></div></div>}
      <canvas ref={canvasRef} style={{width:'100%',height:'100%',display:'block'}}/>
    </div>
  )
}
