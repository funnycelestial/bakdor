/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_WS_URL: string;
  readonly VITE_WKC_CONTRACT_ADDRESS: string;
  readonly VITE_AUCTION_CONTRACT_ADDRESS: string;
  readonly VITE_ESCROW_CONTRACT_ADDRESS: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare global {
  interface Window {
    ethereum?: any;
  }
}
