/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        navy: { 950: "#050816", 900: "#070B1F", 800: "#0C1230", 700: "#141B45" },
        ark: { indigo: "#6366F1", cyan: "#22D3EE", coral: "#FF5A6E" },
      },
      fontFamily: {
        display: ["Space Grotesk", "sans-serif"],
        sans: ["Inter", "sans-serif"],
      },
      boxShadow: {
        "glow-indigo": "0 0 30px rgba(99,102,241,.45)",
        "glow-cyan": "0 0 30px rgba(34,211,238,.45)",
        "glow-coral": "0 0 30px rgba(255,90,110,.5)",
      },
      keyframes: {
        float: { "0%,100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-14px)" } },
        spinSlow: { to: { transform: "rotate(360deg)" } },
        pulseRing: {
          "0%": { transform: "scale(.9)", opacity: ".7" },
          "100%": { transform: "scale(1.8)", opacity: "0" },
        },
      },
      animation: {
        float: "float 6s ease-in-out infinite",
        "spin-slow": "spinSlow 6s linear infinite",
        "pulse-ring": "pulseRing 2.4s ease-out infinite",
      },
    },
  },
  plugins: [],
};