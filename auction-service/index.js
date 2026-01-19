require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { randomUUID } = require('crypto');
const { redisPublisher } = require('./config/redisClient');
const { auctionExpiryQueue } = require('./queue/auctionQueue');
const Auction = require('./models/Auction');
const Bid = require('./models/Bid');
const User = require('./models/User');
const { authenticateToken, requireAdmin, generateToken } = require('./middleware/auth');

const app = express();
app.use(cors());
app.use(express.json());

// Health/readiness state
let isReady = false;

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/auctiondb';
const EVENT_CHANNEL = 'auction.events.v1';
const MIN_BID_INCREMENT = Number(process.env.MIN_BID_INCREMENT || 1);

const publishEvent = async (type, payload, traceId) => {
    const envelope = {
        eventId: randomUUID(),
        type,
        occurredAt: new Date().toISOString(),
        traceId,
        payload,
    };
    await redisPublisher.publish(EVENT_CHANNEL, JSON.stringify(envelope));
};

const scheduleExpiry = async (auction) => {
    const delay = new Date(auction.endTime).getTime() - Date.now();
    if (delay <= 0) return;
    await auctionExpiryQueue.add(
        'expire-auction',
        { auctionId: auction._id.toString() },
        {
            jobId: auction._id.toString(),
            delay,
            removeOnComplete: true,
            removeOnFail: 1000
        }
    );
};

mongoose.connect(MONGO_URI).then(async () => {
    console.log("Mongo Connected");
    
    // Creează admin default dacă nu există
    const adminExists = await User.findOne({ role: 'admin' });
    if (!adminExists) {
        await User.create({
            username: 'admin',
            email: 'admin@auction.com',
            password: 'admin123',
            role: 'admin'
        });
        console.log('Admin default creat: admin / admin123');
    }

    // Re-schedule expiries for active auctions on startup
    const activeAuctions = await Auction.find({ isActive: true, endTime: { $gt: new Date() } });
    for (const auction of activeAuctions) {
        await scheduleExpiry(auction);
    }

    isReady = true;
});

// ==================== AUTH ROUTES ====================

// Register
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        
        // Verifică dacă user-ul există
        const existingUser = await User.findOne({ $or: [{ email }, { username }] });
        if (existingUser) {
            return res.status(400).json({ error: 'Username sau email deja folosit' });
        }
        
        const user = new User({ username, email, password });
        await user.save();
        
        const token = generateToken(user);
        res.json({ token, user: { id: user._id, username: user.username, role: user.role } });
    } catch (err) {
        res.status(500).json({ error: 'Eroare la înregistrare' });
    }
});

// Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(401).json({ error: 'Credențiale invalide' });
        }
        
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ error: 'Credențiale invalide' });
        }
        
        const token = generateToken(user);
        res.json({ token, user: { id: user._id, username: user.username, role: user.role } });
    } catch (err) {
        res.status(500).json({ error: 'Eroare la autentificare' });
    }
});

// Get current user
app.get('/api/auth/me', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        res.json(user);
    } catch (err) {
        res.status(500).json({ error: 'Eroare' });
    }
});

// ==================== AUCTION ROUTES ====================

// POST: Plasează o ofertă (necesită autentificare)
app.post('/api/auctions/:id/bid', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { amount, version: expectedVersionBody } = req.body;
    const bidder = req.user.username;

    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
        return res.status(400).json({ error: "Introdu o sumă validă" });
    }

    // Verifică licitația și regulile înainte de update atomic
    const auction = await Auction.findById(id);
    if (!auction) {
        return res.status(404).json({ error: "Licitația nu a fost găsită" });
    }
    if (!auction.isActive) {
        return res.status(400).json({ error: "Licitația nu mai este activă" });
    }
    if (new Date(auction.endTime) <= new Date()) {
        return res.status(400).json({ error: "Licitația s-a încheiat" });
    }

    const minRequired = Number(auction.currentPrice) + MIN_BID_INCREMENT;
    if (numericAmount < minRequired) {
        return res.status(400).json({ error: `Oferta minimă trebuie să fie cel puțin ${minRequired}` });
    }

    const expectedVersion = Number.isInteger(expectedVersionBody) ? expectedVersionBody : auction.__v;

    // Update atomic + increment versiune pentru O.C.C.
    const updatedAuction = await Auction.findOneAndUpdate(
        {
            _id: id,
            isActive: true,
            endTime: { $gt: new Date() },
            currentPrice: { $lt: numericAmount },
            __v: expectedVersion
        },
        {
            $set: { currentPrice: numericAmount, highestBidder: bidder },
            $addToSet: { bidders: bidder },
            $inc: { __v: 1 }
        },
        { new: true }
    );

    if (!updatedAuction) {
        return res.status(409).json({ error: "Ofertă concurentă sau preț prea mic - reîncarcă și încearcă din nou" });
    }

    // Persistăm istoricul ofertelor
    await Bid.create({ auctionId: id, bidder, amount: numericAmount });

    // 2. PUBLICĂ EVENIMENTUL ÎN REDIS
    await publishEvent('BID_PLACED', {
        auctionId: id,
        amount: numericAmount,
        bidder: bidder,
        bidders: updatedAuction.bidders,
        version: updatedAuction.__v
    });

    res.json(updatedAuction);
});

// GET: Listează licitații (public)
app.get('/api/auctions', async (req, res) => {
    const auctions = await Auction.find({ isActive: true }).sort({ createdAt: -1 });
    res.json(auctions);
});

// POST: Creare licitație (doar admin)
app.post('/api/auctions', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { title, startPrice, endTime } = req.body;
        const auction = new Auction({
            title,
            startPrice: startPrice || 0,
            currentPrice: startPrice || 0,
            endTime: endTime || new Date(Date.now() + 24*60*60*1000),
            createdBy: req.user.id
        });
        await auction.save();

        // Programează expirarea licitației
        await scheduleExpiry(auction);
        
        // Publică eveniment pentru actualizare automată
        await publishEvent('AUCTION_CREATED', { auction });
        
        res.json(auction);
    } catch (err) {
        res.status(500).json({ error: 'Eroare la creare licitație' });
    }
});

// DELETE: Șterge licitație (doar admin)
app.delete('/api/auctions/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        await Auction.findByIdAndDelete(req.params.id);

        // Publică eveniment pentru actualizare automată
        await publishEvent('AUCTION_DELETED', { auctionId: req.params.id });

        res.json({ message: 'Licitație ștearsă' });
    } catch (err) {
        res.status(500).json({ error: 'Eroare la ștergere' });
    }
});

// Endpoint pentru sincronizare timp server
app.get('/api/time', (req, res) => {
    res.json({ serverTime: Date.now() });
});

// Health and readiness endpoints
app.get('/healthz', (_req, res) => res.status(200).send('ok'));
app.get('/readyz', (_req, res) => (isReady ? res.status(200).send('ok') : res.status(503).send('not ready')));

// Endpoint pentru seed - adaugă date de test
app.post('/api/seed', async (req, res) => {
    const count = await Auction.countDocuments();
    if (count > 0) {
        return res.json({ message: 'Datele există deja' });
    }
    
    const seedData = [
        { title: 'iPhone 15 Pro', startPrice: 500, currentPrice: 500, endTime: new Date(Date.now() + 24*60*60*1000) },
        { title: 'MacBook Air M2', startPrice: 800, currentPrice: 800, endTime: new Date(Date.now() + 24*60*60*1000) },
        { title: 'PlayStation 5', startPrice: 300, currentPrice: 300, endTime: new Date(Date.now() + 24*60*60*1000) },
    ];
    
    await Auction.insertMany(seedData);
    res.json({ message: 'Date de test adăugate!' });
});

const server = app.listen(3000, () => console.log('Auction Service running on 3000'));

const shutdown = async () => {
    console.log('Shutting down gracefully...');
    isReady = false;
    server.close(() => {
        console.log('HTTP server closed');
    });
    await mongoose.connection.close();
    if (redisPublisher.isOpen) {
        await redisPublisher.quit();
    }
    process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);