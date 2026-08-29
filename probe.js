// Probe con handshake "gateway-client" backend
const WebSocket = require('ws');
const crypto = require('crypto');

const URL = 'ws://127.0.0.1:18789';
const TOKEN = '';

const ws = new WebSocket(URL);

ws.on('open', () => console.log('OPEN'));

ws.on('message', (d) => {
  const msg = JSON.parse(d.toString());
  const out = JSON.stringify(msg);
  console.log('MSG:', out.slice(0, 500));

  if (msg.event === 'connect.challenge') {
    const connectFrame = {
      type: 'req',
      id: '1',
      method: 'connect',
      params: {
        minProtocol: 4,
        maxProtocol: 4,
        client: {
          id: 'gateway-client',
          version: '0.1.0',
          platform: process.platform,
          mode: 'backend',
        },
        role: 'operator',
        scopes: ['operator.admin', 'operator.read', 'operator.write'],
        caps: [],
        commands: [],
        permissions: {},
        auth: { token: TOKEN },
        locale: 'es-UY',
        userAgent: 'clawgs-wc/0.1.0',
      },
    };
    ws.send(JSON.stringify(connectFrame));
    console.log('SENT connect handshake');
  }

  if (msg.type === 'res') {
    if (msg.ok) {
      console.log('--- HELLO OK ---');
      setTimeout(() => {
        try {
          ws.send(JSON.stringify({
            type: 'req',
            id: '2',
            method: 'agent',
            params: { message: 'Decime hola en una linea' },
          }));
          console.log('SENT agent message');
        } catch (e) { console.log('err:', e.message); }
      }, 500);
    } else {
      console.log('--- AUTH ERROR ---');
    }
  }
});

ws.on('close', (c, r) => { console.log(`CLOSE code=${c} reason=${r.toString()}`); process.exit(0); });
ws.on('error', (e) => console.log('ERR:', e.message));

setTimeout(() => { try { console.log('TIMEOUT'); ws.close(); } catch {} }, 15000);
