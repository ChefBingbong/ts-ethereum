import type { BlockManager } from '../block-functional'

export function ethashCanonicalDifficulty(
  block: BlockManager,
  parentBlock: BlockManager,
): bigint {
  return block.header.ethashCanonicalDifficulty({
    timestamp: parentBlock.header.header.data.timestamp,
    difficulty: parentBlock.header.header.data.difficulty,
    uncleHash: parentBlock.header.header.data.uncleHash,
    gasLimit: parentBlock.header.header.data.gasLimit,
  })
}
