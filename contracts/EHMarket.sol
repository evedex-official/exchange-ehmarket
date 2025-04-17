// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20, SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControlEnumerable} from "@openzeppelin/contracts/access/extensions/AccessControlEnumerable.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

contract EHMarket is AccessControlEnumerable {
  using SafeERC20 for IERC20;
  using ECDSA for bytes32;
  using MessageHashUtils for bytes32;

  error UnauthorizedSigner();

  event UserBalanceChanged(address indexed account, int256 amount, uint256 requestId);
  event DelegateUpdated(address indexed delegator, address indexed delegate, uint256 allowance);

  bytes32 public constant MATCHER_ROLE = keccak256("MATCHER_ROLE");
  address public immutable COLLATERAL;

  constructor(address[] memory _matchers, address _collateral) {
    _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());
    for (uint i = 0; i < _matchers.length; i++) {
      _grantRole(MATCHER_ROLE, _matchers[i]);
    }
    COLLATERAL = _collateral;
  }

  //////////////////////////
  //  User functions
  //////////////////////////

  function depositAssetTo(address to, uint256 amount) public {
    emit UserBalanceChanged(to, int256(amount), 0);
    IERC20(COLLATERAL).safeTransferFrom(_msgSender(), address(this), amount);
  }

  function depositAsset(uint256 amount) external {
    depositAssetTo(_msgSender(), amount);
  }

  function withdrawAsset(address from, uint256 amount, uint256 requestId) external {
    require(hasRole(MATCHER_ROLE, _msgSender()), UnauthorizedSigner());
    emit UserBalanceChanged(from, -int256(amount), requestId);
    IERC20(COLLATERAL).safeTransfer(from, amount);
  }

  function setDelegate(address delegate, uint256 allowance) external {
    emit DelegateUpdated(_msgSender(), delegate, allowance);
  }
}
