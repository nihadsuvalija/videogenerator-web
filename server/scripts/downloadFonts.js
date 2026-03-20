/**
 * Downloads TTF font files from Google Fonts GitHub repo into server/data/fonts/
 * Run once: node server/scripts/downloadFonts.js
 */
const https = require('https');
const fs    = require('fs');
const path  = require('path');

const FONTS_DIR = path.join(__dirname, '../data/fonts');
fs.mkdirSync(FONTS_DIR, { recursive: true });

const BASE = 'https://raw.githubusercontent.com/google/fonts/main';

const FONTS = [
  { file: 'Roboto.ttf',           url: `${BASE}/ofl/roboto/Roboto%5Bwdth%2Cwght%5D.ttf` },
  { file: 'Open-Sans.ttf',        url: `${BASE}/ofl/opensans/OpenSans%5Bwdth%2Cwght%5D.ttf` },
  { file: 'Lato.ttf',             url: `${BASE}/ofl/lato/Lato-Bold.ttf` },
  { file: 'Montserrat.ttf',       url: `${BASE}/ofl/montserrat/Montserrat%5Bwght%5D.ttf` },
  { file: 'Oswald.ttf',           url: `${BASE}/ofl/oswald/Oswald%5Bwght%5D.ttf` },
  { file: 'Raleway.ttf',          url: `${BASE}/ofl/raleway/Raleway%5Bwght%5D.ttf` },
  { file: 'Poppins.ttf',          url: `${BASE}/ofl/poppins/Poppins-Bold.ttf` },
  { file: 'Nunito.ttf',           url: `${BASE}/ofl/nunito/Nunito%5Bwght%5D.ttf` },
  { file: 'Inter.ttf',            url: `${BASE}/ofl/inter/Inter%5Bopsz%2Cwght%5D.ttf` },
  { file: 'Ubuntu.ttf',           url: `${BASE}/ufl/ubuntu/Ubuntu-Bold.ttf` },
  { file: 'Playfair-Display.ttf', url: `${BASE}/ofl/playfairdisplay/PlayfairDisplay%5Bwght%5D.ttf` },
  { file: 'Merriweather.ttf',     url: `${BASE}/ofl/merriweather/Merriweather%5Bopsz%2Cwdth%2Cwght%5D.ttf` },
  { file: 'Bebas-Neue.ttf',       url: `${BASE}/ofl/bebasneue/BebasNeue-Regular.ttf` },
  { file: 'Anton.ttf',            url: `${BASE}/ofl/anton/Anton-Regular.ttf` },
  { file: 'Pacifico.ttf',         url: `${BASE}/ofl/pacifico/Pacifico-Regular.ttf` },
  { file: 'Dancing-Script.ttf',   url: `${BASE}/ofl/dancingscript/DancingScript%5Bwght%5D.ttf` },
  { file: 'Lobster.ttf',          url: `${BASE}/ofl/lobster/Lobster-Regular.ttf` },
  { file: 'Righteous.ttf',        url: `${BASE}/ofl/righteous/Righteous-Regular.ttf` },
  { file: 'Orbitron.ttf',         url: `${BASE}/ofl/orbitron/Orbitron%5Bwght%5D.ttf` },
  { file: 'Russo-One.ttf',        url: `${BASE}/ofl/russoone/RussoOne-Regular.ttf` },
  { file: 'Permanent-Marker.ttf', url: `${BASE}/apache/permanentmarker/PermanentMarker-Regular.ttf` },
  { file: 'Special-Elite.ttf',    url: `${BASE}/apache/specialelite/SpecialElite-Regular.ttf` },
];

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.get({ hostname: u.hostname, path: u.pathname + u.search }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return httpsGet(res.headers.location).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
  });
}

async function main() {
  let ok = 0, skip = 0, fail = 0;

  for (const font of FONTS) {
    const dest = path.join(FONTS_DIR, font.file);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) {
      console.log(`  ✓ skip  ${font.file}`);
      skip++;
      continue;
    }

    try {
      const { status, body } = await httpsGet(font.url);
      if (status !== 200) {
        console.error(`  ✗ fail  ${font.file} — HTTP ${status}`);
        fail++;
        continue;
      }
      fs.writeFileSync(dest, body);
      console.log(`  ↓ done  ${font.file}  (${Math.round(body.length / 1024)} KB)`);
      ok++;
    } catch (e) {
      console.error(`  ✗ fail  ${font.file} — ${e.message}`);
      fail++;
    }
  }

  console.log(`\nDone: ${ok} downloaded, ${skip} skipped, ${fail} failed`);
}

main();
