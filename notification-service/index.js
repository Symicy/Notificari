const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { createClient } = require('redis');
const { createAdapter } = require('@socket.io/redis-adapter');

const app = express();
const server = http.createServer(app);

// Configurare Redis
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const pubClient = createClient({ url: redisUrl });
const subClient = pubClient.duplicate();

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
        subscriber.subscribe('auction-updates', (message) => {
            const data = JSON.parse(message);
            console.log("Mesaj primit din Redis:", data);
            
            // Emite evenimente diferite în funcție de tip
            switch(data.type) {
                case 'BID_UPDATE':
                    io.emit('price_update', data);
                    break;
                case 'AUCTION_CREATED':
                    io.emit('auction_created', data.auction);
                    break;
                case 'AUCTION_DELETED':
                    io.emit('auction_deleted', data.auctionId);
                    break;
                default:
                    io.emit('price_update', data);
            }
        });
    });
});

io.on('connection', (socket) => {
    console.log('Client conectat:', socket.id);
    
    socket.on('join_auction', (auctionId) => {
        socket.join(auctionId);
    });
});

server.listen(4000, () => console.log('Notification Service pe port 4000'));