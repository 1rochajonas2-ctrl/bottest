const http = require('http')

function startHealthServer() {
  const port = process.env.PORT || 3000
  const server = http.createServer((req, res) => {
    if (req.url === '/health' || req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        status: 'ok',
        uptime: Math.round(process.uptime()),
        ts: new Date().toISOString()
      }))
    } else {
      res.writeHead(404)
      res.end()
    }
  })

  server.listen(port, '0.0.0.0', () => {
    console.log('[health] servidor na porta ' + port)
  })

  server.on('error', (err) => {
    console.error('[health] erro:', err.message)
  })

  return server
}

module.exports = { startHealthServer }
