// queue/auctionQueue.js
const { Queue, Worker } = require('bullmq');
const { randomUUID } = require('crypto');
const { redisPublisher } = require('../config/redisClient');
const Auction = require('../models/Auction');

// Parse Redis connection (supports REDIS_URL or host/port)
const redisUrl = process.env.REDIS_URL || 'redis://redis-service:6379';
const parsed = new URL(redisUrl);
const connection = {
  host: parsed.hostname,
  port: parsed.port ? Number(parsed.port) : 6379
};

const QUEUE_NAME = 'auction-expiry';
const EVENT_CHANNEL = 'auction.events.v1';

// Shared queue instance for scheduling expiry jobs
const auctionExpiryQueue = new Queue(QUEUE_NAME, { connection });

// Worker factory so the API process can stay lightweight; the worker runs in its own process
const createAuctionExpiryWorker = () => new Worker(
  QUEUE_NAME,
  async (job) => {
    const { auctionId } = job.data;
    console.log(`Procesare expirare pentru licitația: ${auctionId}`);

    // Marcăm licitația ca inactivă doar dacă este încă activă
    const auction = await Auction.findOneAndUpdate(
      { _id: auctionId, isActive: true },
      { isActive: false },
      { new: true }
    );

    if (!auction) return;

    // Publicăm eveniment de finalizare pe canalul unificat
    const envelope = {
      eventId: randomUUID(),
      type: 'AUCTION_ENDED',
      occurredAt: new Date().toISOString(),
      payload: {
        auctionId: auction._id,
        winner: auction.highestBidder,
        finalPrice: auction.currentPrice
      }
    };

    await redisPublisher.publish(EVENT_CHANNEL, JSON.stringify(envelope));
  },
  { connection }
);

module.exports = { auctionExpiryQueue, createAuctionExpiryWorker };