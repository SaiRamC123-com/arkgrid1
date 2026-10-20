/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        navy: { 950: "#F7F9FC", 900: "#F7F9FC", 800: "#FFFFFF", 700: "#E2E8F0" },
        slate: {
          50: "#F8FAFC", 100: "#F1F5F9", 200: "#E2E8F0", 300: "#CBD5E1",
          400: "#64748B", 500: "#475569", 600: "#334155", 700: "#1E293B",
          800: "#172033", 900: "#0F172A", 950: "#020617",
        },
        ark: { indigo: "#2563EB", cyan: "#06B6D4", coral: "#DC2626" },
      },
      fontFamily: {
        display: ["Space Grotesk", "sans-serif"],
        sans: ["Inter", "sans-serif"],
      },
      boxShadow: {
        "glow-indigo": "0 4px 16px rgba(37,99,235,.12)",
        "glow-cyan": "0 4px 16px rgba(6,182,212,.12)",
        "glow-coral": "0 4px 16px rgba(220,38,38,.12)",
        panel: "0 2px 10px rgba(15,23,42,.06)",
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