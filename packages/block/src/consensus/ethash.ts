import type { Block } from '..'

export function ethashCanonicalDifficulty(
  block: Block,
  parentBlock: Block,
): bigint {
  return block.header.ethashCanonicalDifficulty(parentBlock.header)
}
