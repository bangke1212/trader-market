// ============ Agnes AI ============
const AGNES_BASE = 'https://apihub.agnes-ai.com/v1'
const AGNES_KEY = 'sk-MVPAFALjPrN1FGmkdOTjQ31i4saUhVKR1feENGB2oexnujmB'
const AGNES_MODEL = 'Agnes-2.0-Flash'

export async function getAISignal(pair, priceData, timeframe) {
  const price = priceData.price || 0
  const prompt = `You are a professional crypto trading analyst. Analyze market data and provide a trading signal.

Trading Pair: ${pair}
Timeframe: ${timeframe}
Current Price: $${price}
24h High: $${priceData.high || 0}
24h Low: $${priceData.low || 0}
24h Change: ${priceData.change || 0}%
Volume: ${priceData.volume || 0}

Provide analysis in this exact format:
SIGNAL: [BUY/SELL/HOLD]
CONFIDENCE: [1-100]%
ENTRY: $[price]
TARGET: $[price]
STOP LOSS: $[price]
REASON: [1-2 short sentences]

Keep it very short. Only output the signal.`

  try {
    const res = await fetch(`${AGNES_BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${AGNES_KEY}` },
      body: JSON.stringify({ model: AGNES_MODEL, messages: [{ role: 'user', content: prompt }], temperature: 0.2, max_tokens: 150 }),
    })
    if (!res.ok) throw new Error(`Agnes API error (${res.status})`)
    const data = await res.json()
    const text = data.choices?.[0]?.message?.content || ''
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

// ============ CoinGecko API (free, no CORS, no block) ============
const CG_BASE = 'https://api.coingecko.com/api/v3'

const PAIR_MAP = {
  BTCUSDT:  { id: 'bitcoin', name: 'BTC/USDT' },
  ETHUSDT:  { id: 'ethereum', name: 'ETH/USDT' },
  BNBUSDT:  { id: 'binancecoin', name: 'BNB/USDT' },
  SOLUSDT:  { id: 'solana', name: 'SOL/USDT' },
  XRPUSDT:  { id: 'ripple', name: 'XRP/USDT' },
  DOGEUSDT: { id: 'dogecoin', name: 'DOGE/USDT' },
  ADAUSDT:  { id: 'cardano', name: 'ADA/USDT' },
}

// Ticker: poll CoinGecko every 10s
export function subscribeToTicker(symbol, onData) {
  let active = true
  const id = PAIR_MAP[symbol]?.id
  if (!id) return () => {}

  const poll = async () => {
    if (!active) return
    try {
      const res = await fetch(`${CG_BASE}/simple/price?ids=${id}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_24hr_high_low=true`)
      const d = await res.json()
      if (!d[id]) return
      onData({
        price: d[id].usd,
        change: d[id].usd_24h_change || 0,
        high: d[id].usd_24h_high || d[id].usd,
        low: d[id].usd_24h_low || d[id].usd,
        volume: d[id].usd_24h_vol || 0,
      })
    } catch {}
  }

  poll()
  const timer = setInterval(poll, 10000)
  return () => { active = false; clearInterval(timer) }
}

// Klines: CoinGecko OHLC endpoint
export async function fetchKlines(symbol, interval, limit = 200) {
  const id = PAIR_MAP[symbol]?.id
  if (!id) return []

  // Map timeframe to days
  const tfMap = { '1m': '1', '5m': '1', '15m': '1', '1h': '1', '4h': '7', '1d': '30' }
  const days = tfMap[interval] || '1'

  const url = `${CG_BASE}/coins/${id}/ohlc?vs_currency=usd&days=${days}&precision=full`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`)
  const raw = await res.json()
  if (!Array.isArray(raw)) return []

  return raw.map(d => ({
    time: d[0] / 1000,
    open: d[1], high: d[2], low: d[3], close: d[4],
    volume: 0,
  })).slice(-limit)
}

// Subscribe to kline updates (poll every 15s)
export function subscribeToKlines(symbol, interval, onData) {
  let active = true
  const id = PAIR_MAP[symbol]?.id
  if (!id) return () => {}

  const poll = async () => {
    if (!active) return
    try {
      const res = await fetch(`${CG_BASE}/simple/price?ids=${id}&vs_currencies=usd`)
      const d = await res.json()
      if (!d[id]) return
      const now = Math.floor(Date.now() / 1000)
      onData({ time: now, price: d[id].usd, isFinal: false })
    } catch {}
  }

  poll()
  const timer = setInterval(poll, 15000)
  return () => { active = false; clearInterval(timer) }
}

// Depth: CoinGecko doesn't provide order book for free — use Binance WS as fallback
export function subscribeToDepth(symbol, onData) {
  const pair = symbol.toLowerCase()
  let ws
  let active = true

  const connect = () => {
    if (!active) return
    try {
      ws = new WebSocket(`wss://stream.binance.com:9443/ws/${pair}@depth10@1000ms`)
      ws.onmessage = (e) => {
        if (!active) return
        const d = JSON.parse(e.data)
        onData({
          bids: d.bids?.map(([p, q]) => [parseFloat(p), parseFloat(q)]) || [],
          asks: d.asks?.map(([p, q]) => [parseFloat(p), parseFloat(q)]) || [],
        })
      }
      ws.onerror = () => { if (active) { ws?.close(); setTimeout(connect, 5000) } }
      ws.onclose = () => { if (active) setTimeout(connect, 5000) }
    } catch { if (active) setTimeout(connect, 5000) }
  }

  connect()
  return () => { active = false; try { ws?.close() } catch {} }
}

// 24hr ticker
export async function fetch24hr(symbol) {
  const id = PAIR_MAP[symbol]?.id
  if (!id) throw new Error('Unknown symbol')
  const url = `${CG_BASE}/simple/price?ids=${id}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_24hr_high_low=true`
  const res = await fetch(url)
  const d = await res.json()
  return {
    price: d[id].usd,
    change: d[id].usd_24h_change || 0,
    high: d[id].usd_24h_high || d[id].usd,
    low: d[id].usd_24h_low || d[id].usd,
    volume: d[id].usd_24h_vol || 0,
  }
}
