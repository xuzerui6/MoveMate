import { cookieValue, getIdentityMode, resolveRequestIdentity } from '../../server/src/xiaozhi/identity';
import { verifyToken } from '../../server/src/utils/jwt';
import { fetchOta } from '../../server/src/xiaozhi/ota';

/** Native Workers bridge. Audio, images and full conversations are never persisted. */
export async function bridgeXiaozhi(request: Request, report: (stage: string, detail?: string | number) => Promise<void> = async () => {}): Promise<Response> {
  await report('request');
  const nodeRequest = { headers: { cookie: request.headers.get('cookie') || '', origin: request.headers.get('origin') || undefined } };
  try { verifyToken(cookieValue(nodeRequest as any, 'motion_account') || ''); }
  catch { await report('account_cookie_rejected'); console.warn('[Xiaozhi] rejected: account cookie'); return new Response('Unauthorized', { status: 401 }); }
  if (request.headers.get('origin') !== new URL(request.url).origin || getIdentityMode() === 'disabled') { await report('origin_or_mode_rejected', getIdentityMode()); return new Response('Forbidden', { status: 403 }); }
  const identity = resolveRequestIdentity(nodeRequest as any);
  if (!identity) { await report('device_cookie_rejected'); console.warn('[Xiaozhi] rejected: device identity'); return new Response('Device identity missing', { status: 401 }); }
  if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') return new Response('WebSocket required', { status: 426 });
  try {
    await report('ota_request');
    const ota = await fetchOta(identity);
    if (!ota.websocket?.url || !ota.websocket.token || ota.activation) { await report('activation_required'); console.warn('[Xiaozhi] rejected: activation required'); return new Response('Device activation required', { status: 401 }); }
    const url = ota.websocket.url.replace(/^ws:/, 'http:').replace(/^wss:/, 'https:');
    await report('upstream_handshake');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    let upstreamResponse: Response;
    try { upstreamResponse = await fetch(url, { headers: {
      Upgrade: 'websocket', Authorization: `Bearer ${ota.websocket.token}`, 'Protocol-Version': '1',
      'Device-Id': identity.deviceId, 'Client-Id': identity.clientId,
    }, signal: controller.signal }); } finally { clearTimeout(timeout); }
    await report('upstream_response', upstreamResponse.status);
    const upstream = upstreamResponse.webSocket;
    if (!upstream || upstreamResponse.status !== 101) throw new Error(`小智上游返回 HTTP ${upstreamResponse.status}`);
    const [client, browser] = Object.values(new WebSocketPair());
    // Workers now defaults binary messages to Blob. The audio codec and bridge
    // expect ArrayBuffer, as the local ws transport does.
    browser.binaryType = 'arraybuffer'; upstream.binaryType = 'arraybuffer';
    browser.accept(); upstream.accept();
    let vision: { url: string; token?: string } | undefined;
    let closed = false;
    const close = (code = 1000, reason = 'connection closed') => {
      if (closed) return; closed = true;
      const safeCode = code === 1000 || (code >= 3000 && code <= 4999) ? code : 1012;
      for (const socket of [browser, upstream]) { try { socket.close(safeCode, reason.slice(0, 100)); } catch {} }
    };
    const send = (socket: WebSocket, data: string | ArrayBuffer) => { try { if (!closed) socket.send(data); } catch { close(1011, 'bridge send failed'); } };
    upstream.addEventListener('message', event => {
      if (typeof event.data !== 'string') { send(browser, event.data); return; }
      let text = event.data;
      try {
        const message = JSON.parse(text);
        if (message.type === 'hello') void report('upstream_hello');
        const capability = message.type === 'mcp' && message.payload?.method === 'initialize' ? message.payload.params?.capabilities?.vision : undefined;
        if (capability?.url) {
          vision = capability; delete message.payload.params.capabilities.vision;
          send(browser, JSON.stringify({ bridge: 'vision_available' })); text = JSON.stringify(message);
        }
      } catch {}
      send(browser, text);
    });
    browser.addEventListener('message', async event => {
      if (typeof event.data === 'string') {
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'hello') await report('browser_hello');
          if (message.bridge === 'ping') { send(browser, JSON.stringify({ bridge: 'pong' })); return; }
          if (message.bridge === 'vision_frame') {
            const reply = { bridge: 'vision_result', requestId: message.requestId, mcpId: message.mcpId, sessionId: message.sessionId };
            try {
              if (!vision || typeof message.image !== 'string') throw new Error('视觉服务未就绪或没有关键帧');
              const bytes = Buffer.from(message.image.replace(/^data:image\/jpeg;base64,/, ''), 'base64');
              if (!bytes.length || bytes.length > 1500000) throw new Error('关键帧大小无效');
              const form = new FormData();
              form.append('question', message.question || '请简短描述动作中最值得调整的一点，不做医疗诊断。');
              form.append('file', new Blob([bytes], { type: 'image/jpeg' }), 'camera.jpg');
              const result = await fetch(vision.url, { method: 'POST', body: form, signal: AbortSignal.timeout(15000), headers: {
                'Device-Id': identity.deviceId, 'Client-Id': identity.clientId,
                ...(vision.token ? { Authorization: `Bearer ${vision.token}` } : {}),
              } });
              if (!result.ok) { send(browser, JSON.stringify({ ...reply, error: `视觉复核返回 HTTP ${result.status}`, retryable: result.status === 429 || result.status >= 500 })); return; }
              const text = await result.text();
              let body; try { body = JSON.parse(text); } catch { body = { success: true, text }; }
              send(browser, JSON.stringify({ ...reply, result: body }));
            } catch (error) { send(browser, JSON.stringify({ ...reply, error: error instanceof Error ? error.message : '视觉复核失败', retryable: false })); }
            return;
          }
        } catch {}
      }
      const size = typeof event.data === 'string' ? event.data.length : event.data.byteLength;
      if (size > 2000000) { close(1009, 'message too large'); return; }
      send(upstream, event.data);
    });
    upstream.addEventListener('close', event => { void report('upstream_closed', event.code); console.warn('[Xiaozhi] upstream close', event.code); close(event.code, 'upstream closed'); });
    browser.addEventListener('close', () => close());
    for (const socket of [browser, upstream]) socket.addEventListener('error', () => { send(browser, JSON.stringify({ bridge: 'error', message: '小智上游连接失败' })); close(1011, 'upstream error'); });
    await report('bridge_ready');
    send(browser, JSON.stringify({ bridge: 'ready' }));
    return new Response(null, { status: 101, webSocket: client });
  } catch (error) { await report('connect_error', error instanceof Error ? error.message : 'unknown'); console.warn('[Xiaozhi] connection failed', error instanceof Error ? error.message : 'unknown'); return Response.json({ error: error instanceof Error ? error.message : '小智连接失败' }, { status: 502 }); }
}
