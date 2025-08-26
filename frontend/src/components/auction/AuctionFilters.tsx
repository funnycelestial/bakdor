import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { apiService, Auction } from '@/lib/api';
import { formatTokenAmount } from '@/utils/formatters';
import { toast } from 'sonner';

interface AuctionFiltersProps {
  onFiltersChange: (auctions: Auction[]) => void;
  onLoadingChange: (loading: boolean) => void;
}

export const AuctionFilters = ({ onFiltersChange, onLoadingChange }: AuctionFiltersProps) => {
  const [filters, setFilters] = useState({
    category: 'all',
    type: 'all',
    status: 'active',
    priceRange: [0, 10000],
    condition: 'all',
    endingIn: 'all',
    sortBy: 'newest',
    hasReserve: false,
    hasBuyNow: false,
    minBids: 0
  });

  const [categories, setCategories] = useState<Array<{ name: string; count: number }>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const categoryOptions = [
    'electronics', 'fashion', 'home-garden', 'sports', 
    'automotive', 'books', 'art', 'collectibles', 'services', 'other'
  ];

  const conditionOptions = [
    { value: 'new', label: 'New' },
    { value: 'like-new', label: 'Like New' },
    { value: 'good', label: 'Good' },
    { value: 'fair', label: 'Fair' },
    { value: 'poor', label: 'Poor' }
  ];

  const sortOptions = [
    { value: 'newest', label: 'Newest First' },
    { value: 'oldest', label: 'Oldest First' },
    { value: 'ending_soon', label: 'Ending Soon' },
    { value: 'price_low', label: 'Price: Low to High' },
    { value: 'price_high', label: 'Price: High to Low' },
    { value: 'most_bids', label: 'Most Bids' }
  ];

  const endingInOptions = [
    { value: 'all', label: 'Any Time' },
    { value: '1h', label: 'Next Hour' },
    { value: '6h', label: 'Next 6 Hours' },
    { value: '24h', label: 'Next 24 Hours' },
    { value: '7d', label: 'Next 7 Days' }
  ];

  useEffect(() => {
    loadCategories();
    applyFilters();
  }, []);

  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      applyFilters();
    }, 500);

    return () => clearTimeout(debounceTimer);
  }, [filters]);

  const loadCategories = async () => {
    try {
      const response = await apiService.getAuctionCategories();
      setCategories(response.data.categories);
    } catch (error) {
      console.error('Failed to load categories:', error);
      setCategories(categoryOptions.map(cat => ({ 
        name: cat, 
        count: Math.floor(Math.random() * 20) + 1 
      })));
    }
  };

  const applyFilters = async () => {
    setIsLoading(true);
    onLoadingChange(true);

    try {
      const params: any = {
        status: filters.status,
        sort: filters.sortBy,
        limit: 50
      };

      if (filters.category && filters.category !== 'all') params.category = filters.category;
      if (filters.type && filters.type !== 'all') params.type = filters.type;
      if (filters.condition && filters.condition !== 'all') params.condition = filters.condition;
      if (filters.priceRange[0] > 0) params.price_min = filters.priceRange[0];
      if (filters.priceRange[1] < 10000) params.price_max = filters.priceRange[1];

      const response = await apiService.getAuctions(params);
      let filteredAuctions = response.data.auctions;

      if (filters.hasReserve) {
        filteredAuctions = filteredAuctions.filter(a => a.pricing.reservePrice > 0);
      }

      if (filters.hasBuyNow) {
        filteredAuctions = filteredAuctions.filter(a => a.pricing.buyNowPrice > 0);
      }

      if (filters.minBids > 0) {
        filteredAuctions = filteredAuctions.filter(a => a.bidding.totalBids >= filters.minBids);
      }

      if (filters.endingIn && filters.endingIn !== 'all') {
        const now = Date.now();
        const timeLimit = getTimeLimit(filters.endingIn);
        filteredAuctions = filteredAuctions.filter(a => {
          const endTime = new Date(a.timing.endTime).getTime();
          return endTime - now <= timeLimit && endTime > now;
        });
      }

      onFiltersChange(filteredAuctions);
    } catch (error) {
      console.error('Failed to apply filters:', error);
      toast.error('Failed to load auctions');
      onFiltersChange([]);
    } finally {
      setIsLoading(false);
      onLoadingChange(false);
    }
  };

  const getTimeLimit = (endingIn: string): number => {
    switch (endingIn) {
      case '1h': return 60 * 60 * 1000;
      case '6h': return 6 * 60 * 60 * 1000;
      case '24h': return 24 * 60 * 60 * 1000;
      case '7d': return 7 * 24 * 60 * 60 * 1000;
      case 'all': return Infinity;
      default: return Infinity;
    }
  };

  const updateFilter = (key: string, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => {
    setFilters({
      category: 'all',
      type: 'all',
      status: 'active',
      priceRange: [0, 10000],
      condition: 'all',
      endingIn: 'all',
      sortBy: 'newest',
      hasReserve: false,
      hasBuyNow: false,
      minBids: 0
    });
  };

  const getActiveFilterCount = () => {
    let count = 0;
    if (filters.category && filters.category !== 'all') count++;
    if (filters.type && filters.type !== 'all') count++;
    if (filters.condition && filters.condition !== 'all') count++;
    if (filters.priceRange[0] > 0 || filters.priceRange[1] < 10000) count++;
    if (filters.endingIn && filters.endingIn !== 'all') count++;
    if (filters.hasReserve) count++;
    if (filters.hasBuyNow) count++;
    if (filters.minBids > 0) count++;
    return count;
  };

  return (
    <Card className="border-panel-border bg-card/50 p-4">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-terminal-green">Auction Filters</h3>
            {getActiveFilterCount() > 0 && (
              <Badge className="bg-terminal-amber/20 text-terminal-amber">
                {getActiveFilterCount()} Active
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => setShowAdvanced(!showAdvanced)}
              variant="outline"
              size="sm"
              className="text-xs border-panel-border"
            >
              {showAdvanced ? 'Simple' : 'Advanced'}
            </Button>
            <Button
              onClick={clearFilters}
              variant="outline"
              size="sm"
              className="text-xs border-panel-border"
            >
              Clear All
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <Select value={filters.category} onValueChange={(value) => updateFilter('category', value)}>
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

          <Select value={filters.type} onValueChange={(value) => updateFilter('type', value)}>
            <SelectTrigger className="bg-background border-panel-border">
              <SelectValue placeholder="Auction Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="forward">Forward Auction</SelectItem>
              <SelectItem value="reverse">Reverse Auction</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filters.status} onValueChange={(value) => updateFilter('status', value)}>
            <SelectTrigger className="bg-background border-panel-border">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="ended">Ended</SelectItem>
              <SelectItem value="all">All Status</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filters.endingIn} onValueChange={(value) => updateFilter('endingIn', value)}>
            <SelectTrigger className="bg-background border-panel-border">
              <SelectValue placeholder="Ending In" />
            </SelectTrigger>
            <SelectContent>
              {endingInOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filters.sortBy} onValueChange={(value) => updateFilter('sortBy', value)}>
            <SelectTrigger className="bg-background border-panel-border">
              <SelectValue placeholder="Sort By" />
            </SelectTrigger>
            <SelectContent>
              {sortOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {showAdvanced && (
          <div className="space-y-4 border-t border-panel-border pt-4">
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">
                Price Range: {formatTokenAmount(filters.priceRange[0].toString())} - {formatTokenAmount(filters.priceRange[1].toString())} WKC
              </label>
              <Slider
                value={filters.priceRange}
                onValueChange={(value) => updateFilter('priceRange', value)}
                max={10000}
                min={0}
                step={50}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Item Condition</label>
              <Select value={filters.condition} onValueChange={(value) => updateFilter('condition', value)}>
                <SelectTrigger className="bg-background border-panel-border">
                  <SelectValue placeholder="Any Condition" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any Condition</SelectItem>
                  {conditionOptions.map((condition) => (
                    <SelectItem key={condition.value} value={condition.value}>
                      {condition.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">
                Minimum Bids: {filters.minBids}
              </label>
              <Slider
                value={[filters.minBids]}
                onValueChange={(value) => updateFilter('minBids', value[0])}
                max={50}
                min={0}
                step={1}
                className="w-full"
              />
            </div>

            <div className="space-y-3">
              <label className="text-xs text-muted-foreground">Special Features</label>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="hasReserve"
                    checked={filters.hasReserve}
                    onCheckedChange={(checked) => updateFilter('hasReserve', checked)}
                  />
                  <label htmlFor="hasReserve" className="text-xs text-foreground">
                    Has Reserve Price
                  </label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="hasBuyNow"
                    checked={filters.hasBuyNow}
                    onCheckedChange={(checked) => updateFilter('hasBuyNow', checked)}
                  />
                  <label htmlFor="hasBuyNow" className="text-xs text-foreground">
                    Buy Now Available
                  </label>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between text-xs border-t border-panel-border pt-3">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Active Filters:</span>
            {getActiveFilterCount() === 0 ? (
              <span className="text-muted-foreground">None</span>
            ) : (
              <div className="flex gap-1">
                {filters.category && filters.category !== 'all' && (
                  <Badge variant="outline" className="text-xs">
                    {filters.category}
                  </Badge>
                )}
                {filters.type && filters.type !== 'all' && (
                  <Badge variant="outline" className="text-xs">
                    {filters.type}
                  </Badge>
                )}
                {filters.condition && filters.condition !== 'all' && (
                  <Badge variant="outline" className="text-xs">
                    {filters.condition}
                  </Badge>
                )}
                {(filters.priceRange[0] > 0 || filters.priceRange[1] < 10000) && (
                  <Badge variant="outline" className="text-xs">
                    {formatTokenAmount(filters.priceRange[0].toString())}-{formatTokenAmount(filters.priceRange[1].toString())} WKC
                  </Badge>
                )}
              </div>
            )}
          </div>
          
          {isLoading && (
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 border border-terminal-green border-t-transparent rounded-full animate-spin"></div>
              <span className="text-terminal-green">Filtering...</span>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
};