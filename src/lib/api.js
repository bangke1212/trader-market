const AGNES_BASE = 'https://apihub.agnes-ai.com/v1'
const AGNES_KEY = 'sk-MVPAFALjPrN1FGmkdOTjQ31i4saUhVKR1feENGB2oexnujmB'
const AGNES_MODEL = 'Agnes-2.0-Flash'

export async function getAISignal(pair, priceData, timeframe) {
  const price = priceData.price || priceData.current || 0
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
    const signal = text.match(/SIGNAL:\s*(BUY|SELL|HOLD)/i)?.[1]?.toUpperCase() || 'HOLD'
    const confidence = parseInt(text.match(/CONFIDENCE:\s*(\d+)/i)?.[1]) || 50
    const entry = text.match(/ENTRY:\s*\$?([\d.]+)/i)?.[1] || ''
    const target = text.match(/TARGET:\s*\$?([\d.]+)/i)?.[1] || ''
    const stopLoss = text.match(/STOP LOSS:\s*\$?([\d.]+)/i)?.[1] || ''
    const reason = text.match(/REASON:\s*(.+)/i)?.[1] || ''
    return { signal, confidence, entry, target, stopLoss, reason, raw: text }
  } catch (e) {
    console.error('Agnes AI error:', e)
    return { signal: 'HOLD', confidence: 0, entry: '', target: '', stopLoss: '', reason: `Error: ${e.message}`, raw: '' }
  }
}

// ============ Binance API (with timeout) ============
const BINANCE_WS = 'wss://stream.binance.com:9443/ws'
const BINANCE_API = 'https://api.binance.com/api/v3'
const REQUEST_TIMEOUT = 10000

async function fetchWithTimeout(url, timeout = REQUEST_TIMEOUT) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timer)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } catch (e) {
    clearTimeout(timer)
    throw e
  }
}

export function subscribeToTicker(symbol, onData) {
  try {
    const ws = new WebSocket(`${BINANCE_WS}/${symbol.toLowerCase()}@ticker`)
    ws.onmessage = (e) => {
      const d = JSON.parse(e.data)
      onData({ price: parseFloat(d.c), change: parseFloat(d.P), high: parseFloat(d.h), low: parseFloat(d.l), volume: parseFloat(d.v), symbol: d.s })
    }
    ws.onerror = () => {}
    return () => { try { ws.close() } catch {} }
  } catch { return () => {} }
}

export function subscribeToKlines(symbol, interval, onData) {
  try {
    const ws = new WebSocket(`${BINANCE_WS}/${symbol.toLowerCase()}@kline_${interval}`)
    ws.onmessage = (e) => {
      const d = JSON.parse(e.data), k = d.k
      onData({ time: k.t / 1000, open: parseFloat(k.o), high: parseFloat(k.h), low: parseFloat(k.l), close: parseFloat(k.c), volume: parseFloat(k.v), isFinal: k.x })
    }
    ws.onerror = () => {}
    return () => { try { ws.close() } catch {} }
  } catch { return () => {} }
}

export function subscribeToDepth(symbol, onData) {
  try {
    const ws = new WebSocket(`${BINANCE_WS}/${symbol.toLowerCase()}@depth20@100ms`)
    ws.onmessage = (e) => {
      const d = JSON.parse(e.data)
      onData({ bids: d.bids.map(([p, q]) => [parseFloat(p), parseFloat(q)]), asks: d.asks.map(([p, q]) => [parseFloat(p), parseFloat(q)]) })
    }
    ws.onerror = () => {}
    return () => { try { ws.close() } catch {} }
  } catch { return () => {} }
}

export async function fetchKlines(symbol, interval, limit = 200) {
  const data = await fetchWithTimeout(`${BINANCE_API}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`)
  return data.map(d => ({
    time: d[0] / 1000, open: parseFloat(d[1]), high: parseFloat(d[2]), low: parseFloat(d[3]), close: parseFloat(d[4]), volume: parseFloat(d[5]),
  }))
}

export async function fetch24hr(symbol) {
  const d = await fetchWithTimeout(`${BINANCE_API}/ticker/24hr?symbol=${symbol}`)
  return {
    price: parseFloat(d.lastPrice), change: parseFloat(d.priceChangePercent),
    high: parseFloat(d.highPrice), low: parseFloat(d.lowPrice), volume: parseFloat(d.volume), symbol: d.symbol,
  }
}
