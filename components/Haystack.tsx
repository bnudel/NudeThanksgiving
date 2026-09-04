/** Haystack Rock and the Needles at Cannon Beach, in silhouette through the rain. */
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
          <stop offset="0%" stopColor="#0c161b" />
          <stop offset="100%" stopColor="#050b0e" />
        </linearGradient>
        <linearGradient id="rockFar" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1b3038" />
          <stop offset="100%" stopColor="#12222a" />
        </linearGradient>
        <linearGradient id="wet" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#22414d" stopOpacity="0.95" />
          <stop offset="60%" stopColor="#0d1b21" stopOpacity="0.98" />
          <stop offset="100%" stopColor="#060d10" />
        </linearGradient>
        <linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7f9fa6" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#7f9fa6" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Distant headland — Ecola, off to the north */}
      <path
        d="M0 214 L58 186 L112 198 L168 172 L236 196 L292 184 L340 206 L392 200 L440 214 L0 214 Z"
        fill="url(#rockFar)"
        opacity="0.55"
      />

      {/* The Needles */}
      <path d="M1006 214 L1030 138 L1046 166 L1058 214 Z" fill="url(#rockFar)" opacity="0.9" />
      <path d="M1052 214 L1070 160 L1086 186 L1094 214 Z" fill="url(#rockFar)" opacity="0.8" />
      <path d="M338 214 L352 176 L364 194 L372 214 Z" fill="url(#rockFar)" opacity="0.7" />

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
      <path
        d="M886 60 C 898 44, 912 42, 922 58 C 930 70, 936 90, 941 108
           C 930 96, 916 78, 902 74 C 895 72, 890 66, 886 60 Z"
        fill="url(#sheen)"
      />

      {/* Wet sand with a mirrored smear of the rock */}
      <path d="M0 214 H1440 V320 H0 Z" fill="url(#wet)" />
      <path
        d="M812 216 C 828 236, 838 264, 852 300 C 862 320, 866 320, 872 320
           L 940 320 C 950 300, 960 254, 968 232 C 974 222, 982 218, 992 216 Z"
        fill="#0a1418"
        opacity="0.5"
      />

      {/* Surf line */}
      <path
        d="M0 232 Q 180 224, 360 234 T 720 230 T 1080 236 T 1440 228"
        fill="none"
        stroke="#8fb3b6"
        strokeOpacity="0.22"
        strokeWidth="2"
      />
      <path
        d="M0 250 Q 220 244, 420 252 T 840 246 T 1240 254 T 1440 248"
        fill="none"
        stroke="#8fb3b6"
        strokeOpacity="0.12"
        strokeWidth="1.5"
      />
    </svg>
  );
}
