const { INFURA_ENDPOINT } = require("../constants");

const Ethrelay = artifacts.require("Ethrelay");
const Ethash = artifacts.require("Ethash");
const VerifyTransaction = artifacts.require("VerifyTransaction");
const AMM = artifacts.require("Pool");
const Token = artifacts.require("BaddToken");

const Web3 = require('web3');
const { createRLPHeader } = require('../utils/utils');

module.exports = async function(deployer) {
  const targetWeb3 = new Web3(INFURA_ENDPOINT);
  const GENESIS_BLOCK = 8084509;

  // deploy Ethash
  await deployer.deploy(Ethash);

  // deploy Ethrelay
  const genesisBlock = await targetWeb3.eth.getBlock(GENESIS_BLOCK);
  const genesisRlpHeader = createRLPHeader(genesisBlock);
  await deployer.deploy(Ethrelay,
      genesisRlpHeader, // 0xf90217a0f325431224239d833b7d870b4d6d7fd2e6ab4b80857022daa012a9a08277e09fa01dcc4de8dec75d7aab85b567b6ccd41ad312451b948a7413f0a142fd40d493479406b8c5883ec71bc3f4b332081519f23834c8706ea00ceb1811de623435b9e6e35e75b2faa0e732d364b2a3781bc6e9d6b5212b860ba056e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421a056e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421b90100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000008707896d68b38322837b5c1d837a120080845d1ddeaa99d883010817846765746888676f312e31302e34856c696e7578a04db51f8d4a4200dbdcbf0bd0c7bd8c104dfcfa61fb5ba7ef767183f86b1d57d588c23b0a7000b8c2c7"
      genesisBlock.totalDifficulty,
      Ethash.address
  );
  await deployer.deploy(VerifyTransaction, Ethrelay.address);
  const tokenX = await deployer.deploy(Token, "TokenX", 100);
  const tokenY = await deployer.deploy(Token, "TokenY", 100);
  await deployer.deploy(AMM, tokenX.address, tokenY.address, VerifyTransaction.address);
};
