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
import { Fragment, type JSX, type ReactNode } from 'react'

import type { HarborBoatSpec } from './harbor-fleet'

const RARITY_TIER = {
  common: 0,
  uncommon: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
} satisfies Record<HarborBoatSpec['rarity'], number>

type HarborSail = HarborBoatSpec['sails'][number]

export type HarborBoatProps = {
  spec: HarborBoatSpec
}

function renderSail(
  sail: HarborSail,
  index: number,
  tier: number,
  accent: string
): ReactNode {
  const shadowTransform = 'translate(2 2)'

  if (sail.kind === 'main') {
    const path = `M53 ${9 - tier} L53 57 L86 57`
    return (
      <Fragment key={`${sail.kind}-${index}`}>
        <path d={path} fill='#00000014' transform={shadowTransform} />
        <path d={path} fill={sail.color} />
        {tier >= 1 ? (
          <line
            x1='53'
            y1={28 - tier}
            x2='78'
            y2='57'
            stroke={accent}
            strokeWidth='1.5'
          />
        ) : null}
      </Fragment>
    )
  }

  if (sail.kind === 'jib') {
    const path = 'M51 15 L51 57 L20 57'
    return (
      <Fragment key={`${sail.kind}-${index}`}>
        <path d={path} fill='#00000014' transform={shadowTransform} />
        <path d={path} fill={sail.color} />
      </Fragment>
    )
  }

  if (sail.kind === 'square') {
    const path = `M28 ${15 - tier} H76 L72 48 H32`
    return (
      <Fragment key={`${sail.kind}-${index}`}>
        <path d={path} fill={sail.color} />
        {tier >= 3 ? (
          <path
            d={`M52 ${20 - tier} L62 38 L42 38`}
            fill={accent}
            opacity='0.55'
          />
        ) : null}
      </Fragment>
    )
  }

  const path = `M53 ${9 - tier} L53 ${26 - tier} L74 ${24 - tier}`
  return (
    <Fragment key={`${sail.kind}-${index}`}>
      <path d={path} fill='#00000014' transform={shadowTransform} />
      <path d={path} fill={sail.color} />
    </Fragment>
  )
}

function renderPennants(spec: HarborBoatSpec, tier: number): ReactNode {
  if (spec.flag !== 'pennant' || spec.hull.style === 'raft') {
    return null
  }

  const y = 8 - tier
  return (
    <>
      <path
        className='amotoken-pennant'
        d={`M53 ${y} L71 ${y + 4} L53 ${y + 9}`}
        fill={spec.accent}
      />
      {spec.rarity === 'legendary' ? (
        <path
          className='amotoken-pennant'
          d={`M53 ${y + 11} L68 ${y + 15} L53 ${y + 19}`}
          fill='#f4ecdd'
          opacity='0.85'
        />
      ) : null}
    </>
  )
}

function renderHull(
  spec: HarborBoatSpec,
  tier: number,
  mastColor: string
): ReactNode {
  if (spec.hull.style === 'sloop') {
    return (
      <>
        <path d='M18 60 H90 L82 78 H26' fill={spec.hull.color} />
        {tier >= 1 ? (
          <path
            d='M26 68 H82'
            fill='none'
            stroke={spec.accent}
            strokeWidth='1.5'
            opacity='0.45'
          />
        ) : null}
      </>
    )
  }

  if (spec.hull.style === 'dhow') {
    return (
      <>
        <path
          d='M12 62 Q52 88 96 60 L90 74 Q52 84 18 74'
          fill={spec.hull.color}
        />
        {tier >= 2 ? (
          <path
            d='M18 74 Q52 84 90 74'
            fill='none'
            stroke={spec.accent}
            strokeWidth='1.5'
            opacity='0.6'
          />
        ) : null}
      </>
    )
  }

  if (spec.hull.style === 'junk') {
    const boneCount = 2 + tier
    return (
      <>
        <path d='M14 62 H94 L86 80 H22' fill={spec.hull.color} />
        {Array.from({ length: boneCount }, (_, index) => {
          const x = 28 + (index * 56) / (boneCount - 1)
          return (
            <line
              key={x}
              x1={x}
              y1={9 - tier}
              x2={x}
              y2='57'
              stroke={spec.accent}
              strokeWidth='1.5'
            />
          )
        })}
        <rect x='22' y='58' width='66' height='5' rx='2' fill={spec.accent} />
      </>
    )
  }

  if (spec.hull.style === 'raft') {
    return (
      <>
        {Array.from({ length: 5 }, (_, index) => (
          <rect
            key={18 + index * 14}
            x={18 + index * 14}
            y='62'
            width='12'
            height='16'
            rx='3'
            fill={index % 2 === 0 ? spec.hull.color : spec.accent}
          />
        ))}
        <rect x='49' y='36' width='3' height='26' fill={mastColor} />
      </>
    )
  }

  const chimneyCount = tier >= 3 ? 2 : 1
  return (
    <>
      <path d='M12 60 H96 L88 80 H20' fill={spec.hull.color} />
      <rect x='38' y='40' width='28' height='22' rx='2' fill='#e8e2d4' />
      {Array.from({ length: chimneyCount }, (_, index) => (
        <rect
          key={58 + index * 12}
          x={58 + index * 12}
          y={28 - tier * 2}
          width='9'
          height={22 + tier * 2}
          fill={spec.accent}
        />
      ))}
      {tier >= 3
        ? Array.from({ length: chimneyCount }, (_, index) => {
            const chimneyX = 58 + index * 12
            return (
              <circle
                key={chimneyX}
                cx={chimneyX + 4.5}
                cy={24 - tier * 2}
                r='5'
                fill='#e8e2d4'
                opacity='0.35'
              />
            )
          })
        : null}
      {tier >= 1
        ? Array.from({ length: 2 + tier }, (_, index) => (
            <circle
              key={22 + index * 12}
              cx={22 + index * 12}
              cy='70'
              r='2.5'
              fill={spec.accent}
              opacity='0.5'
            />
          ))
        : null}
    </>
  )
}

export function HarborBoat(props: HarborBoatProps): JSX.Element {
  const tier = RARITY_TIER[props.spec.rarity]
  let mastColor = '#a89070'
  if (props.spec.rarity === 'legendary') {
    mastColor = '#e8d4a0'
  } else if (tier >= 2) {
    mastColor = '#cbb894'
  }
  const mastWidth = tier >= 3 ? 3.5 : 2.5

  return (
    <svg
      viewBox='0 0 104 84'
      xmlns='http://www.w3.org/2000/svg'
      aria-hidden='true'
      focusable='false'
    >
      {props.spec.hull.style !== 'raft' ? (
        <>
          <rect
            x={52 - mastWidth / 2}
            y={8 - tier}
            width={mastWidth}
            height={52 + tier * 3}
            fill={mastColor}
          />
          {tier >= 3 ? (
            <rect
              x='34'
              y={14 - tier}
              width='36'
              height='2.5'
              fill={mastColor}
            />
          ) : null}
        </>
      ) : null}
      {props.spec.sails.map((sail, index) =>
        renderSail(sail, index, tier, props.spec.accent)
      )}
      {renderPennants(props.spec, tier)}
      {renderHull(props.spec, tier, mastColor)}
      {props.spec.rarity === 'legendary' ? (
        <>
          <circle
            cx='92'
            cy='60'
            r='3.5'
            fill={props.spec.accent}
            opacity='0.9'
          />
          <circle
            cx='92'
            cy='60'
            r='5.5'
            fill={props.spec.accent}
            opacity='0.25'
          />
          <circle cx='18' cy='62' r='2.5' fill='#e8d4a0' opacity='0.7' />
        </>
      ) : null}
      <path d='M0 80 H104' fill='none' stroke='none' />
    </svg>
  )
}
