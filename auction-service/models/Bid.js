const mongoose = require('mongoose');

const bidSchema = new mongoose.Schema({
  auctionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Auction', required: true, index: true },
  bidder: { type: String, required: true },
  amount: { type: Number, required: true },
  placedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Bid', bidSchema);
