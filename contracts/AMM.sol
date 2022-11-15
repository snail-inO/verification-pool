// SPDX-License-Identifier: MIT
pragma solidity >=0.7.0 <0.9.0;

import "./Token.sol";

abstract contract VerifyTransactionInterface {
    // function verify(uint24 blockNumber, bytes32 txHash, uint8 noOfConfirmations) payable public virtual returns (bool);
    function getTxMetaData(bytes32 txHash) public view virtual returns (address, address, bytes memory);
    function getRequiredVerificationFee() public view virtual returns (uint);
} 
contract Pool {
    BaddToken tokenX;
    BaddToken tokenY;
    VerifyTransactionInterface verifier;
    address payable contractAddress;
    mapping(bytes32 => bool) usedTxs;

    // _tokenX and _tokenY are contract-addresses running BaddToken SC
    constructor(address _tokenX, address _tokenY, address payable _verifier){
        tokenX = BaddToken(_tokenX); tokenY = BaddToken(_tokenY);
        contractAddress = _verifier;
        verifier = VerifyTransactionInterface(_verifier);
    }

    function swapXY(uint amountX, bytes32 txHash, uint24 blockNumber) public payable {
        require(identifyTransaction(amountX, txHash, blockNumber), "Transaction identification failed");
        // identifyTransaction(amountX, txHash, blockNumber);

        uint x_balance_before = tokenX.balanceOf(address(this));
        uint y_balance_before = tokenY.balanceOf(address(this));
        uint product = x_balance_before * y_balance_before;
        
        tokenY.transfer(msg.sender, y_balance_before - product / (x_balance_before + amountX));
        usedTxs[txHash] = true;
    }

    function undo_transfer(uint amountX, bytes32 txHash, uint24 blockNumber) public payable {
        require(identifyTransaction(amountX, txHash, blockNumber), "Transaction identification failed");
        // identifyTransaction(amountX, txHash, blockNumber);

        tokenX.transfer(msg.sender, amountX);
        usedTxs[txHash] = true;
    }

    event IdentifyTransaction(address from, address to, bytes input);
    event LogRes(bytes res, bytes expect);
    function identifyTransaction(uint amountX, bytes32 txHash, uint24 blockNumber) internal returns (bool) {
        if (usedTxs[txHash]) {
            return false;
        }

        address from;
        address to;
        bytes memory input;

        (from, to, input) = verifier.getTxMetaData(txHash);
        emit IdentifyTransaction(from, to, input);
        bytes memory ref = abi.encodeWithSignature("transfer(address,uint256)", address(this), amountX);
        emit IdentifyTransaction(msg.sender, address(tokenX), ref);
        if(from != msg.sender || to != address(tokenX) || !compareBytes(ref, input)) {
            return false;
        }

        uint verifyFee = verifier.getRequiredVerificationFee();
        require(msg.value >= verifyFee, "Not enough verification fee");
        // return true;
        (bool success , bytes memory data) = contractAddress.call{value: verifyFee}(
            abi.encodeWithSignature("verify(uint24,bytes32,uint8)", blockNumber, txHash, 6)
        );
        emit LogRes(data, abi.encodePacked(uint(1)));
        if (success) {
            return compareBytes(data, abi.encodePacked(uint(1)));
        } else {
            return false;
        }
    }

    function compareBytes(bytes memory b1, bytes memory b2) internal pure returns (bool) {
        if (b1.length != b2.length) {
            return false;
        }

        for (uint i = 0; i < b1.length; i++) {
            if (b1[i] != b2[i]) {
                return false;
            }
        }

        return true;
    }

}