// SPDX-License-Identifier: MIT
// test/TokenFee.t.sol — M1 gate: a Token deployment must mint exactly 0.5% to the protocol recipient.
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {FeeRegistry} from "../contracts/FeeRegistry.sol";
import {Token} from "../contracts/Token.sol";

contract TokenFeeTest is Test {
    uint256 internal constant FEE_BPS = 50; // 0.5%
    uint256 internal constant SUPPLY = 1_000_000 ether; // 1e24
    uint256 internal constant EXPECTED_FEE = (SUPPLY * FEE_BPS) / 10000; // 0.5%

    address internal deployer;
    address internal feeTo;
    FeeRegistry internal registry;
    Token internal token;

    function setUp() public {
        deployer = address(0x1111);
        feeTo = address(0x2222);
        vm.prank(deployer);
        registry = new FeeRegistry(feeTo, FEE_BPS, deployer);
        vm.prank(deployer); // prank is per-call: re-sign as deployer before Token deploy
        token = new Token("Agent Token", "AGT", SUPPLY, registry);
    }

    function test_feeFor_is_005_percent() public view {
        assertEq(registry.feeFor(SUPPLY), EXPECTED_FEE);
        assertEq(EXPECTED_FEE, 5000 ether); // 0.5% of 1M == 5k
    }

    function test_registry_immutable_recipient_and_rate() public view {
        assertEq(registry.recipient(), feeTo);
        assertEq(registry.feeBps(), FEE_BPS);
        assertEq(registry.deployer(), deployer);
    }

    function test_deployer_receives_supply_minus_fee() public view {
        assertEq(token.balanceOf(deployer), SUPPLY - EXPECTED_FEE);
    }

    function test_protocol_receives_exactly_half_percent() public view {
        assertEq(token.feeRecipient(), feeTo);
        assertEq(token.balanceOf(feeTo), EXPECTED_FEE);
    }

    function test_fee_is_exactly_005_never_more() public view {
        // fee === floor(supply*50/10000); supply is divisible so no rounding drift
        assertLe(token.balanceOf(feeTo), EXPECTED_FEE);
        assertEq(token.balanceOf(feeTo), (SUPPLY * FEE_BPS) / 10000);
    }

    function test_supply_conserved() public view {
        assertEq(token.balanceOf(deployer) + token.balanceOf(feeTo), SUPPLY);
    }

    function test_revert_on_zero_fee_supply() public {
        // a tiny supply that underflows the fee to 0 must revert (fail-closed)
        vm.prank(deployer);
        vm.expectRevert();
        new Token("Micro", "MIC", 1, registry); // 1 * 50/10000 == 0 -> revert
    }
}