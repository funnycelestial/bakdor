// controllers/webhookController.js
import { confirmPurchase, confirmPayout } from './paymentGatewayController.js';
import { verifySignature } from '../utils/security.js';

// Generic webhook router
export const handlePurchaseWebhook = async (req, res) => {
  try {
    const processor = req.params.processor;
    const payload = req.body;

    // Verify authenticity (implementation varies by processor)
    if (!verifySignature(processor, payload)) {
      return res.status(401).json({ message: 'Invalid signature' });
    }

    // Route to processor-specific parser
    const { processorId, amount } = parseWebhookPayload(processor, payload);
    await confirmPurchase(processorId, amount);

    res.json({ success: true });
  } catch (error) {
    console.error('Webhook failed:', error);
    res.status(500).json({ success: false });
  }
};

// Similar handler for payout webhooks...