const AGNES_BASE = 'https://apihub.agnes-ai.com/v1'
const AGNES_KEY = 'sk-MVPAFALjPrN1FGmkdOTjQ31i4saUhVKR1feENGB2oexnujmB'
const AGNES_MODEL = 'agnes-2.0-flash'

export async function getAISignal(pair, priceData, timeframe) {
  const prompt = `You are a crypto trading analyst. Provide a trading signal.
Pair: ${pair} | TF: ${timeframe}
Price: $${priceData.price || 0} | 24h: ${priceData.change || 0}%
High: $${priceData.high || 0} | Low: $${priceData.low || 0}
Format:
SIGNAL: [BUY/SELL/HOLD]
CONFIDENCE: [1-100]%
ENTRY: $[price]
TARGET: $[price]
STOP LOSS: $[price]
REASON: [1-2 sentences]`
  try {
    const res = await fetch(`${AGNES_BASE}/chat/completions`, {
      method: 'POST', headers: {'Content-Type':'application/json','Authorization':`Bearer ${AGNES_KEY}`},
      body: JSON.stringify({model:AGNES_MODEL,messages:[{role:'user',content:prompt}],temperature:0.2,max_tokens:150}),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json(), text = data.choices?.[0]?.message?.content || ''
    return {
      signal: (text.match(/SIGNAL:\s*(BUY|SELL|HOLD)/i)?.[1]||'HOLD').toUpperCase(),
      confidence: parseInt(text.match(/CONFIDENCE:\s*(\d+)/i)?.[1]) || 50,
      entry: text.match(/ENTRY:\s*\$?([\d.]+)/i)?.[1]||'',
      target: text.match(/TARGET:\s*\$?([\d.]+)/i)?.[1]||'',
      stopLoss: text.match(/STOP LOSS:\s*\$?([\d.]+)/i)?.[1]||'',
      reason: text.match(/REASON:\s*(.+)/i)?.[1]||'',
      raw: text,
    }
  } catch (e) { return {signal:'HOLD',confidence:0,entry:'',target:'',stopLoss:'',reason:`Error: ${e.message}`,raw:''} }
}

// Multi-source
const BINANCE = ['api.binance.com','api1.binance.com','api2.binance.com','api3.binance.com','data-api.binance.vision']
const CG = 'https://api.coingecko.com/api/v3'
const PAIR_ID = {BTCUSDT:'bitcoin',ETHUSDT:'ethereum',BNBUSDT:'binancecoin',SOLUSDT:'solana',XRPUSDT:'ripple',DOGEUSDT:'dogecoin',ADAUSDT:'cardano'}

async function binanceGet(path) {
  const errs = []
  for (const host of BINANCE) {
    try {
      const ctrl = new AbortController(); const t = setTimeout(()=>ctrl.abort(),8000)
      const res = await fetch(`https://${host}${path}`,{signal:ctrl.signal}); clearTimeout(t)
      if (!res.ok) { errs.push(`${host}=${res.status}`); continue }
      return await res.json()
    } catch (e) { errs.push(`${host}=${e.message.slice(0,25)}`); continue }
  }
  throw new Error(errs.join(' | '))
}

async function cgGet(path) { const r=await fetch(`${CG}${path}`); if(!r.ok)throw new Error(`CG ${r.status}`); return r.json() }

async function bybitDepth(symbol) {
  const url = `https://api.bybit.com/v5/market/orderbook?category=spot&symbol=${symbol}&limit=15`
  const r = await fetch(url)
  if (!r.ok) throw new Error(`Bybit ${r.status}`)
  const d = await r.json()
  if (d.retCode !== 0) throw new Error(`Bybit ${d.retMsg}`)
  return { bids: d.result.bids?.map(([p,q])=>[+p,+q])||[], asks: d.result.asks?.map(([p,q])=>[+p,+q])||[] }
}

export function subscribeToTicker(symbol, onData) {
  let active=true; const pair=symbol.toLowerCase(); let ws,timer
  const connect=()=>{if(!active)return;try{ws=new WebSocket(`wss://stream.binance.com:9443/ws/${pair}@ticker`);ws.onmessage=e=>{if(!active)return;const d=JSON.parse(e.data);onData({price:+d.c,change:+d.P,high:+d.h,low:+d.l,volume:+d.v})};ws.onerror=()=>ws?.close();ws.onclose=()=>{if(active)setTimeout(connect,5000)}}catch{if(active)setTimeout(connect,5000)}}
  connect()
  const id=PAIR_ID[symbol]
  const poll=async()=>{if(!active||!id)return;try{const d=await cgGet(`/simple/price?ids=${id}&vs_currencies=usd&include_24hr_change=true&include_24hr_high_low=true`);if(d[id])onData({price:d[id].usd,change:d[id].usd_24h_change||0,high:d[id].usd_24h_high||d[id].usd,low:d[id].usd_24h_low||d[id].usd,volume:0})}catch{}}
  timer=setInterval(poll,20000);poll()
  return()=>{active=false;try{ws?.close()}catch{};clearInterval(timer)}
}

export async function fetchKlines(symbol, interval, limit=200) {
  try { const d=await binanceGet(`/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`); return d.map(x=>({time:x[0]/1000,open:+x[1],high:+x[2],low:+x[3],close:+x[4],volume:+x[5]})) } catch(e) { console.warn('Binance klines:',e.message) }
  const id=PAIR_ID[symbol]; if(!id)return[]
  const dm={'1m':'1','5m':'1','15m':'1','1h':'2','4h':'7','1d':'30'}
  const raw=await cgGet(`/coins/${id}/ohlc?vs_currency=usd&days=${dm[interval]||'1'}&precision=full`)
  if(!Array.isArray(raw))return[]
  return raw.map(d=>({time:d[0]/1000,open:d[1],high:d[2],low:d[3],close:d[4],volume:0})).slice(-limit)
}

export function subscribeToKlines(symbol, interval, onData) {
  let active=true; const pair=symbol.toLowerCase(); let ws,timer
  const connect=()=>{if(!active)return;try{ws=new WebSocket(`wss://stream.binance.com:9443/ws/${pair}@kline_${interval}`);ws.onmessage=e=>{if(!active)return;const k=JSON.parse(e.data).k;onData({time:k.t/1000,open:+k.o,high:+k.h,low:+k.l,close:+k.c,volume:+k.v,isFinal:k.x})};ws.onerror=()=>ws?.close();ws.onclose=()=>{if(active)setTimeout(connect,5000)}}catch{if(active)setTimeout(connect,5000)}}
  connect()
  const id=PAIR_ID[symbol]
  const poll=async()=>{if(!active||!id)return;try{const d=await cgGet(`/simple/price?ids=${id}&vs_currencies=usd`);if(d[id])onData({time:Math.floor(Date.now()/1000),price:d[id].usd,isFinal:false})}catch{}}
  timer=setInterval(poll,15000);poll()
  return()=>{active=false;try{ws?.close()}catch{};clearInterval(timer)}
}

// Depth: WS → Binance REST → Bybit
export function subscribeToDepth(symbol, onData) {
  let active=true; const pair=symbol.toLowerCase(); let ws,restTimer,bybitTimer; let wsOk=false,dataOk=false

  const connectWS=(hostIdx)=>{hostIdx=hostIdx||0;if(!active)return;const hosts=['stream.binance.com:9443','stream.binance.com:443'];if(hostIdx>=hosts.length){startBinanceRest();return}
    try{ws=new WebSocket(`wss://${hosts[hostIdx]}/ws/${pair}@depth10@1000ms`);ws.onopen=()=>{wsOk=true;dataOk=true}
      ws.onmessage=e=>{if(!active)return;const d=JSON.parse(e.data);onData({bids:d.bids?.map(([p,q])=>[+p,+q])||[],asks:d.asks?.map(([p,q])=>[+p,+q])||[]});dataOk=true}
      ws.onerror=()=>{ws?.close();if(!wsOk)connectWS(hostIdx+1)}
      ws.onclose=()=>{if(active&&!wsOk)connectWS(hostIdx+1);else if(active)setTimeout(()=>connectWS(0),5000)}
    }catch{if(active)connectWS(hostIdx+1)}}
  connectWS()

  const startBinanceRest=()=>{if(!active||dataOk)return
    const poll=async()=>{if(!active||dataOk)return;try{const d=await binanceGet(`/api/v3/depth?symbol=${symbol}&limit=15`);onData({bids:d.bids?.map(([p,q])=>[+p,+q])||[],asks:d.asks?.map(([p,q])=>[+p,+q])||[]});dataOk=true}catch{startBybitPoll()}}
    poll();restTimer=setInterval(poll,3000)}

  const startBybitPoll=()=>{if(!active||dataOk)return
    const poll=async()=>{if(!active||dataOk)return;try{const d=await bybitDepth(symbol);onData(d);dataOk=true}catch{}}
    poll();bybitTimer=setInterval(poll,3000)}

  setTimeout(()=>{if(!dataOk&&active){startBinanceRest();setTimeout(()=>{if(!dataOk&&active)startBybitPoll()},10000)}},5000)
  return()=>{active=false;try{ws?.close()}catch{};clearInterval(restTimer);clearInterval(bybitTimer)}
}

export async function fetch24hr(symbol) {
  try{const d=await binanceGet(`/api/v3/ticker/24hr?symbol=${symbol}`);return{price:+d.lastPrice,change:+d.priceChangePercent,high:+d.highPrice,low:+d.lowPrice,volume:+d.volume}}catch{
    const id=PAIR_ID[symbol];const d=await cgGet(`/simple/price?ids=${id}&vs_currencies=usd&include_24hr_change=true&include_24hr_high_low=true`)
    return{price:d[id].usd,change:d[id].usd_24h_change||0,high:d[id].usd_24h_high||d[id].usd,low:d[id].usd_24h_low||d[id].usd,volume:0}
  }
}
