import React, { useId } from 'react';
import type { ClubBranding, CarPreset } from '../../game/club-design';
import { GARAGE_ITEMS } from '../../game/club-design';
import {publicAssetUrl} from '../utils/public-assets';
export const clubAsset = (s: string | null) =>
  publicAssetUrl(s || '');
export function CrestPreview({ brand }: { brand: ClubBranding }) {
  const id = useId().replace(/:/g, '');
  const shape =
    brand.shape === 'circle' ? (
      <circle cx="120" cy="120" r="103" />
    ) : brand.shape === 'diamond' ? (
      <path d="M120 10 228 120 120 230 12 120Z" />
    ) : (
      <path d="M24 27 120 10 216 27 207 141Q188 202 120 232 52 202 33 141Z" />
    );
  return (
    <svg
      viewBox="0 0 240 240"
      width="240"
      height="240"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Crest design"
    >
      <defs>
        <linearGradient id={id} x2=".7" y2="1">
          <stop stopColor={brand.primary} />
          <stop offset="1" stopColor={brand.secondary} />
        </linearGradient>
      </defs>
      <g fill={`url(#${id})`} stroke={brand.accent} strokeWidth="5">
        {shape}
      </g>
      <g fill={brand.accent}>
        {brand.emblem === 'initials' ? (
          <text
            x="120"
            y="139"
            fontFamily="Arial,sans-serif"
            textAnchor="middle"
            fontWeight="900"
            fontSize={brand.shortName.length > 4 ? 43 : 58}
          >
            {brand.shortName}
          </text>
        ) : brand.emblem === 'bolt' ? (
          <path d="m134 49-66 89h42l-13 53 71-97h-45Z" />
        ) : brand.emblem === 'star' ? (
          <path d="m120 52 20 42 47 7-34 33 8 47-41-23-41 23 8-47-34-33 47-7Z" />
        ) : (
          <path d="m60 86 28 24 32-49 32 49 28-24-14 74H74Zm18 88h84v12H78Z" />
        )}
        {brand.emblem !== 'initials' && (
          <text
            x="120"
            y="209"
            textAnchor="middle"
            fontFamily="Arial,sans-serif"
            fontWeight="700"
            fontSize="19"
          >
            {brand.shortName}
          </text>
        )}
      </g>
    </svg>
  );
}
export function BannerPreview({ brand }: { brand: ClubBranding }) {
  return (
    <svg
      viewBox="0 0 1000 300"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Club banner design"
    >
      <rect width="1000" height="300" fill={brand.secondary} />
      <path d="M570 0h330L630 300H300Z" fill={brand.primary} opacity=".17" />
      <path d="M870 0h130v300H600Z" fill={brand.primary} opacity=".45" />
      <path d="M945 0h55v300H675Z" fill={brand.primary} />
      <text
        x="58"
        y="64"
        fill={brand.accent}
        opacity=".6"
        fontSize="14"
        fontWeight="700"
        letterSpacing="4"
        fontFamily="Arial,sans-serif"
      >
        ROCKET LEAGUE · {brand.shortName}
      </text>
      <text
        x="58"
        y="148"
        fill={brand.accent}
        fontWeight="900"
        fontSize={Math.min(58, 700 / Math.max(1, brand.name.length * 0.61))}
        fontFamily="Arial,sans-serif"
      >
        {brand.name}
      </text>
      <text
        x="58"
        y="203"
        fill={brand.accent}
        opacity=".8"
        fontSize="20"
        fontFamily="Arial,sans-serif"
      >
        {brand.slogan}
      </text>
      {brand.sponsor && (
        <text
          x="58"
          y="263"
          fill={brand.accent}
          opacity=".55"
          fontSize="13"
          letterSpacing="2"
          fontFamily="Arial,sans-serif"
        >
          {brand.sponsor}
        </text>
      )}
      <text
        x="853"
        y="192"
        fill={brand.accent}
        textAnchor="middle"
        fontSize="64"
        fontWeight="900"
        fontFamily="Arial,sans-serif"
        transform="rotate(-10 853 192)"
      >
        {brand.shortName}
      </text>
    </svg>
  );
}
export function JerseyPreview({
  brand,
  away = false,
  back = false,
  player = 'PLAYER',
  crest,
}: {
  brand: ClubBranding;
  away?: boolean;
  back?: boolean;
  player?: string;
  crest?: string | null;
}) {
  const clip = useId().replace(/:/g, '');
  const primary = away ? brand.awayPrimary : brand.primary,
    secondary = away ? brand.awaySecondary : brand.secondary,
    lettering = away ? brand.awayAccent : brand.accent;
  return (
    <svg
      viewBox="0 0 320 360"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={`${away ? 'Away' : 'Home'} jersey ${back ? 'back' : 'front'}`}
    >
      <defs>
        <clipPath id={clip}>
          <path d="m96 36 40-10q24 25 48 0l40 10 68 70-45 42-23-22v192H96V126l-23 22-45-42Z" />
        </clipPath>
      </defs>
      <path
        d="m96 36 40-10q24 25 48 0l40 10 68 70-45 42-23-22v192H96V126l-23 22-45-42Z"
        fill={primary}
        stroke={secondary}
        strokeWidth="3"
      />
      <g clipPath={`url(#${clip})`} fill={secondary} opacity=".8">
        {brand.jerseyPattern === 'stripes' ? (
          [110, 150, 190].map((x) => <rect key={x} x={x} y="30" width="18" height="300" />)
        ) : brand.jerseyPattern === 'diagonal' ? (
          <>
            <path d="m60 68 40-32 162 236-40 32Z" />
            <path d="m84 52 9-7 170 243-9 7Z" />
          </>
        ) : null}
      </g>
      <path d="M136 26q24 40 48 0" stroke={secondary} strokeWidth="9" fill="none" />
      <path d="m30 105 43 41M248 146l42-41" stroke={lettering} strokeWidth="7" />
      {back ? (
        <>
          <text
            x="160"
            y="120"
            textAnchor="middle"
            fill={lettering}
            fontFamily="Arial,sans-serif"
            fontSize={Math.min(22, 112 / Math.max(1, player.slice(0, 16).length * 0.6))}
            fontWeight="700"
          >
            {player.slice(0, 16)}
          </text>
          <text
            x="160"
            y="215"
            textAnchor="middle"
            fill={lettering}
            fontFamily="Arial,sans-serif"
            fontSize="66"
            fontWeight="900"
          >
            01
          </text>
          <text
            x="160"
            y="276"
            textAnchor="middle"
            fill={lettering}
            fontSize="15"
            fontFamily="Arial,sans-serif"
          >
            {brand.shortName}
          </text>
        </>
      ) : (
        <>
          {brand.logoMode === 'builder' ? (
            <g transform="translate(174 81) scale(.14)">
              <CrestPreview brand={brand} />
            </g>
          ) : crest ? (
            <image
              href={clubAsset(crest)}
              x="174"
              y="81"
              width="32"
              height="35"
              preserveAspectRatio="xMidYMid meet"
            />
          ) : (
            <text
              x="190"
              y="102"
              textAnchor="middle"
              fill={lettering}
              fontFamily="Arial,sans-serif"
              fontSize="15"
              fontWeight="900"
            >
              {brand.shortName}
            </text>
          )}
          <rect x="100" y="155" width="120" height="34" rx="4" fill={primary} />
          <text
            x="160"
            y="179"
            textAnchor="middle"
            fill={lettering}
            fontFamily="Arial,sans-serif"
            fontSize={Math.min(
              19,
              112 / Math.max(1, (brand.sponsor || brand.name.slice(0, 22)).length * 0.62)
            )}
            fontWeight="700"
          >
            {brand.sponsor || brand.name.slice(0, 22)}
          </text>
          <text
            x="160"
            y="206"
            textAnchor="middle"
            fill={lettering}
            opacity=".7"
            fontFamily="Arial,sans-serif"
            fontSize="9"
            letterSpacing="3"
          >
            ROCKET LEAGUE
          </text>
        </>
      )}
    </svg>
  );
}
export function CarPreview({
  preset,
  brand,
  side,
}: {
  preset: CarPreset;
  brand: ClubBranding;
  side: 'blue' | 'orange';
}) {
  const id = useId().replace(/:/g, '');
  const colors = preset.useClubColors
    ? { primary: brand.primary, secondary: brand.accent }
    : preset[side];
  const body = GARAGE_ITEMS.bodies.find((b) => b.id === preset.bodyId)?.name || 'Car';
  const boxy = body === 'Fennec' || body === 'Merc',
    long = body === 'Dominus' || body === 'Breakout';
  return (
    <svg
      viewBox="0 0 760 420"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={`${body} ${side} design preview`}
    >
      <defs>
        <radialGradient id={id + 'bg'}>
          <stop stopColor={colors.primary} stopOpacity=".2" />
          <stop offset="1" stopColor="#0E151C" />
        </radialGradient>
        <linearGradient id={id + 'body'} x2="0" y2="1">
          <stop stopColor={colors.primary} />
          <stop offset="1" stopColor={brand.secondary} />
        </linearGradient>
        <linearGradient id={id + 'glass'} x2="1" y2="1">
          <stop stopColor="#536E80" />
          <stop offset="1" stopColor="#121D29" />
        </linearGradient>
      </defs>
      <rect width="760" height="420" fill={`url(#${id}bg)`} />
      <path d="M40 324h680M70 342h620M110 365h540" stroke="#BFD7E6" strokeOpacity=".06" />
      <ellipse cx="390" cy="312" rx="245" ry="28" fill="#000" opacity=".35" />
      <g transform="translate(90 15)">
        <path
          d={
            boxy
              ? 'm68 220 40-43 73-7 42-66h144l50 68 97 17 62 66-31 19H83Z'
              : long
                ? 'm62 223 90-55 71-4 67-48h114l65 58 102 19 29 63-37 27H94Z'
                : 'm66 226 73-52 55-13 44-70 122 10 76 83 84 31 17 48-42 20H93Z'
          }
          fill={`url(#${id}body)`}
          stroke={colors.primary}
          strokeWidth="2"
        />
        <path
          d={
            boxy
              ? 'm201 170 31-55h122l45 57Z'
              : long
                ? 'm232 165 62-38h103l47 46Z'
                : 'm209 159 34-55 107 8 58 62Z'
          }
          fill={`url(#${id}glass)`}
          stroke={colors.secondary}
          strokeOpacity=".6"
          strokeWidth="3"
        />
        <path d="M298 113v55" stroke="#111B25" strokeWidth="7" />
        {preset.decalId !== 0 && (
          <>
            <path d="m136 181 30-7 79 103h-36Z" fill={colors.secondary} />
            <path d="m348 186 17 3 73 81h-25Z" fill={colors.secondary} />
          </>
        )}
        <path d="m437 184 82 30-3 15-94-30Z" fill={colors.secondary} />
        <path d="M78 220h73v12H73Z" fill="#E4F5FF" />
        <path d="m516 234 22 11v14l-22-8Z" fill="#FFAA65" />
        {[160, 451].map((x) => (
          <g key={x}>
            <circle cx={x} cy="266" r="48" fill="#070B10" stroke="#27333F" strokeWidth="4" />
            <circle
              cx={x}
              cy="266"
              r="32"
              fill="#19252E"
              stroke={colors.secondary}
              strokeWidth="3"
            />
            {[0, 60, 120, 180, 240, 300].map((angle) => (
              <path
                key={angle}
                d={`M${x} 266v-28`}
                stroke={preset.wheelsId === 386 ? '#ADB7C0' : colors.secondary}
                strokeWidth="7"
                transform={`rotate(${angle} ${x} 266)`}
              />
            ))}
            <circle cx={x} cy="266" r="9" fill="#424F58" />
          </g>
        ))}
        <path
          d="M180 181q88 9 214 3"
          stroke="#FFF"
          strokeOpacity={preset.finishId === 273 ? '.1' : '.4'}
          strokeWidth="2"
        />
        <path d="M126 243h358" stroke="#FFF" strokeOpacity=".09" />
      </g>
      <text
        x="38"
        y="40"
        fill="#96A8B5"
        fontFamily="Arial,sans-serif"
        fontSize="11"
        letterSpacing="3"
      >
        SQUAD GARAGE / {side.toUpperCase()} PRESET
      </text>
      <text
        x="38"
        y="390"
        fill="#F3F5F7"
        fontFamily="Arial,sans-serif"
        fontSize="18"
        fontWeight="700"
      >
        {body}
      </text>
      <text
        x="723"
        y="390"
        fill="#96A8B5"
        textAnchor="end"
        fontFamily="Arial,sans-serif"
        fontSize="11"
      >
        DESIGN PREVIEW
      </text>
    </svg>
  );
}
