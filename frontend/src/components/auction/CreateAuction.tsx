import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { apiService } from '@/lib/api';
import { useWeb3 } from '@/contexts/Web3Context';
import { toast } from 'sonner';

export const CreateAuction = () => {
  const { isAuthenticated, user, connectWallet, isConnecting } = useWeb3();
  const [isCreating, setIsCreating] = useState(false);
  const [auctionData, setAuctionData] = useState({
    title: '',
    description: '',
    category: 'electronics',
    type: 'forward',
    startingBid: '',
    reservePrice: '',
    buyNowPrice: '',
    duration: '86400000', // 24 hours in milliseconds
    condition: 'good',
    brand: '',
    model: '',
    year: '',
    shippingMethod: 'standard',
    shippingCost: '0'
  });

  const categories = [
    'electronics', 'fashion', 'home-garden', 'sports', 
    'automotive', 'books', 'art', 'collectibles', 'services', 'other'
  ];

  const conditions = [
    { value: 'new', label: 'New' },
    { value: 'like-new', label: 'Like New' },
    { value: 'good', label: 'Good' },
    { value: 'fair', label: 'Fair' },
    { value: 'poor', label: 'Poor' }
  ];

  const durations = [
    { value: '3600000', label: '1 Hour' },
    { value: '21600000', label: '6 Hours' },
    { value: '43200000', label: '12 Hours' },
    { value: '86400000', label: '24 Hours' },
    { value: '259200000', label: '3 Days' },
    { value: '604800000', label: '7 Days' }
  ];

  const handleInputChange = (field: string, value: string) => {
    setAuctionData(prev => ({ ...prev, [field]: value }));
  };

  const validateForm = () => {
    if (!isAuthenticated) {
      toast.error('Please connect and authenticate your wallet first');
      return false;
    }
    
    if (!auctionData.title.trim() || auctionData.title.length < 5) {
      toast.error('Title must be at least 5 characters');
      return false;
    }
    
    if (!auctionData.description.trim() || auctionData.description.length < 20) {
      toast.error('Description must be at least 20 characters');
      return false;
    }
    
    if (!auctionData.category) {
      toast.error('Please select a category');
      return false;
    }
    
    if (!auctionData.startingBid || parseFloat(auctionData.startingBid) <= 0) {
      toast.error('Starting bid must be greater than 0');
      return false;
    }
    
    if (auctionData.reservePrice && parseFloat(auctionData.reservePrice) < parseFloat(auctionData.startingBid)) {
      toast.error('Reserve price cannot be less than starting bid');
      return false;
    }
    
    if (auctionData.buyNowPrice && parseFloat(auctionData.buyNowPrice) <= Math.max(parseFloat(auctionData.startingBid), parseFloat(auctionData.reservePrice || '0'))) {
      toast.error('Buy now price must be greater than starting bid and reserve price');
      return false;
    }

    return true;
  };

  const handleCreateAuction = async () => {
    if (!validateForm()) return;

    setIsCreating(true);
    try {
      const payload = {
        title: auctionData.title.trim(),
        description: auctionData.description.trim(),
        category: auctionData.category,
        type: auctionData.type,
        startingBid: parseFloat(auctionData.startingBid),
        reservePrice: auctionData.reservePrice ? parseFloat(auctionData.reservePrice) : 0,
        buyNowPrice: auctionData.buyNowPrice ? parseFloat(auctionData.buyNowPrice) : 0,
        duration: parseInt(auctionData.duration),
        condition: auctionData.condition,
        brand: auctionData.brand.trim(),
        model: auctionData.model.trim(),
        year: auctionData.year ? parseInt(auctionData.year) : undefined,
        shippingMethod: auctionData.shippingMethod,
        shippingCost: parseFloat(auctionData.shippingCost),
        images: []
      };

      const response = await apiService.createAuction(payload);

      toast.success('Auction created successfully!', {
        description: `Auction ID: ${response.auctionId || response.data?.auctionId}`
      });

      // Reset form
      setAuctionData({
        title: '',
        description: '',
        category: 'electronics',
        type: 'forward',
        startingBid: '',
        reservePrice: '',
        buyNowPrice: '',
        duration: '86400000',
        condition: 'good',
        brand: '',
        model: '',
        year: '',
        shippingMethod: 'standard',
        shippingCost: '0'
      });

    } catch (error: any) {
      console.error('Failed to create auction:', error);
      toast.error(error.message || 'Failed to create auction');
    } finally {
      setIsCreating(false);
    }
  };


  return (
    <Card className="border-panel-border bg-card/50 p-4">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-terminal-green">Create New Auction</h3>
          {isAuthenticated ? (
            <Badge variant="outline" className="text-terminal-green border-terminal-green">
              SELLER: {user?.anonymousId}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-terminal-amber border-terminal-amber">
              PREVIEW MODE
            </Badge>
          )}
        </div>

        {/* Authentication Warning */}
        {!isAuthenticated && (
          <Alert className="border-terminal-amber/50 bg-terminal-amber/10">
            <AlertDescription className="text-terminal-amber text-xs">
              <div className="flex items-center justify-between">
                <span>Connect your wallet to create auctions</span>
                <Button
                  onClick={connectWallet}
                  disabled={isConnecting}
                  size="sm"
                  className="bg-terminal-amber text-background hover:bg-terminal-amber/80"
                >
                  {isConnecting ? 'Connecting...' : 'Connect Wallet'}
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}
        {/* Basic Information */}
        <div className={`space-y-3 ${!isAuthenticated ? 'opacity-60' : ''}`}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Auction Title *</label>
              <Input
                placeholder="e.g., iPhone 15 Pro Max 256GB"
                value={auctionData.title}
                onChange={(e) => handleInputChange('title', e.target.value)}
                disabled={!isAuthenticated}
                className="bg-background border-panel-border focus:border-terminal-green"
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Category *</label>
              <Select 
                value={auctionData.category} 
                onValueChange={(value) => handleInputChange('category', value)}
                disabled={!isAuthenticated}
              >
                <SelectTrigger className="bg-background border-panel-border">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category.charAt(0).toUpperCase() + category.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Description *</label>
            <Textarea
              placeholder="Detailed description of your item..."
              value={auctionData.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
              disabled={!isAuthenticated}
              className="bg-background border-panel-border focus:border-terminal-green min-h-[80px]"
            />
          </div>

          {/* Item Details */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Condition *</label>
              <Select 
                value={auctionData.condition} 
                onValueChange={(value) => handleInputChange('condition', value)}
                disabled={!isAuthenticated}
              >
                <SelectTrigger className="bg-background border-panel-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {conditions.map((condition) => (
                    <SelectItem key={condition.value} value={condition.value}>
                      {condition.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Brand</label>
              <Input
                placeholder="e.g., Apple, Samsung"
                value={auctionData.brand}
                onChange={(e) => handleInputChange('brand', e.target.value)}
                disabled={!isAuthenticated}
                className="bg-background border-panel-border"
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Model</label>
              <Input
                placeholder="e.g., iPhone 15 Pro"
                value={auctionData.model}
                onChange={(e) => handleInputChange('model', e.target.value)}
                disabled={!isAuthenticated}
                className="bg-background border-panel-border"
              />
            </div>
          </div>
        </div>

        {/* Pricing */}
        <div className={`border-t border-panel-border pt-4 ${!isAuthenticated ? 'opacity-60' : ''}`}>
          <h4 className="text-sm font-medium text-foreground mb-3">Pricing & Duration</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Auction Type</label>
              <Select 
                value={auctionData.type} 
                onValueChange={(value) => handleInputChange('type', value)}
                disabled={!isAuthenticated}
              >
                <SelectTrigger className="bg-background border-panel-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="forward">Forward Auction (Highest Bid Wins)</SelectItem>
                  <SelectItem value="reverse">Reverse Auction (Lowest Quote Wins)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Duration</label>
              <Select 
                value={auctionData.duration} 
                onValueChange={(value) => handleInputChange('duration', value)}
                disabled={!isAuthenticated}
              >
                <SelectTrigger className="bg-background border-panel-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {durations.map((duration) => (
                    <SelectItem key={duration.value} value={duration.value}>
                      {duration.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">
                {auctionData.type === 'reverse' ? 'Starting Budget' : 'Starting Bid'} (WKC) *
              </label>
              <Input
                type="number"
                placeholder="0.00"
                value={auctionData.startingBid}
                onChange={(e) => handleInputChange('startingBid', e.target.value)}
                disabled={!isAuthenticated}
                className="bg-background border-panel-border focus:border-terminal-green"
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Reserve Price (WKC)</label>
              <Input
                type="number"
                placeholder="Optional"
                value={auctionData.reservePrice}
                onChange={(e) => handleInputChange('reservePrice', e.target.value)}
                disabled={!isAuthenticated}
                className="bg-background border-panel-border"
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Buy Now Price (WKC)</label>
              <Input
                type="number"
                placeholder="Optional"
                value={auctionData.buyNowPrice}
                onChange={(e) => handleInputChange('buyNowPrice', e.target.value)}
                disabled={!isAuthenticated}
                className="bg-background border-panel-border"
              />
            </div>
          </div>
        </div>

        {/* Shipping */}
        <div className={`border-t border-panel-border pt-4 ${!isAuthenticated ? 'opacity-60' : ''}`}>
          <h4 className="text-sm font-medium text-foreground mb-3">Shipping & Delivery</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Shipping Method</label>
              <Select 
                value={auctionData.shippingMethod} 
                onValueChange={(value) => handleInputChange('shippingMethod', value)}
                disabled={!isAuthenticated}
              >
                <SelectTrigger className="bg-background border-panel-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pickup">Local Pickup</SelectItem>
                  <SelectItem value="standard">Standard Shipping</SelectItem>
                  <SelectItem value="express">Express Shipping</SelectItem>
                  <SelectItem value="digital">Digital Delivery</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Shipping Cost (WKC)</label>
              <Input
                type="number"
                placeholder="0.00"
                value={auctionData.shippingCost}
                onChange={(e) => handleInputChange('shippingCost', e.target.value)}
                disabled={!isAuthenticated}
                className="bg-background border-panel-border"
              />
            </div>
          </div>
        </div>

        {/* Fee Information */}
        <div className="border border-terminal-amber/30 bg-terminal-amber/10 p-3 rounded">
          <h4 className="text-sm text-terminal-amber mb-2">🔥 Platform Fees & Token Burns</h4>
          <div className="text-xs text-muted-foreground space-y-1">
            <div>• Platform fee: 3% of final sale price</div>
            <div>• 50% of fees burned forever (deflationary)</div>
            <div>• 50% to treasury for platform development</div>
            <div>• Example: 1,000 WKC sale → 15 WKC burned, 15 WKC to treasury</div>
          </div>
        </div>

        {/* Create Button */}
        <Button
          onClick={handleCreateAuction}
          disabled={!isAuthenticated || isCreating || !auctionData.title || !auctionData.description || !auctionData.category || !auctionData.startingBid}
          className="w-full bg-terminal-green text-background hover:bg-terminal-green/80"
        >
          {isCreating ? (
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-background border-t-transparent rounded-full animate-spin"></div>
              Creating Auction...
            </div>
          ) : !isAuthenticated ? (
            'Connect Wallet to Create Auction'
          ) : (
            'Create Auction'
          )}
        </Button>

        {isAuthenticated ? (
          <div className="text-xs text-muted-foreground text-center">
            Your auction will be live immediately (self-regulated platform)
          </div>
        ) : (
          <div className="text-xs text-muted-foreground text-center">
            Connect your wallet to create and manage auctions
          </div>
        )}
      </div>
    </Card>
  );
};