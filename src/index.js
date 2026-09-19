require('dotenv').config()
const fs = require('fs')
const { startHealthServer } = require('./health')
const { connect, disconnect, getStats, FRAMES_LOG } = require('./listener')

console.log('╔════════════════════════════════════════════╗')
console.log('║   WFM WebSocket — descoberta de rotas     ║')
console.log('╚════════════════════════════════════════════╝')
console.log('')
console.log('📁 Log de frames:', FRAMES_LOG)
console.log('')

// Limpa o log a cada execução
try { fs.writeFileSync(FRAMES_LOG, '') } catch (e) {}

startHealthServer()
connect()

// Stats a cada 2 minutos
setInterval(() => {
  const s = getStats()
  console.log('[stats] conexão=' + (s.connected ? 'ON' : 'off') +
              ' frames=' + s.totalFrames +
              ' mensagens=' + s.messageFrames)
}, 120000)

process.on('SIGINT', () => {
  console.log('\n👋 saindo')
  disconnect()
  process.exit(0)
})

process.on('SIGTERM', () => {
  console.log('\n👋 SIGTERM')
  disconnect()
  process.exit(0)
})
