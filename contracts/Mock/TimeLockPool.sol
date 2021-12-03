// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../interfaces/ITimeLockPool.sol";

contract MockStakingPool is ITimeLockPool,ERC20 {
    constructor() ERC20("Test", "TEST") {}

    function deposit(uint256 _amount, uint256 _duration, address _receiver) override external{
        _mint(_receiver,_amount);
    }
}