const WebSocket = require('ws')
const fs = require('fs')
const path = require('path')
const { getToken } = require('./login')

const WS_URL = 'wss://ws.warframe.market/socket'
const PROTOCOL = 'wfm'
const FRAMES_LOG = path.join(process.cwd(), 'frames.log')

let socket = null
let reconnectTimer = null
let reconnectDelay = 5000
const MAX_DELAY = 5 * 60 * 1000
let backoffUntil = 0
let lastLoginAt = 0
let debug = process.env.WFM_DEBUG === '1' || process.env.WFM_DEBUG === 'true'
let stopped = false
let totalFrames = 0
let messageFrames = 0

function log(...args) {
  const ts = new Date().toISOString().slice(11, 19)
  console.log('[' + ts + ']', ...args)
}

function appendFrame(dir, data) {
  try {
    const line =
      '[' + new Date().toISOString() + '] ' + dir + ' ' +
      (typeof data === 'string' ? data : JSON.stringify(data)) + '\n'
    fs.appendFileSync(FRAMES_LOG, line)
    totalFrames++
  } catch (e) {}
}

async function tryLogin() {
  const now = Date.now()

  if (now < backoffUntil) {
    throw new Error('backoff ativo: ' + Math.ceil((backoffUntil - now) / 1000) + 's')
  }

  if (now - lastLoginAt < 5000) {
    await new Promise((r) => setTimeout(r, 5000 - (now - lastLoginAt)))
  }
  lastLoginAt = Date.now()

  try {
    return await getToken()
  } catch (err) {
    if (err.code === 'CF403' || err.code === 'RATE429') {
      log('⏸ backoff 1h por', err.code)
      backoffUntil = Date.now() + 60 * 60 * 1000
    }
    throw err
  }
}

async function connect() {
  if (stopped) return
  if (socket && socket.readyState === WebSocket.OPEN) {
    log('já conectado, ignorando')
    return
  }

  log('═══ iniciando conexão ═══')

  let token
  try {
    token = await tryLogin()
  } catch (err) {
    log('❌ login falhou:', err.message)
    scheduleReconnect()
    return
  }

  socket = new WebSocket(WS_URL, [PROTOCOL], {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Origin: 'https://warframe.market'
    }
  })

  socket.on('open', () => {
    log('✅ WebSocket conectado')
    reconnectDelay = 5000

    const authFrame = { route: 'auth.signIn', id: 'auth-1', payload: { token } }
    log('>>> auth.signIn')
    appendFrame('>>>', authFrame)
    try { socket.send(JSON.stringify(authFrame)) } catch (e) {}

    const candidates = [
      { route: 'messages.subscribe', id: 'sub-msg', payload: {} },
      { route: 'chat.subscribe', id: 'sub-chat', payload: {} },
      { route: 'presence.subscribe', id: 'sub-pres', payload: {} },
      { route: 'user.subscribe', id: 'sub-user', payload: {} },
      { route: 'notifications.subscribe', id: 'sub-notif', payload: {} }
    ]

    setTimeout(() => {
      log('>>> enviando ' + candidates.length + ' rotas candidatas')
      for (const c of candidates) {
        appendFrame('>>>', c)
        try { socket.send(JSON.stringify(c)) } catch (e) {}
      }
      log('')
      log('⏳ aguardando frames... manda DM pra essa conta!')
      log('')
    }, 1500)
  })

  socket.on('message', (raw) => {
    const str = raw.toString()
    let parsed
    try { parsed = JSON.parse(str) } catch (e) { parsed = str }

    const route = parsed && parsed.route ? parsed.route : '(sem route)'
    const id = parsed && parsed.id ? parsed.id : ''

    appendFrame('<<<', parsed)

    // Detecta potencial mensagem
    const isMessage =
      /messages?\.|chat\.|new.?message|message.?new/i.test(route) ||
      (parsed && parsed.payload &&
        (parsed.payload.body || parsed.payload.message || parsed.payload.text))

    if (isMessage) {
      messageFrames++
      log('📩 MENSAGEM DETECTADA! route=' + route)
      console.log('   ' + JSON.stringify(parsed).slice(0, 800))
    } else if (debug) {
      log('<<<', route, id)
      console.log('   ' + JSON.stringify(parsed).slice(0, 500))
    }
  })

  socket.on('close', (code, reason) => {
    log('🔌 fechado', code, reason ? reason.toString() : '')
    socket = null
    scheduleReconnect()
  })

  socket.on('error', (err) => {
    log('❌ erro:', err.message)
  })
}

function scheduleReconnect() {
  if (stopped || reconnectTimer) return
  const delay = Math.min(reconnectDelay, MAX_DELAY)
  log('⏳ reconectando em ' + Math.round(delay / 1000) + 's')
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    reconnectDelay = Math.min(reconnectDelay * 2, MAX_DELAY)
    connect().catch((e) => log('connect:', e.message))
  }, delay)
}

function disconnect() {
  stopped = true
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
  if (socket) { try { socket.close() } catch (e) {} socket = null }
}

function getStats() {
  return {
    connected: !!(socket && socket.readyState === WebSocket.OPEN),
    debug,
    totalFrames,
    messageFrames
  }
}

module.exports = { connect, disconnect, getStats, FRAMES_LOG }
