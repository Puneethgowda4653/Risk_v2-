/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: { 
    extend: {
      colors: {
        'sky-primary': '#0ea5e9',
        'sky-light': '#f0f9ff',
        'sky-pale': '#e0f2fe',
        'navy-primary': '#001f3f',
        'navy-dark': '#0d1117',
        'red-accent': '#ef4444',
        'red-light': '#fee2e2',
      },
      gradients: {
        corporate: 'linear-gradient(135deg, #0ea5e9 0%, #001f3f 100%)',
        'corporate-light': 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 50%, #f8f9fa 100%)',
      },
      boxShadow: {
        'corporate': '0 8px 32px rgba(0, 31, 63, 0.12), 0 0 1px rgba(14, 165, 233, 0.2)',
        'corporate-sm': '0 2px 8px rgba(0, 31, 63, 0.08)',
      }
    }
  },
  plugins: [],
}