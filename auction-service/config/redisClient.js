const { createClient } = require('redis');

// URL-ul vine din K8s sau default localhost
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

const redisPublisher = createClient({ url: redisUrl });

redisPublisher.on('error', (err) => console.error('Redis Pub Error:', err));

(async () => {
    if (!redisPublisher.isOpen) await redisPublisher.connect();
})();

module.exports = { redisPublisher };