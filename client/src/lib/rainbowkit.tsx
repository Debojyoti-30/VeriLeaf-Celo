// // src/lib/rainbowkit.tsx (no WalletConnect)
// import '@rainbow-me/rainbowkit/styles.css';
// import { RainbowKitProvider } from '@rainbow-me/rainbowkit';
// import { createConfig, http, WagmiProvider } from 'wagmi';
// import { injected } from 'wagmi/connectors';
// import { coinbaseWallet } from 'wagmi/connectors';
// import { mainnet, polygon, sepolia } from 'wagmi/chains';
// import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// const config = createConfig({
//   chains: [mainnet, polygon, sepolia],
//   transports: {
//     [mainnet.id]: http(), [polygon.id]: http(), [sepolia.id]: http(),
//   },
//   connectors: [
//     injected({ shimDisconnect: true }),        // MetaMask/Brave/OKX in browser
//     coinbaseWallet({ appName: 'VeriLeaf' }),   // Coinbase Wallet SDK
//   ],
//   ssr: false,
// });

// const queryClient = new QueryClient();
// export function RainbowKitWrapper({ children }: { children: React.ReactNode }) {
//   return (
//     <WagmiProvider config={config}>
//       <QueryClientProvider client={queryClient}>
//         <RainbowKitProvider>{children}</RainbowKitProvider>
//       </QueryClientProvider>
//     </WagmiProvider>
//   );
// }


// rainbowkit.tsx
import '@rainbow-me/rainbowkit/styles.css';
import { RainbowKitProvider } from '@rainbow-me/rainbowkit';
import { createConfig, http, WagmiProvider } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { coinbaseWallet } from 'wagmi/connectors';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Custom chain: Celo Sepolia Testnet (per user specification)
const CELO_SEPOLIA_RPC = (import.meta as any).env?.VITE_CELO_SEPOLIA_RPC_URL || 'https://forno.celo-sepolia.celo-testnet.org';
const celoSepolia = {
  id: 11142220,
  name: 'Celo Sepolia Testnet',
  nativeCurrency: { name: 'CELO', symbol: 'CELO', decimals: 18 },
  rpcUrls: {
    default: { http: [CELO_SEPOLIA_RPC] },
    public: { http: [CELO_SEPOLIA_RPC] },
  },
  blockExplorers: {
    default: { name: 'CeloScan', url: 'https://sepolia.celoscan.io' },
  },
  testnet: true as const,
};

// If you have Alchemy/QuickNode URLs, put them here for reliability:
const config = createConfig({
  // Only target Celo Sepolia Testnet as requested
  chains: [celoSepolia],
  transports: { [celoSepolia.id]: http(CELO_SEPOLIA_RPC) },
  connectors: [
    injected({ shimDisconnect: true }),
    coinbaseWallet({ appName: 'VeriLeaf' }),
  ],
  ssr: false,
});

const queryClient = new QueryClient();

export function RainbowKitWrapper({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>{children}</RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
