const Web3 = require("web3");
const {
  BN,
  expectRevert,
  expectEvent,
  time,
  balance,
} = require("@openzeppelin/test-helpers");
const {
  createRLPHeader,
  calculateBlockHash,
  addToHex,
} = require("../utils/utils");
// const expectEvent = require('./expectEvent');
const RLP = require("rlp");
const { bufArrToArr, arrToBufArr, toBuffer } = require("ethereumjs-util");

const { INFURA_ENDPOINT } = require("../constants");
const LOCAL_ENDPOINT = "http://127.0.0.1:7545";

const Ethrelay = artifacts.require("./EthrelayTestContract");
const Ethash = artifacts.require("./Ethash");
const VerifyTransaction = artifacts.require("./VerifyTransaction");
const { expect } = require("chai");
const { web3 } = require("@openzeppelin/test-helpers/src/setup");
const { duration } = require("@openzeppelin/test-helpers/src/time");

const EPOCH = 470;
const GENESIS_BLOCK = 14119813;

expect(
  Math.floor(GENESIS_BLOCK / 30000),
  "genesis block not in epoch"
).to.equal(EPOCH);

const ZERO_HASH =
  "0x0000000000000000000000000000000000000000000000000000000000000000";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const LOCK_PERIOD = time.duration.minutes(5);
const ALLOWED_FUTURE_BLOCK_TIME = time.duration.seconds(15);
const MAX_GAS_LIMIT = 2n ** 63n - 1n;
const MIN_GAS_LIMIT = 5000;
const GAS_LIMIT_BOUND_DIVISOR = 1024n;
const GAS_PRICE_IN_WEI = new BN(137140710);
contract("VerifyTransactionTest", async (accounts) => {
  let ethrelay;
  let ethash;
  let verifyTx;
  let sourceWeb3;

  before(async () => {
    // await time.advanceBlockTo(GENESIS_BLOCK);
    sourceWeb3 = new Web3(INFURA_ENDPOINT);
    // sourceWeb3 = new Web3(LOCAL_ENDPOINT);
    ethash = await Ethash.new();
    const epochData = require("./epoch.json");

    console.log(`Submitting data for epoch ${EPOCH} to Ethash contract...`);
    await submitEpochData(
      ethash,
      EPOCH,
      epochData.FullSizeIn128Resolution,
      epochData.BranchDepth,
      epochData.MerkleNodes
    );
    console.log("Submitted epoch data.");

    // Advance to the next block to correctly read time in the solidity "now" function interpreted by ganache
    await time.advanceBlock();
  });

  beforeEach(async () => {
    const genesisBlock = await sourceWeb3.eth.getBlock(GENESIS_BLOCK);
    const genesisRlpHeader = createRLPHeader(genesisBlock);
    ethrelay = await Ethrelay.new(
      genesisRlpHeader,
      genesisBlock.totalDifficulty,
      ethash.address,
      {
        from: accounts[0],
        gasPrice: GAS_PRICE_IN_WEI,
      }
    );
    verifyTx = await VerifyTransaction.new(ethrelay.address);
  });

  describe("Get Functions", function () {
    it("should successfully get required stake per block", async () => {
      const requiredStakePerBlock = await verifyTx.getRequiredStakePerBlock();
      const requiredStakePerBlockEthrelay =
        await ethrelay.getRequiredStakePerBlock();
      expect(
        requiredStakePerBlock,
        "Required stake per block doesn't match"
      ).to.be.bignumber.equal(requiredStakePerBlockEthrelay);
    });

    it("should successfully get verification fee", async () => {
      const verificationFee = await verifyTx.getRequiredVerificationFee();
      const verificationFeeEthrelay =
        await ethrelay.getRequiredVerificationFee();
      expect(
        verificationFee,
        "Required stake per block doesn't match"
      ).to.be.bignumber.equal(verificationFeeEthrelay);
    });
  });

  describe("Deposit", function () {
    it("should successfully deposit", async () => {
      const requiredStakePerBlock = await verifyTx.getRequiredStakePerBlock();
      let ret = await verifyTx.deposit({ value: requiredStakePerBlock });
      expectEvent(
        ret,
        "Deposit",
        { res: true },
        "Failed to call Ethrelay SC depositStake"
      );
      expect(
        await ethrelay.getStake({ from: verifyTx.address }),
        "Failed deposit to Ethrelay SC"
      ).to.be.bignumber.equal(requiredStakePerBlock);
    });
  });

  describe("Submit Data", function () {
    it("should successfully submit and verify block data", async () => {
      const requiredStakePerBlock = await verifyTx.getRequiredStakePerBlock();
      await verifyTx.deposit({ value: requiredStakePerBlock.mul(new BN(2)) });
      const {
        DatasetLookup: dataSetLookupBlock,
        WitnessForLookup: witnessForLookupBlock,
      } = require("./pow/genesisPlus2.json");

      const block1 = await sourceWeb3.eth.getBlock(GENESIS_BLOCK + 1);
      const block2 = await sourceWeb3.eth.getBlock(GENESIS_BLOCK + 2);
      await verifyTx.submitBlock(GENESIS_BLOCK + 1, createRLPHeader(block1));
      let tx = await verifyTx.submitAndVerifyBlock(
        GENESIS_BLOCK + 2,
        createRLPHeader(block2),
        createRLPHeader(block1),
        dataSetLookupBlock,
        witnessForLookupBlock
      );

      expectEvent(tx, "SubmittedBlock", {
        blockNumber: new BN(GENESIS_BLOCK + 2),
      });
      let ret = await ethrelay.isHeaderStored(block2.hash);
      expect(ret, "Block data isn't submitted to Ethrelay SC").to.be.true;
    });

    it("should successfully submit tx data", async () => {
      const {
        TxHash,
        Value,
        Path,
        Nodes,
      } = require("./transactions/genesisPlus1.json");
      let tx = await verifyTx.submitTx(TxHash, Value, Path, Nodes);

      expectEvent(tx, "SubmittedTx", { txHash: TxHash });
    });
  });

  // describe("Verify Block", function () {
  //   it("should successfully verify block", async () => {
  //     const requiredStakePerBlock = await verifyTx.getRequiredStakePerBlock();
  //     const stake = requiredStakePerBlock.mul(new BN(6));
  //     await verifyTx.deposit({ value: stake });

  //     // const parentNumber = GENESIS_BLOCK + 2;
  //     // const childNumber = GENESIS_BLOCK + 3;

  //     const blocks = [];
  //     const block0 = await sourceWeb3.eth.getBlock(GENESIS_BLOCK);
  //     blocks.push(block0);
  //     const block1 = await sourceWeb3.eth.getBlock(GENESIS_BLOCK + 1);
  //     blocks.push(block1);
  //     const block2 = await sourceWeb3.eth.getBlock(GENESIS_BLOCK + 2);
  //     blocks.push(block2);
  //     const block3 = await sourceWeb3.eth.getBlock(GENESIS_BLOCK + 3);
  //     blocks.push(block3);
  //     const block4 = await sourceWeb3.eth.getBlock(GENESIS_BLOCK + 4);
  //     blocks.push(block4);
  //     const block5 = await sourceWeb3.eth.getBlock(GENESIS_BLOCK + 5);
  //     blocks.push(block5);
  //     const block6 = await sourceWeb3.eth.getBlock(GENESIS_BLOCK + 6);
  //     blocks.push(block6);
  //     await verifyTx.submitBlock(GENESIS_BLOCK + 1, createRLPHeader(block1));
  //     await verifyTx.submitBlock(GENESIS_BLOCK + 2, createRLPHeader(block2));
  //     await verifyTx.submitBlock(GENESIS_BLOCK + 3, createRLPHeader(block3));
  //     await verifyTx.submitBlock(GENESIS_BLOCK + 4, createRLPHeader(block4));
  //     await verifyTx.submitBlock(GENESIS_BLOCK + 5, createRLPHeader(block5));
  //     await verifyTx.submitBlock(GENESIS_BLOCK + 6, createRLPHeader(block6));

  //     for (let i = 1; i < 6; i++) {

  //     const {
  //       DatasetLookup: dataSetLookupBlock,
  //       WitnessForLookup: witnessForLookupBlock,
  //     } = require("./pow/genesisPlus2.json");
  //     let ret = await ethrelay.disputeBlockWithoutPunishment(
  //       createRLPHeader(blocks[i + 1]),
  //       createRLPHeader(block1[i]),
  //       dataSetLookupBlock,
  //       witnessForLookupBlock
  //     );
  //     expectEvent(ret, "DisputeBlock", { returnCode: new BN(0) });
  //     }
  //   });
  // });

  describe("TxMetaData", function () {
    it("should submit and get tx meta data", async () => {
      const { TxHash } = require("./transactions/genesisPlus1.json");
      const tx = await sourceWeb3.eth.getTransaction(TxHash);

      await verifyTx.submitTxMetaData(TxHash, tx.from, tx.to, tx.input);
      const res = await verifyTx.getTxMetaData(TxHash);

      expect(res[0]).to.equal(tx.from);
      expect(res[1]).to.equal(tx.to);
      expect(res[2]).to.equal(tx.input);
    });
  });

  describe("VerifyTransaction", function () {
    // Test Scenario 1:
    //
    //        tx    claim
    //        |     |
    //        v     v
    // (0)---(1)---(2)---(3)---(4)---(5)---(6)
    //
    it("should verify fake tx", async () => {
      // deposit enough stake
      const requiredStakePerBlock = await verifyTx.getRequiredStakePerBlock();
      const stake = requiredStakePerBlock.mul(new BN(6));
      await verifyTx.deposit({ value: stake });
      const verificationFee = await verifyTx.getRequiredVerificationFee();
      // Create expected chain
      const block1 = await sourceWeb3.eth.getBlock(GENESIS_BLOCK + 1);
      const block2 = await sourceWeb3.eth.getBlock(GENESIS_BLOCK + 2);
      const block3 = await sourceWeb3.eth.getBlock(GENESIS_BLOCK + 3);
      const block4 = await sourceWeb3.eth.getBlock(GENESIS_BLOCK + 4);
      const block5 = await sourceWeb3.eth.getBlock(GENESIS_BLOCK + 5);
      const block6 = await sourceWeb3.eth.getBlock(GENESIS_BLOCK + 6);
      const {
        TxHash,
        Value,
        Path,
        Nodes,
      } = require("./transactions/genesisPlus1.json");

      const expectedBlocks = [
        {
          block: block1,
        },
        {
          block: block2,
        },
        {
          block: block3,
        },
        {
          block: block4,
        },
        {
          block: block5,
        },
        {
          block: block6,
        },
      ];

      await submitBlockHeaders(expectedBlocks);
      await time.increaseTo(
        expectedBlocks[expectedBlocks.length - 1].lockedUntil
      );
      await time.increase(time.duration.seconds(1));
      await verifyTx.submitTx(TxHash, Value, Path, Nodes);

      let ret = await verifyTx.verify(
        GENESIS_BLOCK + 2,
        TxHash,
        expectedBlocks.length - 2,
        {
          value: verificationFee,
        }
      );
      // console.log(ret);
      expectEvent(ret, "Verify", {
        res: web3.utils.bytesToHex(Buffer.alloc(32).fill(1, 31)),
      });
    });

    // Test Scenario 2:
    //
    //              tx
    //              |
    //              v
    // (0)---(1)---(2)---(3)---(4)---(5)
    //
    it("should verfiy true tx", async () => {
      // deposit enough stake
      const requiredStakePerBlock = await verifyTx.getRequiredStakePerBlock();
      const stake = requiredStakePerBlock.mul(new BN(6));
      await verifyTx.deposit({ value: stake });
      const verificationFee = await verifyTx.getRequiredVerificationFee();
      // Create expected chain
      const block1 = await sourceWeb3.eth.getBlock(GENESIS_BLOCK + 1);
      const block2 = await sourceWeb3.eth.getBlock(GENESIS_BLOCK + 2);
      const block3 = await sourceWeb3.eth.getBlock(GENESIS_BLOCK + 3);
      const block4 = await sourceWeb3.eth.getBlock(GENESIS_BLOCK + 4);
      const block5 = await sourceWeb3.eth.getBlock(GENESIS_BLOCK + 5);
      const block6 = await sourceWeb3.eth.getBlock(GENESIS_BLOCK + 6);
      const {
        TxHash,
        Value,
        Path,
        Nodes,
      } = require("./transactions/genesisPlus2.json");

      const expectedBlocks = [
        {
          block: block1,
        },
        {
          block: block2,
        },
        {
          block: block3,
        },
        {
          block: block4,
        },
        {
          block: block5,
        },
        {
          block: block6,
        },
      ];

      await submitBlockHeaders(expectedBlocks);
      await time.increaseTo(
        expectedBlocks[expectedBlocks.length - 1].lockedUntil
      );
      await time.increase(time.duration.seconds(1));
      await verifyTx.submitTx(TxHash, Value, Path, Nodes);

      let ret = await verifyTx.verify(GENESIS_BLOCK + 2, TxHash, expectedBlocks.length - 2, {
        value: verificationFee,
      });
      expectEvent(ret, "Verify", {
        res: web3.utils.bytesToHex(Buffer.alloc(32)),
      });
    });
  });

  const submitEpochData = async (
    ethashContractInstance,
    epoch,
    fullSizeIn128Resolution,
    branchDepth,
    merkleNodes
  ) => {
    let start = new BN(0);
    let nodes = [];
    let mnlen = 0;
    let index = 0;
    for (let mn of merkleNodes) {
      nodes.push(mn);
      if (nodes.length === 40 || index === merkleNodes.length - 1) {
        mnlen = new BN(nodes.length);

        if (index < 440 && epoch === 128) {
          start = start.add(mnlen);
          nodes = [];
          return;
        }

        await ethashContractInstance.setEpochData(
          epoch,
          fullSizeIn128Resolution,
          branchDepth,
          nodes,
          start,
          mnlen
        );

        start = start.add(mnlen);
        nodes = [];
      }
      index++;
    }
  };

  const submitBlockHeaders = async (expectedHeaders) => {
    await asyncForEach(expectedHeaders, async (expected) => {
      const rlpHeader = createRLPHeader(expected.block);
      await time.increase(time.duration.seconds(15));
      await verifyTx.submitBlock(expected.block.number, rlpHeader);
      const submitTime = await time.latest();
      expected.lockedUntil = submitTime.add(LOCK_PERIOD);
    });
  };

  const asyncForEach = async (array, callback) => {
    for (let index = 0; index < array.length; index++) {
      await callback(array[index], index, array);
    }
  };
});
