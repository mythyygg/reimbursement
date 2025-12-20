/** @type {import('tailwindcss').Config} */
const config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        "surface-0": "rgb(var(--surface-0) / <alpha-value>)",
        "surface-1": "rgb(var(--surface-1) / <alpha-value>)",
        "border": "rgb(var(--border) / <alpha-value>)",
        "text-primary": "rgb(var(--text-primary) / <alpha-value>)",
        "text-secondary": "rgb(var(--text-secondary) / <alpha-value>)",
        "text-tertiary": "rgb(var(--text-tertiary) / <alpha-value>)",
        "primary": "rgb(var(--primary) / <alpha-value>)",
        "success": "rgb(var(--success) / <alpha-value>)",
        "warning": "rgb(var(--warning) / <alpha-value>)",
        "danger": "rgb(var(--danger) / <alpha-value>)",
        "info": "rgb(var(--info) / <alpha-value>)"
      }
    }
  },
  plugins: []
};

export default config;
