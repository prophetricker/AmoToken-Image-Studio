/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
export type HarborRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'

export type HarborHullStyle = 'sloop' | 'dhow' | 'junk' | 'raft' | 'steamer'

export type HarborSailKind = 'main' | 'jib' | 'square' | 'top'

export type HarborFlag = 'pennant' | 'none'

export type HarborRandomSource = () => number

export type HarborBoatSpec = {
  rarity: HarborRarity
  hull: {
    color: string
    style: HarborHullStyle
  }
  sails: Array<{
    color: string
    kind: HarborSailKind
  }>
  accent: string
  flag: HarborFlag
}

export type HarborRarityDefinition = Readonly<{
  threshold: number
  dot: string
  hulls: readonly [HarborHullStyle, ...HarborHullStyle[]]
  hullColors: readonly [string, ...string[]]
  sailColors: readonly [string, ...string[]]
  accents: readonly [string, ...string[]]
  sailCount: readonly [number, number]
}>

const HARBOR_RARITY_ORDER: readonly HarborRarity[] = [
  'common',
  'uncommon',
  'rare',
  'epic',
  'legendary',
]

export const HARBOR_RARITIES: Readonly<
  Record<HarborRarity, HarborRarityDefinition>
> = {
  common: {
    threshold: 0.58,
    dot: '#8aa6a0',
    hulls: ['sloop', 'raft'],
    hullColors: ['#2a3a36', '#3a3028'],
    sailColors: ['#c8c0b0', '#b8b0a0'],
    accents: ['#6a8a84'],
    sailCount: [1, 1],
  },
  uncommon: {
    threshold: 0.85,
    dot: '#4fc092',
    hulls: ['sloop', 'dhow'],
    hullColors: ['#153f3a', '#0f3b46', '#3a2a1e'],
    sailColors: ['#f4ecdd', '#e9d8b8'],
    accents: ['#4fc092', '#2b9f96'],
    sailCount: [1, 2],
  },
  rare: {
    threshold: 0.96,
    dot: '#2b9f96',
    hulls: ['dhow', 'junk', 'sloop'],
    hullColors: ['#0f3b46', '#3a2a1e', '#243b52'],
    sailColors: ['#f4ecdd', '#c9d6d1', '#e9d8b8'],
    accents: ['#f27b59', '#4fc092'],
    sailCount: [2, 2],
  },
  epic: {
    threshold: 0.994,
    dot: '#f27b59',
    hulls: ['junk', 'steamer', 'dhow'],
    hullColors: ['#5a3327', '#243b52', '#4a2f4a'],
    sailColors: ['#f4ecdd', '#f27b59', '#2b9f96'],
    accents: ['#f27b59', '#f6c85f'],
    sailCount: [2, 3],
  },
  legendary: {
    threshold: 1,
    dot: '#f6c85f',
    hulls: ['steamer', 'junk'],
    hullColors: ['#1a2a3a', '#2a1a2a'],
    sailColors: ['#f4ecdd', '#f6c85f', '#f27b59'],
    accents: ['#f6c85f'],
    sailCount: [3, 3],
  },
}

export function createSeededRandom(seed: number): HarborRandomSource {
  let state = seed >>> 0

  return () => {
    state = (state + 0x6d2b79f5) | 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function normalizeRandomValue(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }
  return Math.min(1, Math.max(0, value))
}

export function selectHarborRarity(percentile: number): HarborRarity {
  const clamped = normalizeRandomValue(percentile)
  for (const rarity of HARBOR_RARITY_ORDER) {
    if (clamped < HARBOR_RARITIES[rarity].threshold) {
      return rarity
    }
  }
  return 'legendary'
}

function pickFrom<T>(
  pool: readonly [T, ...T[]],
  random: HarborRandomSource
): T {
  const index = Math.min(
    pool.length - 1,
    Math.floor(normalizeRandomValue(random()) * pool.length)
  )
  return pool[index] ?? pool[0]
}

function getSailKind(
  rarity: HarborRarity,
  index: number,
  random: HarborRandomSource
): HarborSailKind {
  if (index === 0) {
    return 'main'
  }
  if (index === 1) {
    if (rarity === 'uncommon') {
      return normalizeRandomValue(random()) < 0.5 ? 'jib' : 'square'
    }
    return 'jib'
  }
  return 'top'
}

function getFlag(rarity: HarborRarity, random: HarborRandomSource): HarborFlag {
  if (rarity === 'common') {
    return 'none'
  }
  if (rarity === 'uncommon') {
    return normalizeRandomValue(random()) < 0.5 ? 'pennant' : 'none'
  }
  return 'pennant'
}

export function createHarborBoat(
  random: HarborRandomSource = Math.random
): HarborBoatSpec {
  const rarity = selectHarborRarity(random())
  const metadata = HARBOR_RARITIES[rarity]
  const [minimumSails, maximumSails] = metadata.sailCount
  const sailPercentile = normalizeRandomValue(random())
  const sailCount =
    minimumSails +
    Math.min(
      maximumSails - minimumSails,
      Math.floor(sailPercentile * (maximumSails - minimumSails + 1))
    )

  return {
    rarity,
    hull: {
      style: pickFrom(metadata.hulls, random),
      color: pickFrom(metadata.hullColors, random),
    },
    sails: Array.from({ length: sailCount }, (_, index) => ({
      kind: getSailKind(rarity, index, random),
      color: pickFrom(metadata.sailColors, random),
    })),
    accent: pickFrom(metadata.accents, random),
    flag: getFlag(rarity, random),
  }
}

export function createHarborFleet(
  count: number,
  random: HarborRandomSource = Math.random
): HarborBoatSpec[] {
  const fleetSize = Math.max(0, Math.floor(count))
  return Array.from({ length: fleetSize }, () => createHarborBoat(random))
}
