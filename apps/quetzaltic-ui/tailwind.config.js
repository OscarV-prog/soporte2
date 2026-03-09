const { createGlobPatternsForDependencies } = require('@nx/angular/tailwind');
const { join } = require('path');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    join(__dirname, 'src/**/!(*.stories|*.spec).{ts,html}'),
    ...createGlobPatternsForDependencies(__dirname),
  ],
  theme: {
    extend: {
      colors: {
        qz: {
          darkest: '#0B1315',   // Background Sidebar/Nav
          dark: '#111A1D',      // Background App
          card: '#182428',      // Card Background
          emerald: '#1FC684',   // Primary Emerald Green
          hover: '#29E09B',     // Hover Emerald Green
          light: '#354347',     // Borders and dividers
          text: '#D1D9DC',      // Main text
          muted: '#8B9C9F',     // Muted text
          danger: '#E54B4B',    // Red for rollback/lockdown
        }
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      }
    },
  },
  plugins: [],
};
