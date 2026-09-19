const axios = require('axios')
const { authenticator } = require('otplib')

const SIGNIN_URL = 'https://api.warframe.market/v1/auth/signin'

const HEADERS = {
  'Content-Type': 'application/json',
  Accept: 'application/json',
  Platform: 'pc',
  Language: 'en',
  Origin: 'https://warframe.market',
  Referer: 'https://warframe.market/',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}

async function loginWithCredentials() {
  const { WFM_EMAIL, WFM_PASSWORD, WFM_TOTP_SECRET } = process.env

  if (!WFM_EMAIL || !WFM_PASSWORD) {
    throw new Error('WFM_EMAIL e WFM_PASSWORD não configurados')
  }

  const body = {
    email: WFM_EMAIL,
    password: WFM_PASSWORD,
    auth_type: 'header'
  }

  if (WFM_TOTP_SECRET) {
    body.totp_code = authenticator.generate(WFM_TOTP_SECRET)
    console.log('[login] usando TOTP')
  }

  console.log('[login] POST /auth/signin →', WFM_EMAIL)

  const res = await axios.post(SIGNIN_URL, body, {
    headers: HEADERS,
    timeout: 20000,
    validateStatus: () => true
  })

  console.log('[login] status:', res.status)

  if (res.status === 403) {
    const err = new Error('403 Cloudflare — espere 1h')
    err.code = 'CF403'
    throw err
  }
  if (res.status === 401) {
    const err = new Error('401 email/senha/TOTP errados')
    err.code = 'AUTH401'
    throw err
  }
  if (res.status === 429) {
    const err = new Error('429 rate limit — espere 1h')
    err.code = 'RATE429'
    throw err
  }
  if (res.status !== 200) {
    console.log('[login] resposta:', JSON.stringify(res.data).slice(0, 300))
    throw new Error('HTTP ' + res.status)
  }

  const token =
    (res.data && res.data.payload && res.data.payload.token) ||
    (res.data && res.data.token) ||
    (res.headers &&
      res.headers['authorization'] &&
      res.headers['authorization'].replace(/^Bearer\s+/i, '')) ||
    null

  if (!token) {
    console.log('[login] resposta completa:', JSON.stringify(res.data, null, 2))
    throw new Error('token não encontrado na resposta')
  }

  console.log('[login] ✅ token obtido (' + token.length + ' chars)')
  return token
}

async function getToken() {
  const { WFM_JWT } = process.env

  if (WFM_JWT && WFM_JWT.length > 40) {
    console.log('[login] 🍪 usando JWT do .env')
    return WFM_JWT
  }
  return loginWithCredentials()
}

module.exports = { getToken, loginWithCredentials }
