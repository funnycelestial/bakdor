const mongoose = require('mongoose');
const ApiError = require('./apiError');

// Auction ID Resolver
function resolveAuctionQuery(auctionIdOrObjectId) {
  const isObjectId = mongoose.isValidObjectId(auctionIdOrObjectId);
  return isObjectId
    ? { _id: auctionIdOrObjectId }
    : { auctionId: auctionIdOrObjectId };
}

// Seller Projection Helper
const SELLER_PUBLIC_FIELDS = 'anonymousId profile.reputation profile.memberSince walletAddress';

// Business Rule Helpers
function assertOwnership(auction, userId) {
  const sellerId =
    auction.seller?.userId?._id || // populated case
    auction.seller?.userId;        // ObjectId case

  if (!sellerId || sellerId.toString() !== userId.toString()) {
    throw new ApiError(403, 'Not authorized to modify this auction');
  }
}


function assertEditableBeforeStart(auction) {
  if (auction.timing?.startTime && new Date() >= auction.timing.startTime) {
    throw new ApiError(400, 'Cannot modify auction after it has started');
  }
}

// backend/utils/auctionHelpers.js
// Allowed transitions
const allowed = {
  draft: ['pending', 'cancelled'],
  pending: ['active', 'cancelled', 'draft'],   // allow rollback → draft
  active: ['ended', 'cancelled', 'pending'],  // allow rollback → pending
  ended: [],
  cancelled: [],
  suspended: []
};

// Rollback-only transitions (require reason)
const rollbackTransitions = {
  pending: ['draft'],
  active: ['pending']
};

function assertTransitionAllowed(from, to, options = {}) {
  const { reason, customMessage } = options;

  if (!(allowed[from] || []).includes(to)) {
    throw new ApiError(400, `Invalid status transition: ${from} → ${to}`);
  }

  // Block any transitions from final states
  if (['ended','cancelled'].includes(from)) {
    throw new ApiError(400, `Auction is ${from} and cannot transition`);
  }

  // If transition is rollback, enforce reason
  if ((rollbackTransitions[from] || []).includes(to)) {
    if (!reason) {
      throw new ApiError(
        400,
        `Rollback from ${from} → ${to} requires a reason (enum or custom message)`
      );
    }
  }
}



module.exports = {
  resolveAuctionQuery,
  SELLER_PUBLIC_FIELDS,
  assertOwnership,
  assertEditableBeforeStart,
  assertTransitionAllowed
};