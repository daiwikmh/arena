/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        serif: ['Instrument Serif', 'serif'],
        barlow: ['Barlow', 'sans-serif'],
        inter: ['Inter', 'sans-serif'],
        display: ['Dirtyline', 'Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
