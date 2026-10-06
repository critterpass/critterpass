// Centrifugo connection load: ramps to TARGET_CONNECTIONS WebSocket clients (default 10,000) that
// connect with real `rt` tokens, answer server pings and hold for HOLD. Thresholds are the launch
// SLO: 99 % of connects succeed and p95 connect time stays under a second.
//
//   pnpm tsx tools/scripts/load/prepare-rt-tokens.ts --accounts 200 --out rt-tokens.json
//   k6 run -e RT_URL=wss://centrifugo-staging-652b.up.railway.app/connection/websocket \
//     -e TOKENS=rt-tokens.json -e TARGET_CONNECTIONS=10000 tools/scripts/load/centrifugo.k6.js
/* global open, __ENV, __VU -- k6 runtime globals */
import { check } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import ws from 'k6/ws';

const tokens = JSON.parse(open(__ENV.TOKENS || 'rt-tokens.json'));
const target = Number(__ENV.TARGET_CONNECTIONS || 10000);
const hold = __ENV.HOLD || '5m';

const connectOk = new Rate('rt_connect_ok');
const connectMs = new Trend('rt_connect_ms', true);
const disconnects = new Counter('rt_unexpected_disconnects');

export const options = {
  scenarios: {
    connections: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '5m', target },
        { duration: hold, target },
        { duration: '1m', target: 0 },
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    rt_connect_ok: ['rate>0.99'],
    rt_connect_ms: ['p(95)<1000'],
  },
};

// k6 runs the default export once per virtual user iteration.
// eslint-disable-next-line no-restricted-syntax
export default function () {
  const token = tokens[(__VU - 1) % tokens.length];
  const started = Date.now();
  let connected = false;
  let closing = false;
  const res = ws.connect(__ENV.RT_URL, {}, (socket) => {
    socket.on('open', () => socket.send(JSON.stringify({ id: 1, connect: { token, name: 'k6' } })));
    socket.on('message', (raw) => {
      // Centrifugo batches replies with newlines; an empty object is a ping that needs a pong.
      for (const line of String(raw).split('\n')) {
        if (!line) continue;
        if (line === '{}') {
          socket.send('{}');
          continue;
        }
        const reply = JSON.parse(line);
        if (reply.id === 1) {
          connected = Boolean(reply.connect);
          connectOk.add(connected);
          connectMs.add(Date.now() - started);
          if (!connected) {
            closing = true;
            socket.close();
          }
        }
      }
    });
    socket.on('close', () => {
      if (connected && !closing) disconnects.add(1);
    });
    socket.setTimeout(() => {
      closing = true;
      socket.close();
    }, 60_000);
  });
  check(res, { 'upgraded to websocket': (r) => r && r.status === 101 });
}
