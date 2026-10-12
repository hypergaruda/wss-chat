'use strict';
const http = require('http');
const WebSocket = require('ws');

const HOST = '0.0.0.0';
const PORT = 3001;
const clients = new Map();
const lastSent = new WeakMap();

const server = http.createServer((req, res) => {
  res.writeHead(200, {'Content-Type':'text/plain; charset=utf-8'});
  res.end('LiveLab chat WebSocket is running.\n');
});

const wss = new WebSocket.Server({ server });

function clean(v, max) {
  return String(v ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, max);
}
function validRoom(room) { 
  return /^[A-Za-z0-9_-]{3,40}$/.test(room); 
}
function send(ws, obj) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}
function broadcast(room, obj) {
  for (const [ws, c] of clients) {
    if (c.room === room) send(ws, obj);
  }
}
function countViewers(room) {
  let n = 0;
  for (const c of clients.values()) if (c.room === room) n++;
  return n;
}

wss.on('connection', (ws, req) => {
  const origin = req.headers.origin || '';
  const allowed = new Set([
    'http://localhost',
    'http://127.0.0.1',
    'https://hypergaruda.com',
  ]);

  ws.on('message', raw => {
    let data;
    try { data = JSON.parse(raw.toString()); }
    catch { send(ws, {type:'error', message:'Format pesan tidak valid.'}); return; }
    if (data.type === 'join') {
      const room = clean(data.room, 40);
      const name = clean(data.name, 32) || 'Tamu';
      
      if (!validRoom(room)) {
        send(ws, {type:'error', message:'Nama room tidak valid.'});
        ws.close(1008);
        return;
      }
      
      clients.set(ws, {room, name});
      const viewers = countViewers(room);
      broadcast(room, {type:'viewers', count: viewers});
      const joinMsg = `${name} bergabung ke chat.`;
      broadcast(room, {
        type:'system',
        text: joinMsg,
        message: joinMsg,
        time: new Date().toISOString()
      });
      return;
    }
    const c = clients.get(ws);
    if (!c) {
      send(ws, {type:'error', message:'Gabung ke room terlebih dahulu.'});
      return;
    }
    if (data.type !== 'chat') return;
    const now = Date.now();
    if (now - (lastSent.get(ws) || 0) < 600) {
      send(ws, {type:'error', message:'Terlalu cepat. Tunggu sebentar.'});
      return;
    }

    const text = clean(data.text || data.message, 500);
    if (!text) return;
    
    lastSent.set(ws, now);

    const item = {
      type: 'chat',
      room: c.room,
      name: c.name,
      text: text,
      message: text,
      time: new Date().toISOString()
    };
    broadcast(c.room, item);
  });

  ws.on('close', () => {
    const c = clients.get(ws);
    clients.delete(ws);
    if (c) {
      const leaveMsg = `${c.name} keluar dari chat.`;
      broadcast(c.room, {
        type:'system',
        text: leaveMsg,
        message: leaveMsg,
        time: new Date().toISOString()
      });
      broadcast(c.room, {type:'viewers', count: countViewers(c.room)});
    }
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Listening on ws://${HOST}:${PORT}`);
  console.log('Mode: RAM-only.');
});
