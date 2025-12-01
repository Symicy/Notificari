require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { redisPublisher } = require('./config/redisClient');
const Auction = require('./models/Auction');
const User = require('./models/User');
const { authenticateToken, requireAdmin, generateToken } = require('./middleware/auth');

const app = express();
app.use(cors());
app.use(express.json());

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/auctiondb';

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
    const { amount } = req.body;
    const bidder = req.user.username;

    // 1. Update Atomic în baza de date + adaugă bidder în lista de participanți
    const updatedAuction = await Auction.findOneAndUpdate(
        { _id: id, currentPrice: { $lt: amount }, isActive: true },
        { 
            $set: { currentPrice: amount, highestBidder: bidder },
            $addToSet: { bidders: bidder } // Adaugă în array doar dacă nu există deja
        },
        { new: true }
    );

    if (!updatedAuction) return res.status(400).json({ error: "Ofertă invalidă sau preț prea mic" });

    // 2. PUBLICĂ EVENIMENTUL ÎN REDIS
    const eventMessage = {
        type: 'BID_UPDATE',
        auctionId: id,
        amount: amount,
        bidder: bidder,
        bidders: updatedAuction.bidders
    };
    await redisPublisher.publish('auction-updates', JSON.stringify(eventMessage));

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
        
        // Publică eveniment pentru actualizare automată
        await redisPublisher.publish('auction-updates', JSON.stringify({
            type: 'AUCTION_CREATED',
            auction: auction
        }));
        
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
        await redisPublisher.publish('auction-updates', JSON.stringify({
            type: 'AUCTION_DELETED',
            auctionId: req.params.id
        }));
        
        res.json({ message: 'Licitație ștearsă' });
    } catch (err) {
        res.status(500).json({ error: 'Eroare la ștergere' });
    }
});

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

app.listen(3000, () => console.log('Auction Service running on 3000'));