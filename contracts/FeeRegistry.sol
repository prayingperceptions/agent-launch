// SPDX-License-Identifier: MIT
// FeeRegistry.sol — single immutable source of truth for the Agent Launch protocol fee.
// rate in basis points: 50 bps == 0.5%. recipient is the protocol payout address.
pragma solidity ^0.8.20;

contract FeeRegistry {
    address public immutable recipient;
    uint256 public immutable feeBps; // basis points of the single-decimal percent: 50 == 0.5%
    address public immutable deployer;

    constructor(address recipient_, uint256 feeBps_, address deployer_) {
        require(recipient_ != address(0), "FeeRegistry: zero recipient");
        require(feeBps_ > 0 && feeBps_ <= 500, "FeeRegistry: feeBps out of range (1..500)");
        recipient = recipient_;
        feeBps = feeBps_;
        deployer = deployer_;
    }

    // fee for a given supply: supply * feeBps / 10000
    function feeFor(uint256 supply) external view returns (uint256) {
        return (supply * feeBps) / 10000;
    }
}