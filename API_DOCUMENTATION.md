# Anonymous Auction System - API Documentation (Web3 Edition)

## Overview
This document maps every frontend action to its corresponding backend endpoint for the Anonymous Auction System. The system is built as a Web3-first platform utilizing smart contracts for auctions and escrow, with $WKC as the native token. All endpoints implement proper wallet-based authentication, authorization, and anonymity features.

## 📁 Project Structure

```
backend/
├── config/
│   ├── db.js                 # MongoDB (off-chain user & auction metadata)
│   └── redis.js              # Redis configuration (caching & real-time)
├── controllers/
│   ├── userController.js     # Wallet-based user management
│   ├── auctionController.js  # Auction & reverse auction lifecycle
│   ├── bidController.js      # On-chain + off-chain bid management
│   ├── escrowController.js   # On-chain escrow smart contract interface
│   ├── deliveryController.js # Delivery confirmation (off-chain tracking)
│   ├── disputeController.js  # Dispute logging (linked to on-chain events)
│   ├── paymentController.js  # Fiat on-ramp/off-ramp integration
│   ├── notificationController.js # Notification management
│   ├── securityController.js # Security and anonymity features
│   └── walletController.js   # Token and wallet management
├── contracts/
│   ├── Auction.sol          # Smart contract handling auctions & bids
│   ├── Escrow.sol           # Smart contract handling fund locking
│   └── TokenUtils.sol       # Burning & fee logic for $WKC
├── models/
│   ├── userModel.js         # User schema with wallet address
│   ├── auctionModel.js      # Auction schema (linked to on-chain ID)
│   ├── bidModel.js          # Bid schema (off-chain mirror of events)
│   ├── disputeModel.js      # Dispute schema
│   ├── tokenTransaction.js  # On-chain tx logging
│   └── notificationModel.js # Notification schema
└── services/
    ├── web3Service.js       # Web3.js/ethers.js wrapper for contracts
    ├── notificationService.js # In-app + email notifications
    └── queueService.js      # Background job queue
```

## 🏗️ System Architecture

### Core Components
1. **Authentication System**: Wallet-based login (MetaMask, WalletConnect) with signed session tokens
2. **Auction Engine**: Standard & reverse auctions with smart contract bid locking in $WKC
3. **Escrow Mechanism**: Automated fund release on delivery confirmation
4. **Token Economy**: $WKC native token with 10% platform fee (50% burned, 50% treasury)
5. **Notification System**: Real-time WebSocket + email notifications
6. **Security Features**: 2FA, identity masking, and anonymity protection

### Key Workflows
1. **Auction Lifecycle**: Contract deployment → bid locking → auto winner selection → escrow release
2. **Reverse Auction**: Service request → decreasing bids → vendor selection → delivery confirmation
3. **Token Flow**: Wallet-based $WKC transactions with automated fee burning
4. **Dispute Resolution**: Admin intervention with contract override capabilities

## Authentication Endpoints

### User Authentication
- **POST** `/auth/register` - User registration
- **POST** `/auth/login` - User login
- **POST** `/auth/logout` - User logout
- **POST** `/auth/refresh` - Refresh access token
- **GET** `/auth/profile` - Get user profile
- **PUT** `/auth/profile` - Update user profile

## Auction Management Endpoints

### Auction CRUD Operations
- **GET** `/auctions` - Get all auctions (with filters)
  - Query params: `type`, `status`, `category`, `page`, `limit`
- **GET** `/auctions/{id}` - Get specific auction details
- **POST** `/auctions` - Create new auction
- **PUT** `/auctions/{id}` - Update auction (owner only)
- **DELETE** `/auctions/{id}` - Delete auction (owner only)
- **POST** `/auctions/{id}/close` - Close auction manually

### Auction Filtering & Search
- **GET** `/auctions/search` - Search auctions
  - Query params: `q`, `category`, `price_min`, `price_max`, `type`
- **GET** `/auctions/categories` - Get available categories
- **GET** `/auctions/featured` - Get featured auctions

## Bidding System Endpoints

### Bid Management
- **GET** `/auctions/{id}/bids` - Get all bids for auction (anonymized)
- **POST** `/auctions/{id}/bids` - Place new bid
- **GET** `/bids/my-bids` - Get user's bid history
- **DELETE** `/bids/{id}` - Withdraw bid (if allowed)
- **GET** `/bids/{id}/status` - Check bid status

### Real-time Bidding
- **WebSocket** `/ws/auctions/{id}/bids` - Real-time bid updates
- **WebSocket** `/ws/auctions/{id}/activity` - Live activity feed

## Token/Wallet Management Endpoints

### Token Operations
- **GET** `/wallet/balance` - Get user token balance
- **POST** `/wallet/deposit` - Deposit tokens
- **POST** `/wallet/withdraw` - Withdraw tokens
- **GET** `/wallet/transactions` - Get transaction history
- **POST** `/wallet/transfer` - Transfer tokens to another user

### Token Exchange
- **GET** `/exchange/rates` - Get current exchange rates
- **POST** `/exchange/buy-tokens` - Buy tokens with fiat
- **POST** `/exchange/sell-tokens` - Sell tokens for fiat

## Payment Gateway Endpoints

### Payment Methods
- **GET** `/payments/methods` - Get available payment methods
- **POST** `/payments/methods` - Add payment method
- **PUT** `/payments/methods/{id}` - Update payment method
- **DELETE** `/payments/methods/{id}` - Remove payment method

### Payment Processing
- **POST** `/payments/process` - Process payment
- **GET** `/payments/{id}/status` - Check payment status
- **POST** `/payments/{id}/refund` - Process refund
- **GET** `/payments/history` - Get payment history

## Escrow Management Endpoints

### Escrow Operations
- **GET** `/escrow/transactions` - Get user's escrow transactions
- **GET** `/escrow/{id}` - Get specific escrow details
- **POST** `/escrow/{id}/confirm-delivery` - Confirm delivery
- **POST** `/escrow/{id}/mark-delivered` - Mark as delivered (seller)
- **POST** `/escrow/{id}/release-funds` - Release escrowed funds
- **POST** `/escrow/{id}/dispute` - Initiate dispute

## Dispute Management Endpoints

### Dispute Operations
- **GET** `/disputes` - Get user disputes
- **GET** `/disputes/{id}` - Get specific dispute details
- **POST** `/disputes` - File new dispute
- **POST** `/disputes/{id}/respond` - Add response to dispute
- **POST** `/disputes/{id}/resolve` - Resolve dispute (admin)
- **POST** `/disputes/{id}/escalate` - Escalate dispute

## Notification System Endpoints

### Notification Management
- **GET** `/notifications` - Get user notifications
- **PUT** `/notifications/{id}/read` - Mark notification as read
- **PUT** `/notifications/read-all` - Mark all notifications as read
- **POST** `/notifications/subscribe` - Subscribe to notification type
- **DELETE** `/notifications/unsubscribe/{type}` - Unsubscribe from notifications

### Real-time Notifications
- **WebSocket** `/ws/notifications` - Real-time notification stream

## Security & Anonymity Endpoints

### Security Operations
- **GET** `/security/status` - Get security status
- **POST** `/security/enable-2fa` - Enable two-factor authentication
- **POST** `/security/disable-2fa` - Disable two-factor authentication
- **POST** `/security/verify-identity` - Submit identity verification
- **GET** `/security/anonymity-level` - Get current anonymity level
- **POST** `/security/report-issue` - Report security issue

### Privacy Controls
- **GET** `/privacy/settings` - Get privacy settings
- **PUT** `/privacy/settings` - Update privacy settings
- **POST** `/privacy/mask-identity` - Enable identity masking
- **DELETE** `/privacy/mask-identity` - Disable identity masking

## Admin Dashboard Endpoints

### System Management (Admin Only)
- **GET** `/admin/dashboard` - Get admin dashboard data
- **GET** `/admin/system/health` - Get system health status
- **GET** `/admin/statistics` - Get platform statistics
- **GET** `/admin/auctions/pending` - Get pending auctions for approval
- **POST** `/admin/auctions/{id}/approve` - Approve auction
- **POST** `/admin/auctions/{id}/reject` - Reject auction

### User Management (Admin Only)
- **GET** `/admin/users` - Get all users
- **PUT** `/admin/users/{id}/status` - Update user status
- **POST** `/admin/users/{id}/verify` - Verify user identity
- **GET** `/admin/users/{id}/activity` - Get user activity log

### Content Moderation (Admin Only)
- **GET** `/admin/reports` - Get reported content
- **POST** `/admin/reports/{id}/resolve` - Resolve report
- **POST** `/admin/content/{id}/flag` - Flag content
- **DELETE** `/admin/content/{id}` - Remove content

## Frontend Action to Endpoint Mapping

### Live Bidding Panel Actions
1. **Place Bid Button** → `POST /auctions/{id}/bids`
2. **Real-time Bid Updates** → `WebSocket /ws/auctions/{id}/bids`
3. **Load Auction Details** → `GET /auctions/{id}`

### Token Balance Actions
1. **View Balance** → `GET /wallet/balance`
2. **View Transactions** → `GET /wallet/transactions`
3. **Deposit Tokens** → `POST /wallet/deposit`

### Auction Card Actions
1. **View Auction** → `GET /auctions/{id}`
2. **Place Quick Bid** → `POST /auctions/{id}/bids`
3. **Watch Auction** → `POST /auctions/{id}/watch`

### Payment Gateway Actions
1. **Add Payment Method** → `POST /payments/methods`
2. **Buy Tokens** → `POST /exchange/buy-tokens`
3. **Cash Out** → `POST /exchange/sell-tokens`
4. **View Transaction History** → `GET /payments/history`

### Security Panel Actions
1. **View Security Status** → `GET /security/status`
2. **Report Issue** → `POST /security/report-issue`
3. **Update Settings** → `PUT /privacy/settings`

### Escrow Panel Actions
1. **Confirm Delivery** → `POST /escrow/{id}/confirm-delivery`
2. **Mark Delivered** → `POST /escrow/{id}/mark-delivered`
3. **Initiate Dispute** → `POST /disputes`
4. **View Escrow Details** → `GET /escrow/{id}`

### Dispute Panel Actions
1. **File Dispute** → `POST /disputes`
2. **Add Response** → `POST /disputes/{id}/respond`
3. **View Dispute Details** → `GET /disputes/{id}`

### Notification Panel Actions
1. **Mark as Read** → `PUT /notifications/{id}/read`
2. **View All Notifications** → `GET /notifications`
3. **Real-time Updates** → `WebSocket /ws/notifications`

### User Wallet Actions
1. **View Balance Breakdown** → `GET /wallet/balance`
2. **View Recent Transactions** → `GET /wallet/transactions`
3. **Transfer Tokens** → `POST /wallet/transfer`

### Admin Dashboard Actions
1. **Approve Auction** → `POST /admin/auctions/{id}/approve`
2. **Reject Auction** → `POST /admin/auctions/{id}/reject`
3. **View System Stats** → `GET /admin/statistics`
4. **Manage Users** → `GET /admin/users`

## Request/Response Formats

### Standard Response Format
```json
{
  "success": boolean,
  "data": object | array,
  "message": string,
  "errors": array,
  "meta": {
    "page": number,
    "limit": number,
    "total": number
  }
}
```

### Authentication Headers
```
Authorization: Bearer {jwt_token}
X-Anonymous-ID: {anonymous_identifier}
```

### Error Response Format
```json
{
  "success": false,
  "data": null,
  "message": "Error description",
  "errors": [
    {
      "field": "field_name",
      "message": "Validation error message"
    }
  ]
}
```

## WebSocket Events

### Auction Events
- `bid_placed` - New bid placed
- `auction_closed` - Auction ended
- `auction_updated` - Auction details changed

### Notification Events
- `new_notification` - New notification received
- `notification_read` - Notification marked as read

### System Events
- `maintenance_mode` - System maintenance notification
- `security_alert` - Security-related alerts

## Security Considerations

1. **Rate Limiting**: Implement rate limiting on all endpoints
2. **Input Validation**: Validate all input data
3. **Authentication**: JWT-based authentication with refresh tokens
4. **Anonymity**: Ensure user identities are properly masked
5. **Encryption**: Encrypt sensitive data in transit and at rest
6. **Audit Logging**: Log all significant actions for security auditing

## 🔧 Technical Stack

* **Smart Contracts**: Solidity (Auction, Escrow, TokenUtils)
* **Backend**: Node.js + Express.js
* **Blockchain Interaction**: ethers.js / web3.js
* **Database**: MongoDB for metadata
* **Cache/Queue**: Redis + BullMQ
* **Real-time**: Socket.IO for live auction updates and notifications
* **Notifications**: Email + WebSockets
* **Security**: Wallet-based authentication, 2FA, identity masking

## 🌟 Key Features

1. **Full Web3-first platform** (wallets, $WKC-only transactions)
2. **Dual auction modes** (standard + reverse auctions)
3. **Trustless escrow contracts** with automated release
4. **Transparent fee burning** (50% of platform fees burned, 50% to treasury)
5. **Anonymous bidding** with wallet-based pseudonyms
6. **Dispute resolution framework** with admin override
7. **On-chain/off-chain hybrid** → blockchain for trust, backend for UX
8. **Scalable architecture** ready for high transaction volume
9. **Real-time notifications** for user engagement
10. **Enhanced security features** for user privacy and protection

## Implementation Notes

### Web3 Integration
1. All user authentication via wallet signatures (MetaMask, WalletConnect)
2. Smart contracts handle auction logic, bid locking, and escrow
3. $WKC token used for all transactions with automated fee burning
4. On-chain events mirrored in off-chain database for performance

### Monetary Handling
1. All amounts handled in $WKC token smallest units
2. Platform fee: 10% of transaction value
3. Fee distribution: 50% burned via smart contract, 50% to treasury
4. Gas optimization for batch operations

### Real-time Features
1. WebSocket connections for live bidding and notifications
2. Smart contract event listeners for instant updates
3. Redis for caching and message queuing
4. Background jobs for email notifications and data synchronization

### Security & Privacy
1. Wallet-based authentication with session tokens
2. Anonymous bidding with pseudonymous identifiers
3. 2FA integration for enhanced security
4. Identity masking features for user privacy
5. Comprehensive audit logging for all transactions

### Performance Considerations
1. Implement proper pagination for list endpoints
2. Use database indexing for auction queries
3. Cache frequently accessed data in Redis
4. Optimize smart contract gas usage
5. Implement rate limiting on all endpoints

Got it ✅ — we’ll keep **Trust Me Bros (TMB)** and **Staking** as **two separate parameters**, each required at different levels depending on auction value.

Here’s a polished documentation you can drop into your platform docs:

---

# 🏛️ Trust & Staking System

To ensure legitimacy, fairness, and security across all auctions and reverse auctions, the platform implements a **two-parameter trust system**:

1. **Trust Me Bros (TMBs)** – reputation score earned through activity and reliability.
2. **Staking** – financial commitment that grows with auction value.

This system eliminates reliance on government-issued IDs while providing scalable safeguards against fraud and abuse.

---

## 1. Trust Me Bros (TMBs)

### 📌 Definition

TMBs are a **reputation metric** representing a user’s trustworthiness. Each user has a TMB score that increases or decreases based on their history and behavior on the platform.

### 📈 Earning TMBs

Users earn TMBs through:

* Successful auction completions.
* Positive buyer/seller feedback.
* On-chain history & staking consistency.
* Engagement (participation in smaller auctions, community interaction).
* Reliability (meeting deadlines, honoring bids).

### ⚠️ Losing TMBs

TMBs decrease when:

* Auctions are abandoned or defaulted.
* Fraudulent activity or disputes are confirmed.
* Repeated community downvotes or low reliability reports.

---

## 2. Staking

### 📌 Definition

Staking requires users to lock up tokens proportional to the value of the auctions they participate in. Staking ensures users have **skin in the game**.

### ⚖️ Slashing (Penalties)

If a user acts maliciously or defaults, their stake is slashed.

* **Penalty Amount:**

  $$
  Slash = \min(\text{Staked Amount}, \; \alpha \cdot \text{Auction Value})
  $$

  where $\alpha$ = penalty factor (e.g. 10–100%).

* TMB penalty is applied alongside stake loss for higher deterrence.

---

## 3. Scaling Requirements

Both TMBs and staking requirements **scale with auction value**. This prevents low-effort fraud in small auctions while ensuring serious users are well-vetted in larger ones.

### 📊 Formulas

* **TMB requirement:**

  $$
  TMBᵣ = T₀ + k₁ \cdot \log_{10}(A)
  $$

* **Stake requirement:**

  $$
  Sᵣ = S₀ \cdot (1 + k₂ \cdot \log_{10}(A))
  $$

Where:

* $A$ = Auction value (USD or token equivalent)
* $T₀$ = Base TMB requirement (e.g. 10)
* $S₀$ = Base stake requirement (e.g. \$10)
* $k₁, k₂$ = scaling constants

### Example Table

| Auction Value (A) | TMB Required | Stake Required |
| ----------------- | ------------ | -------------- |
| \$100             | 60 TMB       | \$15           |
| \$1,000           | 110 TMB      | \$25           |
| \$5,000           | 160 TMB      | \$35           |
| \$20,000          | 210 TMB      | \$45           |
| \$100,000         | 260 TMB      | \$60           |
| \$1,000,000       | 310 TMB      | \$85           |

---

## 4. Participation Rules

* **Small auctions (low A):** Users may qualify with **either** TMBs or staking.
* **Medium auctions:** Users must meet **both** TMB and staking thresholds.
* **Large auctions (high A):** Strict requirements; both TMB and stake required, penalties scaled up.

---

## 5. Summary

* **No IDs required** → privacy-preserving trust model.
* **TMBs = reputation capital** → grows over time through honest participation.
* **Staking = financial skin** → ensures users have something to lose.
* **Dynamic scaling** → small auctions remain open & accessible, high-value auctions are strongly protected.

Together, TMBs and staking create a **self-regulating ecosystem** where trust is earned, preserved, and enforced without centralized identity verification.

---

Do you want me to also add a **visual diagram (flow or tier graph)** to this documentation so it’s easier to present to stakeholders and devs?
