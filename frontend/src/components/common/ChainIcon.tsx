import { CHAIN_META } from '@/utils/chains'

interface Props {
  chain: string
  size?: number
}

export default function ChainIcon({ chain, size = 28 }: Props) {
  const meta = CHAIN_META[chain] ?? CHAIN_META.ethereum
  return (
    <div
      className="rounded-full flex items-center justify-center font-bold shrink-0 chain-glow"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.45,
        background: meta.bgColor,
        color: meta.color,
        border: `1px solid ${meta.borderColor}`,
        boxShadow: `0 0 ${size * 0.4}px ${meta.color}40`,
      }}
    >
      {meta.letter}
    </div>
  )
}
