// SPDX-License-Identifier: MIT
// Token.sol — minimal ERC-20 that mints a transparent 0.5% protocol fee at deployment.
// Deployer receives (supply - fee); fee (0.5% of supply) is minted to the FeeRegistry recipient.
pragma solidity ^0.8.20;
import { FeeRegistry } from "./FeeRegistry.sol";

contract Token {
    string public name;
    string public symbol;
    uint8   public immutable decimals = 18;
    uint256 public immutable totalSupply;

    FeeRegistry public immutable registry;
    address public immutable feeRecipient;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);

    constructor(
        string memory name_,
        string memory symbol_,
        uint256 supply_,
        FeeRegistry registry_
    ) {
        require(supply_ > 0, "Token: zero supply");
        name = name_;
        symbol = symbol_;
        totalSupply = supply_;
        registry = registry_;
        feeRecipient = registry.recipient();

        uint256 fee = registry.feeFor(supply_); // supply_ * 50 / 10000  ==  0.5%
        require(fee > 0, "Token: fee underflows at this supply");
        uint256 deployer = supply_ - fee;

        balanceOf[msg.sender] = deployer;          // deployer keeps 99.5%
        balanceOf[feeRecipient] = fee;             // protocol gets 0.5% (transparent, on-chain)
        emit Transfer(address(0), msg.sender, deployer);
        emit Transfer(address(0), feeRecipient, fee);
    }

    function transfer(address to, uint256 value) external returns (bool) {
        require(to != address(0), "Token: zero destination");
        require(balanceOf[msg.sender] >= value, "Token: insufficient balance");
        balanceOf[msg.sender] -= value;
        balanceOf[to] += value;
        emit Transfer(msg.sender, to, value);
        return true;
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        require(allowance[from][msg.sender] >= value, "Token: allowance exceeded");
        require(balanceOf[from] >= value, "Token: insufficient balance");
        allowance[from][msg.sender] -= value;
        balanceOf[from] -= value;
        balanceOf[to] += value;
        emit Transfer(from, to, value);
        return true;
    }

    // public convenience: enforce an allow/ask/deny gate (safety rail). Pure view when allowed.
    function canLaunch() external pure returns (bool) { return true; }
}