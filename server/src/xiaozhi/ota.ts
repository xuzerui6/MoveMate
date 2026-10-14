import type { VirtualDeviceIdentity } from './identity.js'

const OTA_URL = (process.env.XIAOZHI_OTA_URL || 'https://api.tenclass.net/xiaozhi/ota/').replace(/\/+$/, '')

export interface OtaResponse {
  websocket?: { url?: string; token?: string }
  activation?: { code?: string; challenge?: string; message?: string; timeout_ms?: number }
}

// This is a browser device, without a manufacturer's registered hardware key.
// Activation-Version is the activation protocol, not the application version.
const headers = (identity: VirtualDeviceIdentity) => ({
  'Device-Id': identity.deviceId,
  'Client-Id': identity.clientId,
  'Content-Type': 'application/json',
  'User-Agent': 'web/motion-buddy-1.0.0',
  'Accept-Language': 'zh-CN',
  'Activation-Version': '1',
})

export async function fetchOta(identity: VirtualDeviceIdentity): Promise<OtaResponse> {
  const response = await fetch(`${OTA_URL}/`, {
    method: 'POST', headers: headers(identity), signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({
      application: { version: '2.1.2', elf_sha256: identity.hmacKey },
      board: { type: 'web', name: 'motion-buddy', ip: '0.0.0.0', mac: identity.deviceId },
    }),
  })
  if (!response.ok) throw new Error(`小智 OTA 返回 HTTP ${response.status}`)
  return response.json() as Promise<OtaResponse>
}

export async function pollActivation(identity: VirtualDeviceIdentity): Promise<'ready' | 'waiting'> {
  const activation = identity.activation
  if (!activation?.challenge) throw new Error('激活挑战已失效，请重新获取激活码')
  const response = await fetch(`${OTA_URL}/activate`, {
    // The provider holds an unbound-device poll for about 10 seconds before 202.
    // Leave headroom for the network instead of aborting a normal waiting response.
    method: 'POST', headers: headers(identity), signal: AbortSignal.timeout(30_000),
    body: '{}',
  })
  if (response.status === 200) return 'ready'
  if (response.status === 202) return 'waiting'
  throw new Error(`小智激活返回 HTTP ${response.status}`)
}
