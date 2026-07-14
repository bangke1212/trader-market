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

// Sources
const BINANCE = ['api.binance.com','api1.binance.com','api2.binance.com','api3.binance.com','data-api.binance.vision']
const CG = 'https://api.coingecko.com/api/v3'
const ID = {BTCUSDT:'bitcoin',ETHUSDT:'ethereum',BNBUSDT:'binancecoin',SOLUSDT:'solana',XRPUSDT:'ripple',DOGEUSDT:'dogecoin',ADAUSDT:'cardano'}

async function bGet(path) {
  for (const host of BINANCE) {
    try {
      const ctrl = new AbortController(); const t = setTimeout(()=>ctrl.abort(),5000)
      const res = await fetch(`https://${host}${path}`,{signal:ctrl.signal}); clearTimeout(t)
      if(!res.ok)continue; return res.json()
    } catch {}
  }
  throw new Error('Binance all failed')
}
async function cgGet(path) { const r=await fetch(`${CG}${path}`); if(!r.ok)throw Error(`CG ${r.status}`); return r.json() }

// ===== KLINES: CoinGecko FIRST (fast), Binance backup =====
export async function fetchKlines(symbol, interval, limit=200) {
  const id = ID[symbol]; if (!id) return []
  const dm = {'1m':'1','5m':'1','15m':'1','1h':'2','4h':'7','1d':'30'}
  try {
    const raw = await cgGet(`/coins/${id}/ohlc?vs_currency=usd&days=${dm[interval]||'1'}&precision=full`)
    if (Array.isArray(raw) && raw.length) return raw.map(d=>({time:d[0]/1000,open:d[1],high:d[2],low:d[3],close:d[4],volume:0})).slice(-limit)
  } catch (e) { console.warn('CG klines:', e.message) }
  // Binance fallback
  try {
    const d = await bGet(`/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`)
    return d.map(x=>({time:x[0]/1000,open:+x[1],high:+x[2],low:+x[3],close:+x[4],volume:+x[5]}))
  } catch (e) { console.warn('Binance klines:', e.message) }
  return []
}

export function subscribeToKlines(symbol, interval, onData) {
  let active = true; const id = ID[symbol]
  // CoinGecko polling every 15s
  const poll = async () => {
    if (!active || !id) return
    try {
      const d = await cgGet(`/simple/price?ids=${id}&vs_currencies=usd`)
      if (d[id]) onData({ time: Math.floor(Date.now()/1000), price: d[id].usd, isFinal: false })
    } catch {}
  }
  poll()
  const timer = setInterval(poll, 15000)
  return () => { active = false; clearInterval(timer) }
}

// ===== DEPTH: Bybit FIRST (not blocked), Binance backup =====
export function subscribeToDepth(symbol, onData) {
  let active = true; let ok = false; let timer, ws

  // Bybit REST first (fast, not blocked)
  const bybitPoll = async () => {
    if (!active || ok) return
    try {
      const r = await fetch(`https://api.bybit.com/v5/market/orderbook?category=spot&symbol=${symbol}&limit=15`)
      const d = await r.json()
      if (d.retCode === 0) {
        onData({ bids: d.result.bids?.map(([p,q])=>[+p,+q])||[], asks: d.result.asks?.map(([p,q])=>[+p,+q])||[] })
        ok = true
      }
    } catch {}
  }

  // Binance WS backup
  const pair = symbol.toLowerCase()
  const connectWS = (hostIdx) => {
    hostIdx = hostIdx || 0; if (!active) return
    const hosts = ['stream.binance.com:9443', 'stream.binance.com:443']
    if (hostIdx >= hosts.length) return
    try {
      ws = new WebSocket(`wss://${hosts[hostIdx]}/ws/${pair}@depth10@1000ms`)
      ws.onmessage = e => { if (!active) return; const d = JSON.parse(e.data); onData({ bids: d.bids?.map(([p,q])=>[+p,+q])||[], asks: d.asks?.map(([p,q])=>[+p,+q])||[] }); ok = true }
      ws.onerror = () => { ws?.close(); if (!ok) connectWS(hostIdx + 1) }
      ws.onclose = () => { if (active && !ok) connectWS(hostIdx + 1); else if (active) setTimeout(() => connectWS(0), 5000) }
    } catch { if (!ok) connectWS(hostIdx + 1) }
  }

  bybitPoll()
  timer = setInterval(bybitPoll, 3000)
  connectWS()
  return () => { active = false; clearInterval(timer); try { ws?.close() } catch {} }
}

// ===== 24hr =====
export async function fetch24hr(symbol) {
  const id = ID[symbol]
  try {
    const d = await cgGet(`/simple/price?ids=${id}&vs_currencies=usd&include_24hr_change=true&include_24hr_high_low=true`)
    return { price: d[id].usd, change: d[id].usd_24h_change||0, high: d[id].usd_24h_high||d[id].usd, low: d[id].usd_24h_low||d[id].usd, volume: 0 }
  } catch {
    try { const d = await bGet(`/api/v3/ticker/24hr?symbol=${symbol}`); return { price:+d.lastPrice, change:+d.priceChangePercent, high:+d.highPrice, low:+d.lowPrice, volume:+d.volume } } catch { return { price:0, change:0, high:0, low:0, volume:0 } }
  }
}
