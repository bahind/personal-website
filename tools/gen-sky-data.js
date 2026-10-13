// Generates js/sky-data.js from d3-celestial data (Hipparcos-derived, BSD-licensed).
// Usage: download stars.6.json, constellations.json, constellations.lines.json and starnames.json
// from data/ in https://github.com/ofrohn/d3-celestial, plus LICENSE from its root, into one dir:
//   node tools/gen-sky-data.js <data-dir> js/sky-data.js
const fs = require('fs');
const path = require('path');
const [dataDir, outFile] = process.argv.slice(2);
const load = (f) => JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8'));

const MAG_LIMIT = 5.2;
const DEC_MIN = -32; // never rises above Oslo's horizon below roughly -30°

const NO = {
    And: 'Andromeda', Aql: 'Ørnen', Aqr: 'Vannmannen', Ari: 'Væren', Aur: 'Kusken', Boo: 'Bjørnevokteren',
    Cam: 'Giraffen', Cnc: 'Krepsen', CVn: 'Jakthundene', CMa: 'Store hund', CMi: 'Lille hund',
    Cap: 'Steinbukken', Cas: 'Kassiopeia', Cep: 'Kefeus', Cet: 'Hvalen', Com: 'Berenikes hår',
    CrB: 'Nordkronen', Crv: 'Ravnen', Crt: 'Begeret', Cyg: 'Svanen', Del: 'Delfinen', Dra: 'Dragen',
    Equ: 'Folen', Eri: 'Eridanus', Gem: 'Tvillingene', Her: 'Herkules', Hya: 'Vannslangen', Lac: 'Øgla',
    Leo: 'Løven', LMi: 'Lille løve', Lep: 'Haren', Lib: 'Vekten', Lyn: 'Gaupa', Lyr: 'Lyren',
    Mon: 'Enhjørningen', Oph: 'Slangebæreren', Ori: 'Orion', Peg: 'Pegasus', Per: 'Perseus',
    Psc: 'Fiskene', Sge: 'Pilen', Sgr: 'Skytten', Sco: 'Skorpionen', Sct: 'Skjoldet', Ser: 'Slangen',
    Sex: 'Sekstanten', Tau: 'Tyren', Tri: 'Triangelet', UMa: 'Karlsvogna', UMi: 'Lille bjørn',
    Vir: 'Jomfruen', Vul: 'Reven', Col: 'Duen', Pyx: 'Kompasset', Ant: 'Luftpumpen',
    PsA: 'Sydlige fisk', Scl: 'Billedhuggeren', For: 'Ovnen', Cae: 'Gravstikken', Pup: 'Akterstavnen',
    Lup: 'Ulven', Cen: 'Kentauren', Mic: 'Mikroskopet', CrA: 'Sydkronen',
};

const raOf = (lon) => (lon < 0 ? lon + 360 : lon);
const angDist = (ra1, de1, ra2, de2) => {
    const r = Math.PI / 180;
    const c = Math.sin(de1 * r) * Math.sin(de2 * r) + Math.cos(de1 * r) * Math.cos(de2 * r) * Math.cos((ra1 - ra2) * r);
    return Math.acos(Math.min(1, Math.max(-1, c))) / r;
};

const allStars = load('stars.6.json').features.map((f) => ({
    hip: f.id,
    ra: raOf(f.geometry.coordinates[0]),
    dec: f.geometry.coordinates[1],
    mag: f.properties.mag,
    bv: parseFloat(f.properties.bv) || 0.6,
}));
const names = load('starnames.json');
const consts = load('constellations.json').features;
const lines = load('constellations.lines.json').features;

const chosen = new Map(); // hip -> star
for (const s of allStars) if (s.mag <= MAG_LIMIT && s.dec >= DEC_MIN) chosen.set(s.hip, s);

function nearestStar(ra, dec) {
    let best = null;
    let bestD = 0.35;
    for (const s of allStars) {
        if (Math.abs(s.dec - dec) > bestD) continue;
        const d = angDist(ra, dec, s.ra, s.dec);
        if (d < bestD) {
            bestD = d;
            best = s;
        }
    }
    return best;
}

const constOut = [];
for (const f of lines) {
    const meta = consts.find((c) => c.id === f.id);
    const polylines = f.geometry.coordinates;
    const decs = polylines.flat().map((p) => p[1]);
    if (Math.max(...decs) < -25) continue;
    const segs = [];
    for (const pl of polylines) {
        const hips = [];
        for (const [lon, dec] of pl) {
            const s = nearestStar(raOf(lon), dec);
            if (!s || s.dec < DEC_MIN) {
                if (!s) console.warn(`skip ${f.id} vertex ${lon},${dec}`);
                if (hips.length > 1) segs.push(hips.splice(0));
                hips.length = 0;
                continue;
            }
            chosen.set(s.hip, s);
            hips.push(s.hip);
        }
        if (hips.length > 1) segs.push(hips);
    }
    if (segs.length) constOut.push({ id: f.id, la: meta.properties.name, no: NO[f.id] || meta.properties.en, segs });
}

const stars = [...chosen.values()].sort((a, b) => a.mag - b.mag);
const index = new Map(stars.map((s, i) => [s.hip, i]));

const named = {};
for (const s of stars) {
    const n = names[s.hip] && names[s.hip].name;
    if (n && (s.mag < 2.6 || ['Polaris', 'Mizar', 'Alcor', 'Thuban', 'Albireo', 'Algol', 'Mira'].includes(n))) {
        named[index.get(s.hip)] = n;
    }
}

const flat = [];
for (const s of stars) flat.push(+s.ra.toFixed(3), +s.dec.toFixed(3), +s.mag.toFixed(2), +s.bv.toFixed(2));

const out = `// Generated sky catalog: ${stars.length} stars (mag <= ${MAG_LIMIT}, plus constellation vertices) visible from Oslo.
// Data: d3-celestial by Olaf Frohn (https://github.com/ofrohn/d3-celestial), derived from the Hipparcos catalogue.
${fs.readFileSync(path.join(dataDir, 'LICENSE'), 'utf8').trim().split('\n').map((l) => `// ${l}`.trimEnd()).join('\n')}
//
// stars: flat [ra°, dec° (J2000), magnitude, B-V colour index, ...]; constellations reference star indices.
window.Hind = window.Hind || {};
window.Hind.skyData = {
    stars: [${flat.join(',')}],
    names: ${JSON.stringify(named)},
    constellations: [
${constOut.map((c) => `        { id: ${JSON.stringify(c.id)}, la: ${JSON.stringify(c.la)}, no: ${JSON.stringify(c.no)}, segs: ${JSON.stringify(c.segs.map((seg) => seg.map((h) => index.get(h))))} },`).join('\n')}
    ],
};
`;
fs.writeFileSync(outFile, out);
console.log(`stars=${stars.length} constellations=${constOut.length} names=${Object.keys(named).length} bytes=${out.length}`);
