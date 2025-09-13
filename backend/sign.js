// sign.js
import { ethers } from "ethers";
import fetch from "node-fetch"; // install with: npm install node-fetch

// Replace with your backend URL
const BASE_URL = "http://localhost:5000/api/v1/users/login";

// Create dev wallet
const wallet = ethers.Wallet.createRandom();

(async () => {
  // STEP 1: Request login (without signature)
  const step1Payload = { walletAddress: wallet.address };
  const step1Response = await fetch(BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" }, 
    body: JSON.stringify(step1Payload),
  });
  const step1Data = await step1Response.json();

  console.log("\n===== STEP 1 Response (from backend) =====");
  console.log(JSON.stringify(step1Data, null, 2));

  // Extract nonce + message from backend response
  const { nonce, message } = step1Data;

  // STEP 2: Sign the exact backend message
  const signature = await wallet.signMessage(message);
  const step2Payload = {
    walletAddress: wallet.address,
    signature,
  };

  console.log("\n===== STEP 2 (Send this to /login to verify) =====");
  console.log(JSON.stringify(step2Payload, null, 2));

  console.log("\n⚠️ Save this private key ONLY for testing:");
  console.log("Private Key:", wallet.privateKey);
})();
