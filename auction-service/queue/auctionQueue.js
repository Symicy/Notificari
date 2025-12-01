// queue/auctionQueue.js
const { Queue, Worker } = require('bullmq');
const Auction = require('../models/Auction');
const { redisPublisher } = require('../redisClient'); 

// 1. Coada care ține job-urile de expirare
const connection = {
  host: process.env.REDIS_HOST || 'redis-service',
  port: 6379
};

const auctionExpiryQueue = new Queue('auction-expiry', { connection });

// 2. Workerul care procesează job-ul când timpul expiră
const worker = new Worker('auction-expiry', async (job) => {
  const { auctionId } = job.data;
  console.log(` Procesare expirare pentru licitația: ${auctionId}`);

  // Găsim licitația și o marcăm ca inactivă
  const auction = await Auction.findById(auctionId);
  if (auction && auction.isActive) {
    auction.isActive = false;
    await auction.save();

    // 3. Anunțăm pe Redis că licitația s-a încheiat
    const message = JSON.stringify({
      type: 'AUCTION_ENDED',
      auctionId: auction._id,
      winner: auction.highestBidder,
      finalPrice: auction.currentPrice
    });
    
    // Publicăm pe canalul la care ascultă Notification Service
    await redisPublisher.publish('auction-events', message);
  }
}, { connection });

module.exports = { auctionExpiryQueue };