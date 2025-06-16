// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20, SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControlEnumerableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/extensions/AccessControlEnumerableUpgradeable.sol";

contract EHMarketV2 is AccessControlEnumerableUpgradeable {
  using SafeERC20 for IERC20;

  /// @dev Struct to hold withdraw limits for selected amount of last hours
  struct WithdrawLimit {
    /// @dev Total limit for the timeWindow
    uint256 limit;
    /// @dev Limit per user for the timeWindow
    uint256 userLimit;
    /// @notice Time window in hours
    uint16 timeWindow;
  }

  error UnauthorizedSigner();
  error TotalLimitExceeded(uint256 currentTotal, uint256 requestedAmount, uint256 configIndex);
  error UserLimitExceeded(uint256 currentTotal, uint256 requestedAmount, uint256 configIndex);
  error InvalidWithdrawLimit(uint256 limit, uint256 userLimit, uint16 timeWindow);

  event UserBalanceChanged(address indexed account, int256 amount, uint256 requestId);
  event DelegateUpdated(address indexed delegator, address indexed delegate, uint256 allowance);
  event WithdrawLimitAdded(uint16 timeWindow, uint256 limit, uint256 userLimit);
  event WithdrawLimitsUpdated(WithdrawLimit[] withdrawLimits);

  bytes32 public constant MATCHER_ROLE = keccak256("MATCHER_ROLE");
  address public collateral;

  bytes32 public constant OWNER_ROLE = keccak256("OWNER_ROLE");

  mapping(uint256 => uint256) public hourlyWithdrawals;
  mapping(uint256 => mapping(address => uint256)) public userHourlyWithdrawals;
  WithdrawLimit[] public withdrawLimits;

  /// @dev Storage gap for future upgrades.
  uint256[10] internal __gap;

  constructor() {
    _disableInitializers();
  }

  function initialize(
    address[] memory _matchers,
    address _collateral,
    address _owner,
    WithdrawLimit[] memory _initialWithdrawLimits
  ) public initializer {
    __AccessControlEnumerable_init();

    _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());
    _grantRole(OWNER_ROLE, _owner);
    for (uint i = 0; i < _matchers.length; i++) {
      _grantRole(MATCHER_ROLE, _matchers[i]);
    }
    collateral = _collateral;
    for (uint i = 0; i < _initialWithdrawLimits.length; i++) {
      withdrawLimits.push(_initialWithdrawLimits[i]);
    }
  }

  //////////////////////////
  //  User functions
  //////////////////////////

  function depositAssetTo(address to, uint256 amount) public {
    emit UserBalanceChanged(to, int256(amount), 0);
    IERC20(collateral).safeTransferFrom(_msgSender(), address(this), amount);
  }

  function depositAsset(uint256 amount) external {
    depositAssetTo(_msgSender(), amount);
  }

  function withdrawAsset(address from, uint256 amount, uint256 requestId) external {
    bool isMatcher = hasRole(MATCHER_ROLE, _msgSender());
    require(isMatcher || hasRole(OWNER_ROLE, _msgSender()), UnauthorizedSigner());
    if (isMatcher) {
      _checkWithdrawLimits(amount, from);
      uint256 currentHour = _getHour(block.timestamp);
      hourlyWithdrawals[currentHour] += amount;
      userHourlyWithdrawals[currentHour][from] += amount;
    }
    IERC20(collateral).safeTransfer(from, amount);
    emit UserBalanceChanged(from, -int256(amount), requestId);
  }

  function setDelegate(address delegate, uint256 allowance) external {
    emit DelegateUpdated(_msgSender(), delegate, allowance);
  }

  function setWithdrawLimits(WithdrawLimit[] memory _withdrawLimits) external onlyRole(OWNER_ROLE) {
    delete withdrawLimits;
    for (uint i = 0; i < _withdrawLimits.length; i++) {
      if (
        _withdrawLimits[i].limit == 0 ||
        _withdrawLimits[i].userLimit == 0 ||
        _withdrawLimits[i].timeWindow == 0 ||
        _withdrawLimits[i].limit < _withdrawLimits[i].userLimit
      ) {
        revert InvalidWithdrawLimit(
          _withdrawLimits[i].limit,
          _withdrawLimits[i].userLimit,
          _withdrawLimits[i].timeWindow
        );
      }
      withdrawLimits.push(_withdrawLimits[i]);
    }
    emit WithdrawLimitsUpdated(withdrawLimits);
  }

  function addWithdrawLimit(uint256 limit, uint256 userLimit, uint16 timeWindow) external onlyRole(OWNER_ROLE) {
    if (limit == 0 || userLimit == 0 || timeWindow == 0 || limit < userLimit) {
      revert InvalidWithdrawLimit(limit, userLimit, timeWindow);
    }
    withdrawLimits.push(WithdrawLimit(limit, userLimit, timeWindow));
    emit WithdrawLimitAdded(timeWindow, limit, userLimit);
  }

  function getTotalWithdraw(uint16 _hours, uint256 timestamp) public view returns (uint256) {
    uint256 total = 0;
    uint256 startHour = _getHour(timestamp);
    for (uint16 i = 0; i < _hours; i++) {
      total += hourlyWithdrawals[startHour - i * 1 hours];
    }
    return total;
  }

  function getTotalWithdraw(uint16 _hours, uint256 timestamp, address user) public view returns (uint256) {
    uint256 total = 0;
    uint256 startHour = _getHour(timestamp);
    for (uint16 i = 0; i < _hours; i++) {
      total += userHourlyWithdrawals[startHour - i * 1 hours][user];
    }
    return total;
  }

  function getMaxWithdrawAmount(
    address user
  ) public view returns (uint256 maxAmount, uint256 limitingIndex, bool isUserLimit) {
    maxAmount = type(uint256).max;
    limitingIndex = type(uint256).max;
    isUserLimit = false;
    uint256 timestamp = block.timestamp;
    if (withdrawLimits.length == 0) {
      return (maxAmount, limitingIndex, isUserLimit);
    }
    for (uint256 i = 0; i < withdrawLimits.length; i++) {
      WithdrawLimit memory limit = withdrawLimits[i];
      uint256 totalWithdrawn = getTotalWithdraw(limit.timeWindow, timestamp);
      uint256 globalRemaining = 0;
      if (limit.limit > totalWithdrawn) {
        globalRemaining = limit.limit - totalWithdrawn;
      } else {
        return (0, i, false);
      }
      uint256 userWithdrawn = getTotalWithdraw(limit.timeWindow, timestamp, user);
      uint256 userRemaining = 0;
      if (limit.userLimit > userWithdrawn) {
        userRemaining = limit.userLimit - userWithdrawn;
      } else {
        // User limit already reached
        return (0, i, true);
      }
      // Determine which is more restrictive
      if (userRemaining < globalRemaining) {
        if (userRemaining < maxAmount) {
          maxAmount = userRemaining;
          limitingIndex = i;
          isUserLimit = true;
        }
      } else {
        if (globalRemaining < maxAmount) {
          maxAmount = globalRemaining;
          limitingIndex = i;
          isUserLimit = false;
        }
      }
    }

    return (maxAmount, limitingIndex, isUserLimit);
  }

  function _getHour(uint256 timestamp) internal pure returns (uint256) {
    return timestamp - (timestamp % 1 hours);
  }

  function _checkWithdrawLimits(uint256 amount, address user) internal view {
    uint256 timestamp = block.timestamp;
    for (uint256 i = 0; i < withdrawLimits.length; i++) {
      WithdrawLimit memory limit = withdrawLimits[i];
      uint256 totalWithdraw = getTotalWithdraw(limit.timeWindow, timestamp);
      if (totalWithdraw + amount > limit.limit) {
        revert TotalLimitExceeded(totalWithdraw, amount, i);
      }
      uint256 userTotalWithdraw = getTotalWithdraw(limit.timeWindow, timestamp, user);
      if (userTotalWithdraw + amount > limit.userLimit) {
        revert UserLimitExceeded(userTotalWithdraw, amount, i);
      }
    }
  }
}
