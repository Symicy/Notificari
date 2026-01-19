const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { createClient } = require('redis');
const { createAdapter } = require('@socket.io/redis-adapter');

const app = express();
const server = http.createServer(app);
let isReady = false;

// Configurare Redis
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const pubClient = createClient({ url: redisUrl });
const subClient = pubClient.duplicate();

const EVENT_CHANNEL = 'auction.events.v1';
const DEAD_LETTER_KEY = 'auction.events.deadletter';
const ALLOWED_TYPES = new Set(['BID_PLACED', 'AUCTION_CREATED', 'AUCTION_DELETED', 'AUCTION_ENDED']);

const io = new Server(server, {
    cors: { origin: "*" },
    path: '/socket.io' // Important pentru Ingress
});

Promise.all([pubClient.connect(), subClient.connect()]).then(() => {
    // 1. Conectăm Adaptorul Redis pentru Socket.io (Scalare orizontală)
    io.adapter(createAdapter(pubClient, subClient));
    
    // 2. Ascultăm evenimentele de la Auction-Service
    const subscriber = pubClient.duplicate();
    subscriber.connect().then(() => {
        subscriber.subscribe(EVENT_CHANNEL, async (message) => {
            let envelope;
            try {
                envelope = JSON.parse(message);
            } catch (err) {
                await pubClient.lPush(DEAD_LETTER_KEY, JSON.stringify({ reason: 'parse_error', raw: message, at: new Date().toISOString() }));
                return;
            }

            const isValidEnvelope = envelope
                && typeof envelope.eventId === 'string'
                && typeof envelope.type === 'string'
                && ALLOWED_TYPES.has(envelope.type)
                && typeof envelope.occurredAt === 'string'
                && envelope.payload !== undefined;

            if (!isValidEnvelope) {
                await pubClient.lPush(DEAD_LETTER_KEY, JSON.stringify({ reason: 'schema_invalid', raw: envelope, at: new Date().toISOString() }));
                return;
            }

            const { type, payload } = envelope;
            console.log("Mesaj valid din Redis:", envelope);

            switch(type) {
                case 'BID_PLACED':
                    io.emit('price_update', payload);
                    break;
                case 'AUCTION_CREATED':
                    io.emit('auction_created', payload.auction);
                    break;
                case 'AUCTION_DELETED':
                    io.emit('auction_deleted', payload.auctionId);
                    break;
                case 'AUCTION_ENDED':
                    io.emit('auction_ended', payload);
                    break;
                default:
                    await pubClient.lPush(DEAD_LETTER_KEY, JSON.stringify({ reason: 'unknown_type', raw: envelope, at: new Date().toISOString() }));
            }
        });
    });
    isReady = true;
});

io.on('connection', (socket) => {
    console.log('Client conectat:', socket.id);
    
    // Trimite imediat timpul serverului la conectare
    socket.emit('server_time', { serverTime: Date.now() });
    
    socket.on('join_auction', (auctionId) => {
        socket.join(auctionId);
    });
});

// Broadcast timpul serverului la toți clienții la fiecare secundă
// Toți clienții primesc EXACT același timestamp în același moment
setInterval(() => {
    io.emit('server_time', { serverTime: Date.now() });
}, 1000);

app.get('/healthz', (_req, res) => res.status(200).send('ok'));
app.get('/readyz', (_req, res) => (isReady ? res.status(200).send('ok') : res.status(503).send('not ready')));

server.listen(4000, () => console.log('Notification Service pe port 4000'));

const shutdown = async () => {
    console.log('Shutting down notification service...');
    isReady = false;
    server.close(() => console.log('HTTP server closed'));
    try {
        await subscriber?.unsubscribe?.(EVENT_CHANNEL);
        await subscriber?.quit?.();
    } catch (e) {
        console.error('Error closing subscriber', e);
    }
    try {
        if (io) io.close();
    } catch (e) {
        console.error('Error closing socket.io', e);
    }
    try {
        if (pubClient.isOpen) await pubClient.quit();
        if (subClient.isOpen) await subClient.quit();
    } catch (e) {
        console.error('Error closing redis clients', e);
    }
    process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);