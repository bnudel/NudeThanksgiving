/**
 * The Cannon Beach skyline: a headland with a waterfall spilling onto the
 * sand, Haystack Rock and the Needles, and low winter sun breaking through.
 */
export default function Haystack() {
  return (
    <svg
      className="haystack"
      viewBox="0 0 1440 320"
      preserveAspectRatio="xMidYMax slice"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <linearGradient id="rock" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#28454f" />
          <stop offset="100%" stopColor="#152b34" />
        </linearGradient>
        <linearGradient id="rockFar" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3d6373" />
          <stop offset="100%" stopColor="#27505f" />
        </linearGradient>
        <linearGradient id="cliff" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#33586a" />
          <stop offset="100%" stopColor="#1a3541" />
        </linearGradient>
        <linearGradient id="wet" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3a6a7c" stopOpacity="0.95" />
          <stop offset="55%" stopColor="#1d3d4a" stopOpacity="0.98" />
          <stop offset="100%" stopColor="#0e232c" />
        </linearGradient>
        <linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffd9a0" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#ffd9a0" stopOpacity="0" />
        </linearGradient>

        {/* Falling water: bright at the lip, dissolving into spray */}
        <linearGradient id="fall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#eaf7f6" stopOpacity="0.9" />
          <stop offset="55%" stopColor="#d5ecef" stopOpacity="0.62" />
          <stop offset="100%" stopColor="#cfe6ea" stopOpacity="0.12" />
        </linearGradient>
        <radialGradient id="spray">
          <stop offset="0%" stopColor="#e9f6f5" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#e9f6f5" stopOpacity="0" />
        </radialGradient>

        <radialGradient id="sunGlow">
          <stop offset="0%" stopColor="#ffe3b4" stopOpacity="0.85" />
          <stop offset="38%" stopColor="#ffd093" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#ffc987" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="sunPath" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffdca8" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#ffdca8" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Low sun, upper right */}
      <circle cx="1188" cy="74" r="132" fill="url(#sunGlow)" />
      <circle cx="1188" cy="74" r="27" fill="#ffe9c6" opacity="0.96" />
      <circle cx="1188" cy="74" r="38" fill="#ffdfae" opacity="0.28" />

      {/* Distant headland, softened by haze */}
      <path
        d="M1120 214 L1180 190 L1240 200 L1310 178 L1380 198 L1440 188 L1440 214 Z"
        fill="url(#rockFar)"
        opacity="0.4"
      />

      {/* The Needles */}
      <path d="M1006 214 L1030 138 L1046 166 L1058 214 Z" fill="url(#rockFar)" opacity="0.92" />
      <path d="M1052 214 L1070 160 L1086 186 L1094 214 Z" fill="url(#rockFar)" opacity="0.8" />

      {/* Haystack Rock */}
      <path
        d="M812 216
           C 828 196, 838 168, 852 132
           C 862 106, 872 78, 886 60
           C 898 44, 912 42, 922 58
           C 936 80, 944 112, 954 142
           C 966 178, 978 198, 992 216 Z"
        fill="url(#rock)"
      />
      {/* Sunlit face, lit from the right */}
      <path
        d="M922 58 C 936 80, 944 112, 954 142 C 966 178, 978 198, 992 216
           L 958 216 C 950 190, 940 150, 930 112 C 926 94, 923 74, 922 58 Z"
        fill="url(#sheen)"
      />

      {/* ---- Headland with the waterfall, stage left ---- */}
      <path
        d="M0 214 L0 96 L64 84 L128 100 L186 92 L214 104
           L214 150 L236 150 L236 116 L288 128 L342 118 L392 140 L438 156 L470 214 Z"
        fill="url(#cliff)"
      />
      {/* Notch highlight where the water leaves the lip */}
      <path d="M186 92 L214 104 L214 122 L188 116 Z" fill="#4a7285" opacity="0.5" />

      {/* The fall itself */}
      <path d="M215 118 L235 118 L241 208 L211 208 Z" fill="url(#fall)" />
      <g className="fall-streaks" stroke="#f2fbfa" strokeWidth="1.1" strokeLinecap="round">
        <line x1="219" y1="124" x2="216" y2="196" opacity="0.5" />
        <line x1="225" y1="120" x2="224" y2="204" opacity="0.38" />
        <line x1="231" y1="126" x2="234" y2="192" opacity="0.45" />
      </g>

      {/* Spray where it lands, and the pool it feeds */}
      <ellipse cx="226" cy="209" rx="46" ry="17" fill="url(#spray)" />
      <ellipse cx="226" cy="214" rx="30" ry="6" fill="#cfe6ea" opacity="0.3" />

      {/* Wet sand */}
      <path d="M0 214 H1440 V320 H0 Z" fill="url(#wet)" />

      {/* Sun track down the wet sand */}
      <path d="M1150 216 L1232 216 L1330 320 L1052 320 Z" fill="url(#sunPath)" />

      {/* Mirrored smear under the rock */}
      <path
        d="M812 216 C 828 236, 838 264, 852 300 C 862 320, 866 320, 872 320
           L 940 320 C 950 300, 960 254, 968 232 C 974 222, 982 218, 992 216 Z"
        fill="#122c37"
        opacity="0.45"
      />
      {/* …and under the falls */}
      <path d="M211 216 L241 216 L248 268 L204 268 Z" fill="#dff0f2" opacity="0.12" />

      {/* Surf */}
      <path
        d="M0 232 Q 180 224, 360 234 T 720 230 T 1080 236 T 1440 228"
        fill="none"
        stroke="#cbe6e6"
        strokeOpacity="0.3"
        strokeWidth="2"
      />
      <path
        d="M0 250 Q 220 244, 420 252 T 840 246 T 1240 254 T 1440 248"
        fill="none"
        stroke="#cbe6e6"
        strokeOpacity="0.17"
        strokeWidth="1.5"
      />
    </svg>
  );
}
