/** Dashboard picture: city, road and a Cloud Packers truck. Drawn in SVG, so it is sharp on every screen and very small to download. */
export default function HeroArt({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 560 240" className={className} role="img" aria-label="Cloud Packers truck on the road">

  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#dbeefe"/><stop offset="1" stopColor="#eef7ff"/></linearGradient>
    <linearGradient id="box" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffffff"/><stop offset="1" stopColor="#e6eef7"/></linearGradient>
    <linearGradient id="cab" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f8fafc"/><stop offset="1" stopColor="#cbd5e1"/></linearGradient>
    <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#7dd3fc"/><stop offset="1" stopColor="#1e3a8a"/></linearGradient>
    <linearGradient id="road" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#94a3b8"/><stop offset="1" stopColor="#64748b"/></linearGradient>
    <linearGradient id="pin" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3b82f6"/><stop offset="1" stopColor="#1d4ed8"/></linearGradient>
  </defs>
  {/* city skyline */}
  <g fill="#bfdbfe">
    <rect x="20" y="70" width="34" height="120" rx="2"/><rect x="60" y="40" width="28" height="150" rx="2"/><rect x="94" y="88" width="30" height="102" rx="2"/>
    <rect x="130" y="55" width="40" height="135" rx="2"/><rect x="176" y="96" width="26" height="94" rx="2"/><rect x="208" y="30" width="32" height="160" rx="2"/>
    <rect x="246" y="78" width="36" height="112" rx="2"/><rect x="288" y="50" width="28" height="140" rx="2"/><rect x="322" y="92" width="40" height="98" rx="2"/>
    <rect x="368" y="62" width="30" height="128" rx="2"/><rect x="404" y="38" width="36" height="152" rx="2"/><rect x="446" y="84" width="30" height="106" rx="2"/>
    <rect x="482" y="58" width="38" height="132" rx="2"/><rect x="526" y="96" width="30" height="94" rx="2"/>
  </g>
  <g fill="#dbeafe">
    <rect x="66" y="50" width="6" height="8"/><rect x="76" y="50" width="6" height="8"/><rect x="66" y="66" width="6" height="8"/><rect x="76" y="66" width="6" height="8"/>
    <rect x="214" y="42" width="6" height="8"/><rect x="226" y="42" width="6" height="8"/><rect x="214" y="58" width="6" height="8"/><rect x="226" y="58" width="6" height="8"/>
    <rect x="410" y="50" width="6" height="8"/><rect x="424" y="50" width="6" height="8"/><rect x="410" y="66" width="6" height="8"/><rect x="424" y="66" width="6" height="8"/>
  </g>
  {/* clouds */}
  <g fill="#ffffff" opacity="0.95">
    <ellipse cx="150" cy="38" rx="26" ry="10"/><ellipse cx="168" cy="32" rx="18" ry="12"/>
    <ellipse cx="380" cy="26" rx="30" ry="10"/><ellipse cx="400" cy="20" rx="18" ry="11"/>
  </g>
  {/* trees */}
  <g><rect x="34" y="168" width="4" height="22" fill="#78716c"/><circle cx="36" cy="160" r="14" fill="#4ade80"/><circle cx="28" cy="166" r="9" fill="#22c55e"/>
     <rect x="520" y="170" width="4" height="20" fill="#78716c"/><circle cx="522" cy="162" r="13" fill="#4ade80"/><circle cx="530" cy="168" r="8" fill="#22c55e"/></g>
  {/* road */}
  <rect x="0" y="190" width="560" height="50" fill="url(#road)"/>
  <rect x="0" y="188" width="560" height="4" fill="#cbd5e1"/>
  <g fill="#f8fafc"><rect x="10" y="214" width="34" height="4" rx="2"/><rect x="70" y="214" width="34" height="4" rx="2"/><rect x="430" y="214" width="34" height="4" rx="2"/><rect x="490" y="214" width="34" height="4" rx="2"/></g>
  {/* location pin + small house */}
  <g transform="translate(470 92)">
    <ellipse cx="22" cy="96" rx="20" ry="5" fill="#1e293b" opacity="0.18"/>
    <path d="M22 0c-13 0-23 10-23 23 0 17 23 42 23 42s23-25 23-42C45 10 35 0 22 0z" fill="url(#pin)"/>
    <circle cx="22" cy="22" r="9" fill="#fff"/>
    <path d="M2 96v-20l14-10 14 10v20z" fill="#fff" stroke="#93c5fd" strokeWidth="2"/><rect x="11" y="82" width="8" height="14" fill="#60a5fa"/>
  </g>
  {/* truck */}
  <g transform="translate(150 70)">
    <ellipse cx="135" cy="146" rx="150" ry="8" fill="#0f172a" opacity="0.22"/>
    {/* cargo box */}
    <rect x="78" y="0" width="210" height="118" rx="8" fill="url(#box)" stroke="#94a3b8" strokeWidth="2"/>
    <rect x="78" y="110" width="210" height="10" fill="#1d4ed8"/>
    <rect x="88" y="10" width="86" height="58" rx="6" fill="#ffffff"/>
    <image x="90" y="12" width="82" height="54" href="/logo.jpg" preserveAspectRatio="xMidYMid meet"/>
    <text x="278" y="40" textAnchor="end" fontFamily="'Brush Script MT','Segoe Script',cursive" fontStyle="italic" fontSize="19" fill="#1e3a8a">Pack Smart</text>
    <text x="278" y="64" textAnchor="end" fontFamily="'Brush Script MT','Segoe Script',cursive" fontStyle="italic" fontSize="19" fill="#1e3a8a">Move Better</text>
    <path d="M190 84h86" stroke="#38bdf8" strokeWidth="4" strokeLinecap="round"/>
    {/* cab */}
    <path d="M6 120V58c0-6 3-10 8-13l28-20c3-2 6-3 10-3h26v98z" fill="url(#cab)" stroke="#94a3b8" strokeWidth="2"/>
    <path d="M14 58l26-20c2-2 5-3 8-3h22v34H14z" fill="url(#glass)"/>
    <path d="M44 38h4v30h-4z" fill="#cbd5e1"/>
    <rect x="0" y="100" width="22" height="20" rx="3" fill="#475569"/>
    <rect x="2" y="84" width="12" height="9" rx="2" fill="#fde68a" stroke="#f59e0b"/>
    <g stroke="#94a3b8" strokeWidth="2"><path d="M2 104h18"/><path d="M2 110h18"/></g>
    <rect x="54" y="78" width="12" height="3" rx="1.5" fill="#64748b"/>
    <rect x="72" y="70" width="6" height="40" fill="#94a3b8"/>
    {/* wheels */}
    <g><circle cx="44" cy="126" r="18" fill="#1e293b"/><circle cx="44" cy="126" r="8" fill="#cbd5e1"/><circle cx="44" cy="126" r="3" fill="#475569"/></g>
    <g><circle cx="210" cy="126" r="18" fill="#1e293b"/><circle cx="210" cy="126" r="8" fill="#cbd5e1"/><circle cx="210" cy="126" r="3" fill="#475569"/></g>
    <g><circle cx="252" cy="126" r="18" fill="#1e293b"/><circle cx="252" cy="126" r="8" fill="#cbd5e1"/><circle cx="252" cy="126" r="3" fill="#475569"/></g>
  </g>

    </svg>
  );
}
