// models/Auction.js
const mongoose = require('mongoose');

const auctionSchema = new mongoose.Schema({
  title: { type: String, required: true },
  startPrice: { type: Number, required: true },
  currentPrice: { type: Number, required: true },
  highestBidder: { type: String, default: null }, // Numele userului sau ID-ul
  endTime: { type: Date, required: true },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Auction', auctionSchema);