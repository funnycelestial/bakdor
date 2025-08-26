import { useState, useEffect, useCallback } from 'react';
import { apiService, Auction } from '@/lib/api';
import { useWebSocket } from './useWebSocket';
import { formatTokenAmount } from '@/utils/formatters';
import { toast } from 'sonner';

export function useAuction(auctionId: string) {
  const [auction, setAuction] = useState<Auction | null>(null);
  const [recentBids, setRecentBids] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const { isConnected, on, off, emit } = useWebSocket();

  const loadAuction = useCallback(async () => {
    if (!auctionId) return;

    try {
      setIsLoading(true);
      setError(null);

      const [auctionResponse, bidsResponse] = await Promise.all([
        apiService.getAuction(auctionId),
        apiService.request(`/auctions/${auctionId}/bids?limit=20`)
      ]);

      setAuction(auctionResponse.data.auction);
      setRecentBids(bidsResponse.data.bids);
    } catch (err: any) {
      setError(err.message || 'Failed to load auction');
      console.error('Failed to load auction:', err);
    } finally {
      setIsLoading(false);
    }
  }, [auctionId]);

  useEffect(() => {
    loadAuction();
  }, [loadAuction]);

  useEffect(() => {
    if (!isConnected || !auctionId) return;

    // Join auction room for real-time updates
    emit('join_auction', auctionId);

    // Listen for bid updates
    const handleBidUpdate = (data: any) => {
      if (data.auctionId === auctionId) {
        setAuction(prev => prev ? {
          ...prev,
          pricing: { ...prev.pricing, currentBid: parseFloat(data.amount) },
          bidding: { ...prev.bidding, totalBids: prev.bidding.totalBids + 1 }
        } : null);

        setRecentBids(prev => [{
          bidder: { anonymousId: data.bidder },
          amount: parseFloat(data.amount),
          timing: { placedAt: new Date().toISOString() },
          status: 'active'
        }, ...prev.slice(0, 19)]);
      }
    };

    // Listen for auction end
    const handleAuctionEnd = (data: any) => {
      if (data.auctionId === auctionId) {
        setAuction(prev => prev ? { ...prev, status: 'ended' } : null);
        toast.success('Auction has ended!');
      }
    };

    // Listen for auction extension
    const handleAuctionExtension = (data: any) => {
      if (data.auctionId === auctionId) {
        setAuction(prev => prev ? {
          ...prev,
          timing: { ...prev.timing, endTime: data.newEndTime }
        } : null);
        toast.info('Auction extended by 5 minutes');
      }
    };

    on('bid_update', handleBidUpdate);
    on('auction_ended', handleAuctionEnd);
    on('auction_extended', handleAuctionExtension);

    return () => {
      off('bid_update', handleBidUpdate);
      off('auction_ended', handleAuctionEnd);
      off('auction_extended', handleAuctionExtension);
      emit('leave_auction', auctionId);
    };
  }, [isConnected, auctionId, on, off, emit]);

  const placeBid = async (amount: number) => {
    if (!auction) throw new Error('No auction loaded');

    try {
      await apiService.placeBid(auction.id, amount);
      
      // Optimistically update local state
      setAuction(prev => prev ? {
        ...prev,
        pricing: { ...prev.pricing, currentBid: amount },
        bidding: { ...prev.bidding, totalBids: prev.bidding.totalBids + 1 }
      } : null);

      return true;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to place bid');
    }
  };

  const watchAuction = async () => {
    if (!auction) return;

    try {
      if (auction.isWatching) {
        await apiService.unwatchAuction(auction.id);
        setAuction(prev => prev ? { ...prev, isWatching: false } : null);
        toast.info('Removed from watchlist');
      } else {
        await apiService.watchAuction(auction.id);
        setAuction(prev => prev ? { ...prev, isWatching: true } : null);
        toast.success('Added to watchlist');
      }
    } catch (error: any) {
      throw new Error(error.message || 'Failed to update watchlist');
    }
  };

  const refreshAuction = () => {
    loadAuction();
  };

  return {
    auction,
    recentBids,
    isLoading,
    error,
    placeBid,
    watchAuction,
    refreshAuction
  };
}