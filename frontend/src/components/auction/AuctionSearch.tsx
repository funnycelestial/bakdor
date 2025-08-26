import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiService, Auction } from '@/lib/api';
import { AuctionCard } from './AuctionCard';
import { formatTokenAmount } from '@/utils/formatters';
import { toast } from 'sonner';

export const AuctionSearch = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Auction[]>([]);
  const [categories, setCategories] = useState<Array<{ name: string; count: number }>>([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [priceRange, setPriceRange] = useState({ min: '', max: '' });
  const [auctionType, setAuctionType] = useState('all');
  const [isSearching, setIsSearching] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      const response = await apiService.getAuctionCategories();
      setCategories(response.data.categories);
    } catch (error) {
      console.error('Failed to load categories:', error);
      // Mock categories for demo
      setCategories([
        { name: 'electronics', count: 23 },
        { name: 'fashion', count: 15 },
        { name: 'home-garden', count: 8 },
        { name: 'sports', count: 12 },
        { name: 'automotive', count: 6 },
        { name: 'books', count: 4 },
        { name: 'art', count: 9 },
        { name: 'collectibles', count: 7 }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      toast.error('Please enter a search term');
      return;
    }

    setIsSearching(true);
    try {
      const filters: any = {};
      if (selectedCategory) filters.category = selectedCategory;
      if (priceRange.min) filters.priceMin = parseFloat(priceRange.min);
      if (priceRange.max) filters.priceMax = parseFloat(priceRange.max);
      if (auctionType && auctionType !== 'all') filters.type = auctionType;

      const response = await apiService.searchAuctions(searchQuery, filters);
      setSearchResults(response.data.auctions);
      
      toast.success(`Found ${response.data.auctions.length} auctions`);
    } catch (error: any) {
      console.error('Search failed:', error);
      toast.error(error.message || 'Search failed');
    } finally {
      setIsSearching(false);
    }
  };

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedCategory('all');
    setPriceRange({ min: '', max: '' });
    setAuctionType('all');
    setSearchResults([]);
  };

  return (
    <div className="space-y-4">
      {/* Search Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-terminal-green">Search Auctions</h3>
        <Badge variant="outline" className="text-terminal-green border-terminal-green">
          ADVANCED SEARCH
        </Badge>
      </div>

      {/* Search Interface */}
      <Card className="border-panel-border bg-card/50 p-4">
        <div className="space-y-4">
          {/* Search Input */}
          <div className="flex gap-2">
            <Input
              placeholder="Search auctions, brands, models..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              className="flex-1 bg-background border-panel-border focus:border-terminal-green"
            />
            <Button
              onClick={handleSearch}
              disabled={isSearching || !searchQuery.trim()}
              className="bg-terminal-green text-background hover:bg-terminal-green/80"
            >
              {isSearching ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-background border-t-transparent rounded-full animate-spin"></div>
                  Searching...
                </div>
              ) : (
                '🔍 Search'
              )}
            </Button>
          </div>

          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="bg-background border-panel-border">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category.name} value={category.name}>
                    {category.name.charAt(0).toUpperCase() + category.name.slice(1)} ({category.count})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={auctionType} onValueChange={setAuctionType}>
              <SelectTrigger className="bg-background border-panel-border">
                <SelectValue placeholder="Auction Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="forward">Forward Auction</SelectItem>
                <SelectItem value="reverse">Reverse Auction</SelectItem>
              </SelectContent>
            </Select>

            <Input
              placeholder="Min Price (WKC)"
              type="number"
              value={priceRange.min}
              onChange={(e) => setPriceRange(prev => ({ ...prev, min: e.target.value }))}
              className="bg-background border-panel-border"
            />

            <Input
              placeholder="Max Price (WKC)"
              type="number"
              value={priceRange.max}
              onChange={(e) => setPriceRange(prev => ({ ...prev, max: e.target.value }))}
              className="bg-background border-panel-border"
            />
          </div>

          {/* Filter Actions */}
          <div className="flex gap-2">
            <Button
              onClick={clearFilters}
              variant="outline"
              size="sm"
              className="text-xs border-panel-border"
            >
              Clear Filters
            </Button>
            <Badge variant="outline" className="text-xs">
              {searchResults.length} Results
            </Badge>
          </div>
        </div>
      </Card>

      {/* Search Results */}
      {searchResults.length > 0 && (
        <Card className="border-panel-border bg-card/50 p-4">
          <h4 className="text-sm font-medium text-foreground mb-3">Search Results</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {searchResults.map((auction) => (
              <div key={auction.auctionId} className="border border-panel-border bg-secondary/20 p-3 rounded hover:bg-secondary/30 transition-all">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground truncate">{auction.title}</span>
                    {auction.type === 'reverse' && (
                      <Badge className="bg-terminal-amber/20 text-terminal-amber text-xs">REV</Badge>
                    )}
                  </div>
                  
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{auction.category}</span>
                    <span className="text-muted-foreground">{auction.bidding.totalBids} bids</span>
                  </div>
                  
                  <div className="flex justify-between text-xs">
                    <span className="text-terminal-green">
                      {formatTokenAmount(auction.pricing.currentBid.toString())} WKC
                    </span>
                    <span className="text-terminal-red">
                      {formatTimeRemaining(Math.floor(new Date(auction.timing.endTime).getTime() / 1000))}
                    </span>
                  </div>
                  
                  <div className="flex gap-2 mt-2">
                    <button className="flex-1 bg-secondary hover:bg-accent px-2 py-1 text-xs transition-colors">
                      Watch
                    </button>
                    <button className="flex-1 bg-primary hover:bg-primary/80 px-2 py-1 text-xs text-primary-foreground transition-colors">
                      {auction.type === 'reverse' ? 'Quote' : 'Bid'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Categories Overview */}
      {!isLoading && (
        <Card className="border-panel-border bg-card/50 p-4">
          <h4 className="text-sm font-medium text-foreground mb-3">Browse by Category</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {categories.map((category) => (
              <button
                key={category.name}
                onClick={() => {
                  setSelectedCategory(category.name);
                  setSearchQuery(category.name);
                  handleSearch();
                }}
                className="p-2 border border-panel-border bg-secondary/20 hover:bg-secondary/30 rounded text-xs transition-all"
              >
                <div className="text-foreground font-medium capitalize">{category.name}</div>
                <div className="text-muted-foreground">{category.count} items</div>
              </button>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};