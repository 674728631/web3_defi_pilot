import { IntentsBatchExecuted } from "../generated/IntentExecutor/IntentExecutor";
import { IntentsBatchEvent } from "../generated/schema";

export function handleIntentsBatchExecuted(
  event: IntentsBatchExecuted
): void {
  let batchEvent = new IntentsBatchEvent(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  batchEvent.user = event.params.user;
  batchEvent.count = event.params.count;
  batchEvent.timestamp = event.block.timestamp;
  batchEvent.blockNumber = event.block.number;
  batchEvent.txHash = event.transaction.hash;
  batchEvent.save();
}
