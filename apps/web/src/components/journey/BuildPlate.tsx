import { useId } from 'react';

/** Original exploded-view drawing. Decorative study, never a product record. */
export function BuildPlate({ annotated = true }: { annotated?: boolean }) {
  const uid = useId().replace(/:/g, '');
  const ink = '#9adbd8',
    amber = '#f3be73';
  const plane = (y: number) => `matrix(1 .405 -1 .56 253 ${y})`;
  const screws = [
    [-71, -55],
    [71, -55],
    [-71, 55],
    [71, 55]
  ];
  return (
    <svg viewBox="0 0 510 326" fill="none" className="block h-auto w-full" aria-hidden="true">
      <defs>
        <pattern id={`${uid}grid`} width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M20 0H0V20" stroke="#9adbd8" strokeOpacity=".11" strokeWidth=".7" />
          <circle cx="0" cy="0" r="1" fill="#83cdd0" opacity=".4" />
        </pattern>
        <pattern id={`${uid}holes`} width="6" height="5" patternUnits="userSpaceOnUse">
          <circle cx="1.5" cy="1.5" r="1.05" fill="#9adbd8" opacity=".7" />
        </pattern>
        <linearGradient id={`${uid}metal`} x1="0" x2="1" y1="0" y2="1" gradientUnits="objectBoundingBox">
          <stop stopColor="#38717c" />
          <stop offset=".55" stopColor="#215360" />
          <stop offset="1" stopColor="#31646e" />
        </linearGradient>
      </defs>
      <rect width="510" height="326" fill={`url(#${uid}grid)`} />
      <g stroke="#69b0b8" opacity=".45" strokeWidth=".8" strokeDasharray="3 5">
        <path d="M253 4v310M43 224l355-171M110 30l353 164M116 109v134M395 90v148" />
      </g>
      <g stroke="#8ccbd0" strokeWidth="1" opacity=".8">
        {[
          [15, 14],
          [495, 14],
          [15, 312],
          [495, 312]
        ].map(([x, y]) => (
          <path key={`${x},${y}`} d={`M${x - 4} ${y}h8m-4 -4v8`} />
        ))}
      </g>
      {/* Lower shell with a recessed lip and four standoffs. */}
      <g transform={plane(238)} stroke={ink} strokeWidth="1.1">
        <rect x="-89" y="-69" width="178" height="138" rx="16" fill="#102f40" />
      </g>
      <path d="M97 225v14q1 5 9 9l128 52q12 5 23 0l142-79q7-4 7-12v-9" stroke={ink} strokeWidth="1" fill="#184352" />
      <g transform={plane(224)} stroke={ink} strokeWidth="1.3">
        <rect x="-89" y="-69" width="178" height="138" rx="16" fill={`url(#${uid}metal)`} />
        <rect x="-81" y="-61" width="162" height="122" rx="12" fill="#163c4a" />
        <rect x="-72" y="-53" width="144" height="106" rx="10" strokeOpacity=".55" />
        {screws.map(([x, y]) => (
          <g key={x + ',' + y}>
            <circle cx={x} cy={y} r="7" fill="#316271" />
            <circle cx={x} cy={y} r="2.3" />
          </g>
        ))}
        <path d="M-32 44h62m-54-6h40m-35-7h30" opacity=".45" />
      </g>
      <g stroke={amber} strokeOpacity=".62" strokeWidth="1" strokeDasharray="3 4">
        {screws.map(([x, y]) => (
          <path key={x + ',' + y} d={`M${253 + x - y} ${82 + 0.405 * x + 0.56 * y}v142`} />
        ))}
      </g>
      {/* Copper traces are in board coordinates, not a texture or stock image. */}
      <g transform={plane(158)}>
        <rect x="-82" y="-63" width="164" height="126" rx="9" fill="#133f48" stroke="#55aaaa" strokeWidth="1.7" />
        <rect x="-81" y="-69" width="162" height="127" rx="9" fill="#276c68" stroke="#a0e0c2" strokeWidth="1.6" />
        <g stroke="#a3d6ac" strokeWidth="1.35">
          {Array.from({ length: 7 }, (_, i) => (
            <g key={i}>
              <path d={`M${-28 + i * 4} -14v${-11 - i * 2}l10 -10h${27 + i * 2}l9 -9`} />
              <path d={`M${-17 + i * 5} 15v${8 + i * 2}l-9 9h-22l-8 8`} />
              <circle cx={28 + i * 6} cy={-44 - i * 2} r="1.6" fill="#d3d4a2" />
            </g>
          ))}
        </g>
        <g stroke="#b8cdb0">
          {Array.from({ length: 9 }, (_, i) => (
            <path key={i} d={`M${-26 + 4 * i} -18v9m0 23v8M-36 ${-13 + i * 3.5}h10m34 0h7`} />
          ))}
        </g>
        <rect x="-30" y="-14" width="41" height="32" rx="3" fill="#153f47" stroke="#bbdfcf" />
        <rect x="-24" y="-9" width="29" height="20" rx="1" fill="#255962" stroke="#77b99f" />
        <circle cx="-19" cy="-5" r="2" fill={amber} />
        {Array.from({ length: 9 }, (_, i) => (
          <rect
            key={i}
            x={23 + (i % 3) * 11}
            y={-12 + Math.floor(i / 3) * 9}
            width="7"
            height="4"
            fill="#d1bd8d"
            stroke="#173e45"
          />
        ))}
        <g stroke="#c9e4cc" fill="#195052">
          <rect x="-68" y="-24" width="16" height="35" rx="2" />
          <rect x="43" y="29" width="21" height="11" rx="2" />
        </g>
        {screws.map(([x, y]) => (
          <circle key={x + ',' + y} cx={x} cy={y - 4} r="3" stroke={amber} strokeWidth="2.2" />
        ))}
      </g>
      {/* Top plate: machined housing, perforated grille and thumb control. */}
      <g transform={plane(88)}>
        <rect x="-89" y="-69" width="178" height="138" rx="16" fill="#183d4e" stroke="#9bd7da" strokeWidth="1.5" />
      </g>
      <g transform={plane(76)} stroke={ink} strokeWidth="1.4">
        <rect x="-89" y="-69" width="178" height="138" rx="16" fill={`url(#${uid}metal)`} />
        <rect x="-83" y="-63" width="166" height="126" rx="12" strokeOpacity=".6" />
        <rect x="-61" y="-44" width="75" height="82" rx="12" fill="#174453" />
        <rect x="-55" y="-38" width="63" height="70" rx="8" fill={`url(#${uid}holes)`} stroke="none" />
        <circle cx="47" cy="-12" r="18" fill="#1a4554" />
        <circle cx="47" cy="-16" r="16.5" fill="#3b7380" />
        <path d="m49 -17 7 -9" stroke={amber} strokeWidth="2.8" />
        <rect x="29" y="20" width="32" height="5" rx="2.5" fill="#163543" stroke="#6b9ea4" />
        <circle cx="32" cy="22.5" r="1.6" fill={amber} stroke="none" />
        {screws.map(([x, y]) => (
          <g key={x + ',' + y}>
            <circle cx={x} cy={y} r="3.7" fill="#2d5863" />
            <path d={`m${x - 1.8} ${y + 1.2}l3.6 -2.4`} strokeWidth=".8" />
          </g>
        ))}
      </g>
      {annotated && (
        <g stroke={amber} strokeWidth=".9">
          <path d="M359 67h28l17-17h66M362 167h33l13-13h62M150 238h-30l-20 20H41" />
          <g fill={amber}>
            {[
              [359, 67],
              [362, 167],
              [150, 238]
            ].map(([x, y]) => (
              <circle key={x} cx={x} cy={y} r="2.5" />
            ))}
          </g>
          <g stroke="none" fill="#ecce9a" fontFamily="monospace" fontSize="8" letterSpacing="1.1">
            <text x="405" y="44">
              01 / SHELL
            </text>
            <text x="408" y="148">
              02 / CORE
            </text>
            <text x="41" y="252">
              03 / BASE
            </text>
          </g>
        </g>
      )}
      <g stroke="#a4c4c8" opacity=".7">
        <path d="M32 294v-20m0 20 16 6m-16-6-10 6" />
        <path d="M431 293h41m-41-3v5m10-5v3m10-3v3m10-3v3m10-3v5" />
      </g>
    </svg>
  );
}
