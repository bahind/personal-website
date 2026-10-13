# Personal Website

Simple, minimalist, and responsive personal website.

## Project Structure

```
personal-website
├── index.html                 # Main HTML file
├── pgp.html                   # HTML file containing my PGP key
├── css
│   └── styles.css             # Custom styles for the website
├── js
│   ├── starfield.js           # The live night sky: interaction, intro, page warp
│   ├── astro.js               # Sidereal time, Sun, Moon and planet positions
│   ├── scenery.js             # Milky Way, aurora and misty hills
│   ├── sound.js               # Generative Web Audio soundscape (opt-in)
│   └── sky-data.js            # Star catalogue (d3-celestial, BSD licence)
├── tools
│   └── gen-sky-data.js        # Regenerates js/sky-data.js from d3-celestial
├── llms.txt                   # Greeting for AI agents
├── robots.txt                 # Greeting for crawlers, points to sitemap.xml
├── sitemap.xml                # Sitemap for search engines
├── assets
│   ├── favicon.ico            # Favicon for the website
│   └── bjorn-anders_hind.jpg  # Photo used for Open Graph / JSON-LD
└── README.md
```
