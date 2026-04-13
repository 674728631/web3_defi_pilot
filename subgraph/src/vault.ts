import { BigInt, Bytes } from "@graphprotocol/graph-ts";
import {
  Deposited,
  Withdrawn,
  StrategyExecuted,
  PositionClosed,
  ProtocolWhitelisted,
  ETHRescued,
} from "../generated/DeFiPilotVault/DeFiPilotVault";
import {
  User,
  Position,
  VaultStats,
  DepositEvent,
  WithdrawEvent,
  StrategyEvent,
  PositionClosedEvent,
  ProtocolWhitelistEvent,
} from "../generated/schema";

const GLOBAL_STATS_ID = "global";

function getOrCreateStats(): VaultStats {
  let stats = VaultStats.load(GLOBAL_STATS_ID);
  if (!stats) {
    stats = new VaultStats(GLOBAL_STATS_ID);
    stats.totalUsers = 0;
    stats.totalDeposits = BigInt.zero();
    stats.totalWithdrawals = BigInt.zero();
    stats.totalPositionsCreated = 0;
    stats.totalPositionsClosed = 0;
    stats.totalEthRescued = BigInt.zero();
    stats.save();
  }
  return stats;
}

function getOrCreateUser(address: Bytes, timestamp: BigInt): User {
  let user = User.load(address);
  if (!user) {
    user = new User(address);
    user.ethBalance = BigInt.zero();
    user.totalDeposited = BigInt.zero();
    user.totalWithdrawn = BigInt.zero();
    user.positionCount = 0;
    user.activePositionCount = 0;
    user.firstSeenAt = timestamp;
    user.lastActivityAt = timestamp;

    let stats = getOrCreateStats();
    stats.totalUsers += 1;
    stats.save();
  }
  return user;
}

export function handleDeposited(event: Deposited): void {
  let user = getOrCreateUser(event.params.user, event.block.timestamp);
  user.ethBalance = user.ethBalance.plus(event.params.amount);
  user.totalDeposited = user.totalDeposited.plus(event.params.amount);
  user.lastActivityAt = event.block.timestamp;
  user.save();

  let stats = getOrCreateStats();
  stats.totalDeposits = stats.totalDeposits.plus(event.params.amount);
  stats.save();

  let depositEvent = new DepositEvent(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  depositEvent.user = event.params.user;
  depositEvent.amount = event.params.amount;
  depositEvent.timestamp = event.block.timestamp;
  depositEvent.blockNumber = event.block.number;
  depositEvent.txHash = event.transaction.hash;
  depositEvent.save();
}

export function handleWithdrawn(event: Withdrawn): void {
  let user = getOrCreateUser(event.params.user, event.block.timestamp);
  user.ethBalance = user.ethBalance.minus(event.params.amount);
  user.totalWithdrawn = user.totalWithdrawn.plus(event.params.amount);
  user.lastActivityAt = event.block.timestamp;
  user.save();

  let stats = getOrCreateStats();
  stats.totalWithdrawals = stats.totalWithdrawals.plus(event.params.amount);
  stats.save();

  let withdrawEvent = new WithdrawEvent(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  withdrawEvent.user = event.params.user;
  withdrawEvent.amount = event.params.amount;
  withdrawEvent.timestamp = event.block.timestamp;
  withdrawEvent.blockNumber = event.block.number;
  withdrawEvent.txHash = event.transaction.hash;
  withdrawEvent.save();
}

export function handleStrategyExecuted(event: StrategyExecuted): void {
  let user = getOrCreateUser(event.params.user, event.block.timestamp);

  // 策略执行扣减了 ethBalance，但具体金额取决于链上 executeStrategy 逻辑
  // 这里通过事件金额扣减（Vault 中 ethBalance -= amount 后 emit）
  user.ethBalance = user.ethBalance.minus(event.params.amount);
  user.positionCount += 1;
  user.activePositionCount += 1;
  user.lastActivityAt = event.block.timestamp;
  user.save();

  let posId = user.positionCount - 1;
  let positionEntityId =
    event.params.user.toHexString() + "-" + posId.toString();
  let position = new Position(positionEntityId);
  position.user = event.params.user;
  position.positionId = BigInt.fromI32(posId);
  position.protocol = event.params.protocol;
  position.amount = event.params.amount;
  position.active = true;
  position.createdAt = event.block.timestamp;
  position.createdTx = event.transaction.hash;
  position.save();

  let stats = getOrCreateStats();
  stats.totalPositionsCreated += 1;
  stats.save();

  let strategyEvent = new StrategyEvent(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  strategyEvent.user = event.params.user;
  strategyEvent.protocol = event.params.protocol;
  strategyEvent.amount = event.params.amount;
  strategyEvent.timestamp = event.block.timestamp;
  strategyEvent.blockNumber = event.block.number;
  strategyEvent.txHash = event.transaction.hash;
  strategyEvent.save();
}

export function handlePositionClosed(event: PositionClosed): void {
  let user = getOrCreateUser(event.params.user, event.block.timestamp);

  // 赎回后 ethBalance 增加
  user.ethBalance = user.ethBalance.plus(event.params.ethReceived);
  user.activePositionCount -= 1;
  user.lastActivityAt = event.block.timestamp;
  user.save();

  let positionEntityId =
    event.params.user.toHexString() +
    "-" +
    event.params.positionId.toString();
  let position = Position.load(positionEntityId);
  if (position) {
    position.active = false;
    position.closedAt = event.block.timestamp;
    position.closedTx = event.transaction.hash;
    position.ethReceived = event.params.ethReceived;
    position.save();
  }

  let stats = getOrCreateStats();
  stats.totalPositionsClosed += 1;
  stats.save();

  let closedEvent = new PositionClosedEvent(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  closedEvent.user = event.params.user;
  closedEvent.positionId = event.params.positionId;
  closedEvent.ethReceived = event.params.ethReceived;
  closedEvent.timestamp = event.block.timestamp;
  closedEvent.blockNumber = event.block.number;
  closedEvent.txHash = event.transaction.hash;
  closedEvent.save();
}

export function handleProtocolWhitelisted(event: ProtocolWhitelisted): void {
  let whitelistEvent = new ProtocolWhitelistEvent(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  whitelistEvent.protocol = event.params.protocol;
  whitelistEvent.status = event.params.status;
  whitelistEvent.timestamp = event.block.timestamp;
  whitelistEvent.txHash = event.transaction.hash;
  whitelistEvent.save();
}

export function handleETHRescued(event: ETHRescued): void {
  let stats = getOrCreateStats();
  stats.totalEthRescued = stats.totalEthRescued.plus(event.params.amount);
  stats.save();
}
