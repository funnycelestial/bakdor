import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, useEffect } from "react";
import { apiService, PaymentMethod } from "@/lib/api";
import { useWeb3 } from "@/contexts/Web3Context";
import { toast } from "sonner";
import { formatTokenAmount } from '@/utils/formatters';

export const PaymentGateway = () => {
  const { isAuthenticated, balance, refreshBalance } = useWeb3();
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [selectedMethod, setSelectedMethod] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      loadPaymentData();
    }
  }, [isAuthenticated]);

  const loadPaymentData = async () => {
    try {
      const [methodsResponse, historyResponse] = await Promise.all([
        apiService.getPaymentMethods(),
        apiService.getPaymentHistory({ limit: 10 })
      ]);
      
      setPaymentMethods(methodsResponse.data.paymentMethods);
      setRecentTransactions(historyResponse.data.transactions);
    } catch (error) {
      console.error('Failed to load payment data:', error);
      // Use mock data for demo
      setPaymentMethods([
        {
          id: "mtn_momo",
          name: "MTN Mobile Money",
          type: "mobile_money",
          status: "active",
          fees: "1.5%",
          processingTime: "Instant"
        },
        {
          id: "vodafone_cash",
          name: "Vodafone Cash",
          type: "mobile_money", 
          status: "active",
          fees: "1.8%",
          processingTime: "Instant"
        },
        {
          id: "visa_card",
          name: "Visa/Mastercard",
          type: "bank_card",
          status: "active",
          fees: "2.9%",
          processingTime: "2-3 mins"
        }
      ]);
      
      setRecentTransactions([
        {
          transactionId: "TXN_001",
          type: "deposit",
          amount: 500,
          status: "completed",
          createdAt: new Date(Date.now() - 2 * 60 * 1000).toISOString()
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeposit = async () => {
    if (!depositAmount || !selectedMethod || parseFloat(depositAmount) < 10) {
      toast.error('Please enter amount (min 10 WKC) and select payment method');
      return;
    }

    if (selectedMethod.includes('momo') && !phoneNumber) {
      toast.error('Phone number required for mobile money');
      return;
    }

    setIsProcessing(true);
    try {
      const response = await apiService.processPayment(
        parseFloat(depositAmount),
        selectedMethod,
        'deposit',
        phoneNumber
      );
      
      toast.success('Deposit initiated successfully', {
        description: `Transaction ID: ${response.data.transaction.transactionId}`
      });
      
      setDepositAmount('');
      setPhoneNumber('');
      await loadPaymentData();
      await refreshBalance();
    } catch (error: any) {
      console.error('Failed to process deposit:', error);
      toast.error(error.message || 'Failed to process deposit');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleWithdraw = async () => {
    if (!withdrawAmount || !selectedMethod || parseFloat(withdrawAmount) < 10) {
      toast.error('Please enter amount (min 10 WKC) and select payment method');
      return;
    }

    const userBalance = parseFloat(balance);
    if (parseFloat(withdrawAmount) > userBalance) {
      toast.error(`Insufficient balance. You have ${formatTokenAmount(balance)} WKC`);
      return;
    }

    setIsProcessing(true);
    try {
      const response = await apiService.processPayment(
        parseFloat(withdrawAmount),
        selectedMethod,
        'withdrawal',
        phoneNumber
      );
      
      toast.success('Withdrawal initiated successfully', {
        description: `Transaction ID: ${response.data.transaction.transactionId}`
      });
      
      setWithdrawAmount('');
      setPhoneNumber('');
      await loadPaymentData();
      await refreshBalance();
    } catch (error: any) {
      console.error('Failed to process withdrawal:', error);
      toast.error(error.message || 'Failed to process withdrawal');
    } finally {
      setIsProcessing(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-terminal-green';
      case 'completed': return 'text-terminal-green';
      case 'pending': return 'text-terminal-amber';
      case 'offline': return 'text-terminal-red';
      case 'maintenance': return 'text-muted-foreground';
      case 'failed': return 'text-terminal-red';
      default: return 'text-muted-foreground';
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="text-center p-4 border border-panel-border bg-secondary/20 rounded">
        <div className="text-terminal-amber mb-2">💳</div>
        <div className="text-sm text-muted-foreground">
          Connect your wallet to access payment gateway
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-terminal-green">Payment Gateway</h3>
        <Badge variant="outline" className="text-terminal-green border-terminal-green">
          4 Methods
        </Badge>
      </div>

      {/* Payment Methods */}
      {isLoading ? (
            <option value="mtn_momo">Select Payment Method</option>
          <div className="h-4 bg-secondary/40 rounded mb-3"></div>
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-8 bg-secondary/40 rounded"></div>
            ))}
          </div>
        </Card>
      ) : (
      <Card className="border-panel-border bg-secondary/20 p-3">
        <h4 className="text-sm font-medium text-foreground mb-3">Available Payment Methods</h4>
        <div className="space-y-2">
          {paymentMethods.map((method) => (
            <div key={method.id} className="flex items-center justify-between p-2 border border-panel-border bg-background/50 rounded text-xs">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${
                  method.status === 'active' ? 'bg-terminal-green' : 
                  method.status === 'offline' ? 'bg-terminal-red' : 
                  'bg-terminal-amber'
                } animate-pulse-slow`}></div>
                <span className="text-foreground">{method.name}</span>
              </div>
              <div className="flex gap-3 text-xs">
                <span className="text-muted-foreground">{method.fees}</span>
                <span className="text-muted-foreground">{method.processingTime}</span>
                <span className={getStatusColor(method.status)}>
                  {method.status.toUpperCase()}
                </span>
              </div>
            </div>
          ))}
        </div>
        
        <div className="mt-4 p-3 border border-terminal-green/30 bg-terminal-green/10 rounded">
          <h5 className="text-sm text-terminal-green mb-2">Token Exchange Rate</h5>
          <div className="text-xs space-y-1">
            <div className="flex justify-between">
              <span>1 WikiCat Token (WKC)</span>
              <span className="text-terminal-green">= 1.00 GH₵</span>
            </div>
            <div className="flex justify-between">
              <span>Minimum Purchase</span>
              <span>10 WKC (GH₵ 10)</span>
            </div>
            <div className="flex justify-between">
              <span>Maximum Purchase</span>
              <span>10,000 WKC (GH₵ 10,000)</span>
            </div>
          </div>
        </div>
      </Card>
      )}

      {/* Deposit/Withdrawal Interface */}
      <Card className="border-panel-border bg-secondary/20 p-3">
        <h4 className="text-sm font-medium text-foreground mb-3">Buy/Sell Tokens</h4>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Deposit Amount (WKC)</label>
              <Input
                type="number"
                placeholder="Min: 10 WKC"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                className="text-xs bg-background border-panel-border"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Withdraw Amount (WKC)</label>
              <Input
                type="number"
                placeholder="Min: 10 WKC"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                className="text-xs bg-background border-panel-border"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Payment Method</label>
            <select 
              value={selectedMethod}
              onChange={(e) => setSelectedMethod(e.target.value)}
              className="w-full bg-background border border-panel-border px-2 py-1 text-xs focus:border-terminal-green focus:outline-none"
            >
              <option value="">Select Payment Method</option>
              {paymentMethods.filter(m => m.status === 'active').map((method) => (
                <option key={method.id} value={method.id}>
                  {method.name} ({method.fees} fee)
                </option>
              ))}
            </select>
          </div>

          {selectedMethod.includes('momo') && (
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Phone Number</label>
              <Input
                type="tel"
                placeholder="0XX XXX XXXX"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="text-xs bg-background border-panel-border"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <Button
              onClick={handleDeposit}
              disabled={isProcessing || !depositAmount || !selectedMethod}
              className="bg-terminal-green text-background hover:bg-terminal-green/80 text-xs"
            >
              {isProcessing ? 'Processing...' : 'Buy Tokens'}
            </Button>
            <Button
              onClick={handleWithdraw}
              disabled={isProcessing || !withdrawAmount || !selectedMethod}
              variant="outline"
              className="text-xs border-panel-border"
            >
              {isProcessing ? 'Processing...' : 'Cash Out'}
            </Button>
          </div>
        </div>
      </Card>

      {/* Recent Transactions */}
      <Card className="border-panel-border bg-secondary/20 p-3">
        <h4 className="text-sm font-medium text-foreground mb-3">Recent Transactions</h4>
        <div className="space-y-2">
          {recentTransactions.map((txn) => (
            <div key={txn.transactionId} className="flex items-center justify-between p-2 border border-panel-border bg-background/50 rounded text-xs">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className={`${txn.type === 'deposit' ? 'text-terminal-green' : 'text-terminal-amber'}`}>
                    {txn.type.toUpperCase()}
                  </span>
                  <span className="text-muted-foreground">
                    {new Date(txn.createdAt).toLocaleTimeString()}
                  </span>
                </div>
                <div className="text-muted-foreground">ID: {txn.transactionId}</div>
              </div>
              <div className="text-right">
                <div className="text-foreground">{formatTokenAmount(txn.amount.toString())} WKC</div>
                <div className={getStatusColor(txn.status)}>
                  {txn.status.toUpperCase()}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {!isLoading && recentTransactions.length === 0 && (
        <div className="text-center py-8">
          <div className="text-terminal-amber text-2xl mb-2">💳</div>
          <div className="text-sm text-muted-foreground">No payment history yet</div>
        </div>
      )}
    </div>
  );
};