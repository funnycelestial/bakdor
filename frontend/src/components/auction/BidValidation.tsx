import { useState, useEffect } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useWeb3 } from '@/contexts/Web3Context';
import { formatTokenAmount } from '@/lib/web3';

interface BidValidationProps {
  auctionId: string;
  currentBid: number;
  bidAmount: string;
  userBalance: string;
  minIncrement: number;
  reservePrice?: number;
  buyNowPrice?: number;
  onValidationChange: (isValid: boolean, errors: string[]) => void;
}

export const BidValidation = ({
  auctionId,
  currentBid,
  bidAmount,
  userBalance,
  minIncrement,
  reservePrice = 0,
  buyNowPrice = 0,
  onValidationChange
}: BidValidationProps) => {
  const { isAuthenticated } = useWeb3();
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);
  const [riskScore, setRiskScore] = useState(0);

  useEffect(() => {
    validateBid();
  }, [bidAmount, currentBid, userBalance]);

  const validateBid = () => {
    const errors: string[] = [];
    const warnings: string[] = [];
    let risk = 0;

    if (!isAuthenticated) {
      errors.push('Please connect your wallet to place bids');
      onValidationChange(false, errors);
      return;
    }

    if (!bidAmount || bidAmount.trim() === '') {
      setValidationErrors([]);
      setValidationWarnings([]);
      setRiskScore(0);
      onValidationChange(false, []);
      return;
    }

    const amount = parseFloat(bidAmount);
    const balance = parseFloat(userBalance);
    const minBidAmount = currentBid + minIncrement;

    // Critical errors
    if (isNaN(amount) || amount <= 0) {
      errors.push('Bid amount must be a valid positive number');
    }

    if (amount <= currentBid) {
      errors.push(`Bid must be higher than current bid of ${formatTokenAmount(currentBid.toString())} WKC`);
    }

    if (amount < minBidAmount) {
      errors.push(`Minimum bid is ${formatTokenAmount(minBidAmount.toString())} WKC`);
    }

    if (amount > balance) {
      errors.push(`Insufficient balance. You have ${formatTokenAmount(userBalance)} WKC`);
    }

    // Warnings and risk assessment
    if (amount > balance * 0.8) {
      warnings.push('This bid uses more than 80% of your balance');
      risk += 30;
    }

    if (amount > currentBid * 2) {
      warnings.push('This bid is significantly higher than the current bid');
      risk += 20;
    }

    if (buyNowPrice > 0 && amount > buyNowPrice * 0.9) {
      warnings.push(`Consider using Buy Now at ${formatTokenAmount(buyNowPrice.toString())} WKC`);
      risk += 15;
    }

    if (reservePrice > 0 && amount < reservePrice) {
      warnings.push(`Bid is below reserve price of ${formatTokenAmount(reservePrice.toString())} WKC`);
      risk += 10;
    }

    // Bid strategy warnings
    if (amount === minBidAmount) {
      warnings.push('Minimum increment bids are easily outbid');
      risk += 5;
    }

    if (amount > currentBid * 1.5) {
      warnings.push('Large bid increases may discourage other bidders');
      risk -= 10; // Actually reduces risk of being outbid
    }

    setValidationErrors(errors);
    setValidationWarnings(warnings);
    setRiskScore(Math.max(0, Math.min(100, risk)));
    onValidationChange(errors.length === 0, errors);
  };

  const getRiskLevel = () => {
    if (riskScore >= 70) return { level: 'High', color: 'text-terminal-red' };
    if (riskScore >= 40) return { level: 'Medium', color: 'text-terminal-amber' };
    return { level: 'Low', color: 'text-terminal-green' };
  };

  const riskLevel = getRiskLevel();

  if (!bidAmount || bidAmount.trim() === '') {
    return null;
  }

  return (
    <div className="space-y-3">
      {/* Validation Errors */}
      {validationErrors.length > 0 && (
        <Alert className="border-terminal-red/50 bg-terminal-red/10">
          <AlertDescription className="text-terminal-red text-xs">
            <div className="space-y-1">
              {validationErrors.map((error, index) => (
                <div key={index} className="flex items-center gap-2">
                  <span>❌</span>
                  <span>{error}</span>
                </div>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Validation Warnings */}
      {validationWarnings.length > 0 && validationErrors.length === 0 && (
        <Alert className="border-terminal-amber/50 bg-terminal-amber/10">
          <AlertDescription className="text-terminal-amber text-xs">
            <div className="space-y-1">
              {validationWarnings.map((warning, index) => (
                <div key={index} className="flex items-center gap-2">
                  <span>⚠️</span>
                  <span>{warning}</span>
                </div>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Risk Assessment */}
      {validationErrors.length === 0 && parseFloat(bidAmount) > 0 && (
        <div className="border border-panel-border bg-secondary/20 p-3 rounded">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground">Bid Risk Assessment</span>
            <Badge className={`text-xs ${
              riskLevel.level === 'High' ? 'bg-terminal-red/20 text-terminal-red' :
              riskLevel.level === 'Medium' ? 'bg-terminal-amber/20 text-terminal-amber' :
              'bg-terminal-green/20 text-terminal-green'
            }`}>
              {riskLevel.level} Risk
            </Badge>
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span>Risk Score</span>
              <span className={riskLevel.color}>{riskScore}/100</span>
            </div>
            <Progress value={riskScore} className="h-2" />
          </div>

          <div className="mt-3 text-xs text-muted-foreground">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span>Balance Usage:</span>
                <span className="text-foreground ml-1">
                  {((parseFloat(bidAmount) / parseFloat(userBalance)) * 100).toFixed(1)}%
                </span>
              </div>
              <div>
                <span>Bid Increase:</span>
                <span className="text-foreground ml-1">
                  {(((parseFloat(bidAmount) - currentBid) / currentBid) * 100).toFixed(1)}%
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Success Prediction */}
      {validationErrors.length === 0 && parseFloat(bidAmount) > currentBid && (
        <div className="border border-terminal-green/30 bg-terminal-green/10 p-3 rounded">
          <div className="text-xs text-terminal-green mb-2">💡 Bid Strategy Analysis</div>
          <div className="text-xs text-muted-foreground space-y-1">
            <div>• Bid is {((parseFloat(bidAmount) / currentBid - 1) * 100).toFixed(1)}% above current</div>
            <div>• Estimated win probability: {Math.min(95, 60 + (parseFloat(bidAmount) - currentBid) * 2).toFixed(0)}%</div>
            <div>• Platform fee on win: {formatTokenAmount((parseFloat(bidAmount) * 0.03).toString())} WKC</div>
            <div>• Tokens burned on win: {formatTokenAmount((parseFloat(bidAmount) * 0.015).toString())} WKC 🔥</div>
          </div>
        </div>
      )}
    </div>
  );
};