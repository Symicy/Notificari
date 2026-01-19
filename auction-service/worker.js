require('dotenv').config();
const mongoose = require('mongoose');
const { createAuctionExpiryWorker } = require('./queue/auctionQueue');
const { redisPublisher } = require('./config/redisClient');
const Auction = require('./models/Auction');
const { randomUUID } = require('crypto');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/auctiondb';
const EVENT_CHANNEL = 'auction.events.v1';

let worker;

async function reconcileExpiredAuctions() {
    const now = new Date();
    const expired = await Auction.find({ isActive: true, endTime: { $lte: now } });
    for (const auction of expired) {
        auction.isActive = false;
        await auction.save();

        const message = JSON.stringify({
            eventId: randomUUID(),
            type: 'AUCTION_ENDED',
            occurredAt: new Date().toISOString(),
            payload: {
                auctionId: auction._id,
                winner: auction.highestBidder,
                finalPrice: auction.currentPrice
            }
        });
        await redisPublisher.publish(EVENT_CHANNEL, message);
        console.log(`Reconciled expired auction ${auction._id}`);
    }
}

async function start() {
    await mongoose.connect(MONGO_URI);
    console.log('Worker connected to Mongo');

    // Ensure Redis publisher is ready
    if (!redisPublisher.isOpen) {
        await redisPublisher.connect();
    }

    await reconcileExpiredAuctions();

    worker = createAuctionExpiryWorker();
    worker.on('completed', (job) => console.log(`Job ${job.id} completed`));
    worker.on('failed', (job, err) => console.error(`Job ${job?.id} failed`, err));

    console.log('Auction expiry worker started');
}

async function shutdown() {
    console.log('Shutting down worker...');
    if (worker) {
        await worker.close();
    }
    await mongoose.connection.close();
    if (redisPublisher.isOpen) {
        await redisPublisher.quit();
    }
    process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

start().catch((err) => {
    console.error('Worker failed to start', err);
    process.exit(1);
});
