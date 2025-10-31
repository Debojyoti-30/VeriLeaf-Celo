const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  const verifierArg = process.env.VERIFIER_ADDRESS || deployer.address;
  console.log("Verifier:", verifierArg);

  const Factory = await hre.ethers.getContractFactory("VeriLeafClaims");
  const contract = await Factory.deploy(verifierArg);
  await contract.deployed();
  console.log("VeriLeafClaims deployed at:", contract.address);

  // For frontend env convenience
  console.log("\nSet this in client/.env:");
  console.log("VITE_CLAIMS_CONTRACT_ADDRESS=" + contract.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
