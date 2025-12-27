/** @type {import('tailwindcss').Config} */
const config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        "surface-0": "rgb(var(--surface-0) / <alpha-value>)",
        "surface-1": "rgb(var(--surface-1) / <alpha-value>)",
        "surface-2": "rgb(var(--surface-2) / <alpha-value>)",
        "surface-highlight": "rgb(var(--surface-highlight) / <alpha-value>)",
        "border": "rgb(var(--border) / <alpha-value>)",
        "border-light": "rgb(var(--border-light) / <alpha-value>)",
        "border-strong": "rgb(var(--border-strong) / <alpha-value>)",
        "text-primary": "rgb(var(--text-primary) / <alpha-value>)",
        "text-secondary": "rgb(var(--text-secondary) / <alpha-value>)",
        "text-tertiary": "rgb(var(--text-tertiary) / <alpha-value>)",
        "primary": "rgb(var(--primary) / <alpha-value>)",
        "primary-hover": "rgb(var(--primary-hover) / <alpha-value>)",
        "primary-light": "rgb(var(--primary-light) / <alpha-value>)",
        "success": "rgb(var(--success) / <alpha-value>)",
        "success-light": "rgb(var(--success-light) / <alpha-value>)",
        "warning": "rgb(var(--warning) / <alpha-value>)",
        "warning-light": "rgb(var(--warning-light) / <alpha-value>)",
        "danger": "rgb(var(--danger) / <alpha-value>)",
        "danger-light": "rgb(var(--danger-light) / <alpha-value>)",
        "info": "rgb(var(--info) / <alpha-value>)",
        "info-light": "rgb(var(--info-light) / <alpha-value>)"
      },
      borderRadius: {
        "xl": "0.875rem",
        "2xl": "1rem",
        "3xl": "1.25rem",
        "4xl": "1.5rem"
      },
      boxShadow: {
        "sm": "0 1px 3px 0 rgb(0 0 0 / 0.08), 0 1px 2px -1px rgb(0 0 0 / 0.08)",
        "DEFAULT": "0 2px 6px -1px rgb(0 0 0 / 0.08), 0 2px 4px -2px rgb(0 0 0 / 0.08)",
        "md": "0 4px 12px -2px rgb(0 0 0 / 0.08), 0 2px 6px -2px rgb(0 0 0 / 0.08)",
        "lg": "0 8px 24px -4px rgb(0 0 0 / 0.10), 0 4px 8px -4px rgb(0 0 0 / 0.08)",
        "xl": "0 12px 32px -6px rgb(0 0 0 / 0.12), 0 6px 12px -6px rgb(0 0 0 / 0.10)",
        "2xl": "0 20px 48px -8px rgb(0 0 0 / 0.14), 0 8px 16px -8px rgb(0 0 0 / 0.12)",
        "card": "0 2px 8px -1px rgb(0 0 0 / 0.06), 0 1px 4px -1px rgb(0 0 0 / 0.06)",
        "card-hover": "0 8px 24px -4px rgb(0 0 0 / 0.10), 0 4px 12px -4px rgb(0 0 0 / 0.08)"
      },
      fontWeight: {
        "semibold": "600",
        "bold": "700",
        "extrabold": "800"
      }
    }
  },
  plugins: []
};

export default config;
