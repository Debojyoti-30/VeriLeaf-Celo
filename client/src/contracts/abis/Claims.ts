export const CLAIMS_ABI = [
  {
    "type": "function",
    "name": "registerClaim",
    "stateMutability": "nonpayable",
    "inputs": [
      { "name": "geojson", "type": "bytes" },
      { "name": "locationName", "type": "string" }
    ],
    "outputs": []
  },
  {
    "type": "function",
    "name": "submitImpactScore",
    "stateMutability": "nonpayable",
    "inputs": [
      { "name": "user", "type": "address" },
      { "name": "impactScore", "type": "uint256" }
    ],
    "outputs": []
  }
] as const;

export type ClaimsAbi = typeof CLAIMS_ABI;
