// models/Auction.js
const mongoose = require('mongoose');

const auctionSchema = new mongoose.Schema({
  title: { type: String, required: true },
  startPrice: { type: Number, required: true },
  currentPrice: { type: Number, required: true },
  highestBidder: { type: String, default: null },
  bidders: [{ type: String }], // Lista tuturor userilor care au licitat
  endTime: { type: Date, required: true },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
}, { versionKey: '__v' });

module.exports = mongoose.model('Auction', auctionSchema);