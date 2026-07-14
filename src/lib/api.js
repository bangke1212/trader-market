const AGNES_BASE = 'https://apihub.agnes-ai.com/v1'
const AGNES_KEY = 'sk-MVPAFALjPrN1FGmkdOTjQ31i4saUhVKR1feENGB2oexnujmB'
const AGNES_MODEL = 'Agnes-2.0-Flash'

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
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${AGNES_KEY}` },
      body: JSON.stringify({ model: AGNES_MODEL, messages: [{ role: 'user', content: prompt }], temperature: 0.2, max_tokens: 150 }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json(), text = data.choices?.[0]?.message?.content || ''
    return {
      signal: text.match(/SIGNAL:\s*(BUY|SELL|HOLD)/i)?.[1]?.toUpperCase() || 'HOLD',
      confidence: parseInt(text.match(/CONFIDENCE:\s*(\d+)/i)?.[1]) || 50,
      entry: text.match(/ENTRY:\s*\$?([\d.]+)/i)?.[1] || '',
      target: text.match(/TARGET:\s*\$?([\d.]+)/i)?.[1] || '',
      stopLoss: text.match(/STOP LOSS:\s*\$?([\d.]+)/i)?.[1] || '',
      reason: text.match(/REASON:\s*(.+)/i)?.[1] || '',
      raw: text,
    }
  } catch (e) { return { signal: 'HOLD', confidence: 0, entry: '', target: '', stopLoss: '', reason: `Error: ${e.message}`, raw: '' } }
}

// ============ Multi-source: Binance (5 hosts) → CoinGecko fallback ============
const BINANCE_HOSTS = ['api.binance.com', 'api1.binance.com', 'api2.binance.com', 'api3.binance.com', 'data-api.binance.vision']
const CG = 'https://api.coingecko.com/api/v3'
const PAIR_ID = { BTCUSDT:'bitcoin', ETHUSDT:'ethereum', BNBUSDT:'binancecoin', SOLUSDT:'solana', XRPUSDT:'ripple', DOGEUSDT:'dogecoin', ADAUSDT:'cardano' }

async function binanceGet(path) {
  const errs = []
  for (const host of BINANCE_HOSTS) {
    try {
      const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 8000)
      const res = await fetch(`https://${host}${path}`, { signal: ctrl.signal }); clearTimeout(t)
      if (!res.ok) { errs.push(`${host}=${res.status}`); continue }
      return await res.json()
    } catch (e) { errs.push(`${host}=${e.message.slice(0,25)}`); continue }
  }
  throw new Error(errs.join(' | '))
}

async function cgGet(path) {
  const res = await fetch(`${CG}${path}`)
  if (!res.ok) throw new Error(`CG ${res.status}`)
  return res.json()
}

export function subscribeToTicker(symbol, onData) {
  let active = true; const pair = symbol.toLowerCase(); let ws, timer

  const connect = () => {
    if (!active) return
    try {
      ws = new WebSocket(`wss://stream.binance.com:9443/ws/${pair}@ticker`)
      ws.onmessage = e => { if (!active) return; const d = JSON.parse(e.data); onData({ price: +d.c, change: +d.P, high: +d.h, low: +d.l, volume: +d.v }) }
      ws.onerror = () => ws?.close()
      ws.onclose = () => { if (active) setTimeout(connect, 5000) }
    } catch { if (active) setTimeout(connect, 5000) }
  }
  connect()

  const id = PAIR_ID[symbol]
  const poll = async () => { if (!active||!id) return; try { const d = await cgGet(`/simple/price?ids=${id}&vs_currencies=usd&include_24hr_change=true&include_24hr_high_low=true`); if (d[id]) onData({ price:d[id].usd, change:d[id].usd_24h_change||0, high:d[id].usd_24h_high||d[id].usd, low:d[id].usd_24h_low||d[id].usd, volume:0 }) } catch {} }
  timer = setInterval(poll, 20000); poll()
  return () => { active = false; try { ws?.close() } catch {}; clearInterval(timer) }
}

export async function fetchKlines(symbol, interval, limit = 200) {
  try {
    const data = await binanceGet(`/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`)
    return data.map(d => ({ time: d[0]/1000, open: +d[1], high: +d[2], low: +d[3], close: +d[4], volume: +d[5] }))
  } catch (e) { console.warn('Binance klines:', e.message) }
  const id = PAIR_ID[symbol]; if (!id) return []
  const dm = { '1m':'1','5m':'1','15m':'1','1h':'2','4h':'7','1d':'30' }
  const raw = await cgGet(`/coins/${id}/ohlc?vs_currency=usd&days=${dm[interval]||'1'}&precision=full`)
  if (!Array.isArray(raw)) return []
  return raw.map(d => ({ time: d[0]/1000, open: d[1], high: d[2], low: d[3], close: d[4], volume: 0 })).slice(-limit)
}

export function subscribeToKlines(symbol, interval, onData) {
  let active = true; const pair = symbol.toLowerCase(); let ws, timer

  const connect = () => {
    if (!active) return
    try {
      ws = new WebSocket(`wss://stream.binance.com:9443/ws/${pair}@kline_${interval}`)
      ws.onmessage = e => { if (!active) return; const k = JSON.parse(e.data).k; onData({ time:k.t/1000, open:+k.o, high:+k.h, low:+k.l, close:+k.c, volume:+k.v, isFinal:k.x }) }
      ws.onerror = () => ws?.close()
      ws.onclose = () => { if (active) setTimeout(connect, 5000) }
    } catch { if (active) setTimeout(connect, 5000) }
  }
  connect()

  const id = PAIR_ID[symbol]
  const poll = async () => { if (!active||!id) return; try { const d = await cgGet(`/simple/price?ids=${id}&vs_currencies=usd`); if (d[id]) onData({ time:Math.floor(Date.now()/1000), price:d[id].usd, isFinal:false }) } catch {} }
  timer = setInterval(poll, 15000); poll()
  return () => { active = false; try { ws?.close() } catch {}; clearInterval(timer) }
}

export function subscribeToDepth(symbol, onData) {
  let active = true; const pair = symbol.toLowerCase(); let ws
  const connect = () => {
    if (!active) return
    try {
      ws = new WebSocket(`wss://stream.binance.com:9443/ws/${pair}@depth10@1000ms`)
      ws.onmessage = e => { if (!active) return; const d = JSON.parse(e.data); onData({ bids:d.bids?.map(([p,q])=>[+p,+q])||[], asks:d.asks?.map(([p,q])=>[+p,+q])||[] }) }
      ws.onerror = () => ws?.close()
      ws.onclose = () => { if (active) setTimeout(connect, 5000) }
    } catch { if (active) setTimeout(connect, 5000) }
  }
  connect()
  return () => { active = false; try { ws?.close() } catch {} }
}

export async function fetch24hr(symbol) {
  try { const d = await binanceGet(`/api/v3/ticker/24hr?symbol=${symbol}`); return { price:+d.lastPrice, change:+d.priceChangePercent, high:+d.highPrice, low:+d.lowPrice, volume:+d.volume } }
  catch {
    const id = PAIR_ID[symbol]; const d = await cgGet(`/simple/price?ids=${id}&vs_currencies=usd&include_24hr_change=true&include_24hr_high_low=true`)
    return { price:d[id].usd, change:d[id].usd_24h_change||0, high:d[id].usd_24h_high||d[id].usd, low:d[id].usd_24h_low||d[id].usd, volume:0 }
  }
}
