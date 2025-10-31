export const CLAIMS_CONTRACT_ADDRESS = (import.meta.env
  .VITE_CLAIMS_CONTRACT_ADDRESS || "") as `0x${string}` | "";

export const VERIFIER_CONTRACT_ADDRESS = (import.meta.env
  .VITE_VERIFIER_CONTRACT_ADDRESS || "") as `0x${string}` | "";

export const isContractsConfigured = () => {
  return Boolean(CLAIMS_CONTRACT_ADDRESS && CLAIMS_CONTRACT_ADDRESS.startsWith("0x"));
};
