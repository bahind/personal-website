// The real night sky, right now: stars, constellations, Moon and planets projected for an
// observer looking north (computed for Oslo), with the aurora above layered, misty hills.
// Every star is tethered to its true position by a spring, so it can be grabbed, flung,
// blasted or swallowed by a black hole — and the sky always heals itself.
(() => {
    console.log(
        '%chind.nu_',
        'color:#00ADB5; font-family:monospace; font-size:22px; font-weight:bold; text-shadow:0 0 8px rgba(0,173,181,0.7)'
    );
    console.log(
        '%cHi, fellow explorer! The sky behind this page is the real night sky, right now.',
        'color:#EEEEEE; font-family:monospace'
    );
    console.log(
        '%cStars can be grabbed and flung. Press and hold to bend spacetime. Shooting stars grant wishes, if you catch them.',
        'color:#8a96a8; font-family:monospace'
    );

    const canvas = document.getElementById('starfield');
    const H = window.Hind || {};
    const { astro: A, scenery: S, skyData, sound } = H;
    if (!canvas || !A || !S || !skyData) return;
    const ctx = canvas.getContext('2d');
    const root = document.documentElement;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const { clamp, lerp, smoothstep } = S;
    const RAD = A.RAD;

    const CYAN = '0, 173, 181';
    const GOLD = '255, 211, 105';
    const GOLD_CSS = `rgb(${GOLD})`;
    const POINTER_DIST = 170;
    const GRAB_DIST = 20;
    const GRAB_MAG = 4.2; // only reasonably bright stars can be grabbed, leaving room to click empty sky
    const SKY_PAD = 40;
    const STEP_MS = 1000 / 60;
    const CENTER_ALT = 35 * RAD; // the view looks north, tilted up to here
    const TOP_ALT = 85 * RAD; // altitude at the top edge of the screen
    const SIN_C0 = Math.sin(CENTER_ALT);
    const COS_C0 = Math.cos(CENTER_ALT);
    const FAMOUS = ['UMa', 'Cas', 'Cyg', 'Lyr', 'UMi', 'Per', 'Aur', 'Ori', 'Gem', 'Leo', 'Peg', 'And', 'Boo', 'Dra', 'Cep', 'Tau', 'Aql', 'Her', 'CrB'];
    const PLANET_COLORS = { Mercury: [235, 225, 210], Venus: [255, 250, 232], Mars: [255, 150, 105], Jupiter: [255, 238, 212], Saturn: [240, 222, 170] };
    const COMPASS = [[-90, 'V'], [-45, 'NV'], [0, 'N'], [45, 'NØ'], [90, 'Ø']];

    // ------------------------------------------------------------------ state

    let width = 0;
    let height = 0;
    let dpr = 1;
    let horizonY = 0;
    let scale = 0; // stereographic radius in px
    let cx = 0;
    let cy = 0;
    let jd = 0;
    let lst = 0;
    let lastProjection = 0;
    let sunAlt = -90;
    let sunX = 0;
    let moon = null;

    const stars = [];
    const visible = [];
    const shockwaves = [];
    const sparks = [];
    const wishes = [];
    const pointer = { x: null, y: null, down: false, downAt: 0, downX: 0, downY: 0, lastMove: -Infinity, type: 'mouse' };
    const parallax = { x: 0, y: 0, tx: 0, ty: 0 };
    const tour = { target: null, until: 0, next: performance.now() + 5200, first: true };
    let tap = null;
    let dragged = null;
    let blackHole = null;
    let shootingStar = null;
    let nextShootingStar = performance.now() + 6000 + Math.random() * 6000;
    let goldUntil = 0;
    let flare = 0;
    let leaving = null;
    let skyDirty = true;
    let auroraSoundAt = 0;

    // Time travel for the curious (and for testing): ?at=2026-12-24T22:00 shows that sky instead
    const travel = Date.parse(new URLSearchParams(window.location.search).get('at') || '');
    const clockOffset = Number.isNaN(travel) ? 0 : travel - Date.now();
    const skyNow = () => Date.now() + clockOffset;

    const skyLayer = document.createElement('canvas');
    const milkyWay = S.createMilkyWay(A.galacticToEquatorial);
    const aurora = S.createAurora();
    const hills = S.createHills();

    // ------------------------------------------------------------------ catalog

    // B–V colour index to a gently desaturated star colour
    const BV_STOPS = [[-0.4, [155, 178, 255]], [0, [200, 214, 255]], [0.4, [250, 248, 255]], [0.8, [255, 236, 214]], [1.2, [255, 214, 168]], [2, [255, 180, 120]]];
    function bvColor(bv) {
        let i = 0;
        while (i < BV_STOPS.length - 2 && bv > BV_STOPS[i + 1][0]) i++;
        const [b0, c0] = BV_STOPS[i];
        const [b1, c1] = BV_STOPS[i + 1];
        const t = clamp((bv - b0) / (b1 - b0));
        return c0.map((v, k) => Math.round(lerp(lerp(v, c1[k], t), 255, 0.2)));
    }

    function setMagnitude(s, mag) {
        s.mag = mag;
        s.r = clamp(0.5 + (4.9 - mag) * 0.4, 0.5, 3.6);
        s.alpha = clamp(0.3 + (5.4 - mag) * 0.17, 0.22, 1);
    }

    function makeStar(ra, dec, mag, color, name, planet = false) {
        const s = {
            ra, dec, name, planet,
            rgb: color.join(', '),
            css: `rgb(${color.join(', ')})`,
            x: 0, y: 0, vx: 0, vy: 0, hx: 0, hy: 0, alt: 0,
            tether: 1, on: false, hidden: false, ext: 1,
            phase: Math.random() * Math.PI * 2,
            speed: 0.8 + Math.random() * 1.8,
            introDelay: 0,
        };
        setMagnitude(s, mag);
        return s;
    }

    {
        const D = skyData.stars;
        for (let i = 0; i < D.length; i += 4) {
            stars.push(makeStar(D[i], D[i + 1], D[i + 2], bvColor(D[i + 3]), skyData.names[i / 4]));
        }
    }
    const planetStars = Object.keys(PLANET_COLORS).map((name) => {
        const p = makeStar(0, 0, 0, PLANET_COLORS[name], name, true);
        stars.push(p);
        return p;
    });
    const named = stars.filter((s) => s.name);

    const constellations = skyData.constellations.map((c) => {
        const edges = [];
        for (const seg of c.segs) for (let k = 0; k < seg.length - 1; k++) edges.push([stars[seg[k]], stars[seg[k + 1]]]);
        const members = [...new Set(c.segs.flat())].map((i) => stars[i]);
        return { ...c, edges, members, alpha: 0, progress: 0, drawn: 0, onFrac: 0 };
    });

    // ------------------------------------------------------------------ projection

    // Stereographic projection centred on (CENTER_ALT, due north); east is to the right
    function project(alt, az) {
        const cosAlt = Math.cos(alt);
        const denom = 1 + SIN_C0 * Math.sin(alt) + COS_C0 * cosAlt * Math.cos(az);
        if (denom < 0.2) return null;
        const k = (2 * scale) / denom;
        return {
            x: cx + k * cosAlt * Math.sin(az),
            y: cy - k * (COS_C0 * Math.sin(alt) - SIN_C0 * cosAlt * Math.cos(az)),
        };
    }

    function equatorialToScreen(ra, dec) {
        const p = A.precess(ra, dec, jd);
        const hz = A.horizontal(p.ra, p.dec, lst);
        return { hz, p: hz.alt > -0.05 ? project(hz.alt, hz.az) : null };
    }

    const unitVector = (ra, dec) => [Math.cos(dec * RAD) * Math.cos(ra * RAD), Math.cos(dec * RAD) * Math.sin(ra * RAD), Math.sin(dec * RAD)];

    function reproject(snap) {
        jd = A.julianDate(skyNow());
        lst = A.siderealTime(jd, A.OSLO.lon);
        lastProjection = performance.now();

        for (const p of A.planets(jd)) {
            const s = planetStars.find((ps) => ps.name === p.name);
            s.ra = p.ra;
            s.dec = p.dec;
            setMagnitude(s, p.mag);
        }

        visible.length = 0;
        const margin = 80;
        for (const s of stars) {
            const { hz, p } = equatorialToScreen(s.ra, s.dec);
            s.alt = hz.alt / RAD;
            if (!p || s.alt < -1 || p.x < -margin || p.x > width + margin || p.y < -margin || p.y > height + margin) {
                if (!s.hidden) s.on = false;
                continue;
            }
            s.hx = p.x;
            s.hy = p.y;
            if ((snap || !s.on) && !s.hidden) {
                s.x = p.x;
                s.y = p.y;
                s.vx = 0;
                s.vy = 0;
                s.tether = 1;
            }
            s.on = true;
            s.ext = smoothstep(-0.5, 10, s.alt);
            visible.push(s);
        }

        const sunPos = A.sun(jd);
        const sunHz = A.horizontal(sunPos.ra, sunPos.dec, lst);
        sunAlt = sunHz.alt / RAD;
        const sunOnHorizon = project(0, sunHz.az);
        sunX = sunOnHorizon ? clamp(sunOnHorizon.x, -width, 2 * width) : Math.sin(sunHz.az) > 0 ? 2 * width : -width;

        // Moon, with topocentric parallax and the direction of its lit limb on screen
        const m = A.moon(jd);
        const moonHz = A.horizontal(m.ra, m.dec, lst);
        const parallaxShift = m.parallax * RAD * Math.cos(moonHz.alt);
        const moonAlt = moonHz.alt - parallaxShift;
        const mp = project(moonAlt, moonHz.az);
        moon = null;
        if (mp && moonAlt > -1 * RAD) {
            const mv = unitVector(m.ra, m.dec);
            const sv = unitVector(sunPos.ra, sunPos.dec);
            const dot = mv[0] * sv[0] + mv[1] * sv[1] + mv[2] * sv[2];
            let d = sv.map((v, i) => v - dot * mv[i]);
            const len = Math.hypot(...d) || 1;
            d = d.map((v) => v / len);
            const step = 1 * RAD;
            const q = mv.map((v, i) => v * Math.cos(step) + d[i] * Math.sin(step));
            const qHz = A.horizontal(Math.atan2(q[1], q[0]) / RAD, Math.asin(q[2]) / RAD, lst);
            const qp = project(qHz.alt - parallaxShift, qHz.az);
            moon = {
                x: mp.x,
                y: mp.y,
                alt: moonAlt / RAD,
                illum: A.moonIllumination(sunPos, m),
                angle: qp ? Math.atan2(qp.y - mp.y, qp.x - mp.x) : 0,
                onScreen: mp.x > -60 && mp.x < width + 60 && mp.y > -60 && mp.y < height + 60,
            };
        }

        for (const c of constellations) {
            c.onFrac = c.members.filter((s) => s.on && s.alt > 1.5).length / c.members.length;
        }
        skyDirty = true;
    }

    function renderSkyLayer() {
        skyDirty = false;
        S.renderSky(skyLayer, milkyWay, {
            w: width,
            h: height,
            dpr,
            pad: SKY_PAD,
            horizonY,
            pxPerDeg: scale * RAD,
            sunAlt,
            sunX,
            moon,
            toScreen(ra, dec) {
                const { hz, p } = equatorialToScreen(ra, dec);
                if (!p || p.x < -300 || p.x > width + 300 || p.y < -300 || p.y > height + 300) return null;
                return { x: p.x, y: p.y, alt: hz.alt / RAD };
            },
        });
    }

    hills.setCompass(() =>
        COMPASS.map(([az, label]) => ({ label, p: project(0, az * RAD) }))
            .filter((m) => m.p && m.p.x > 20 && m.p.x < width - 20)
            .map((m) => ({ label: m.label, x: m.p.x }))
    );

    function resize() {
        width = window.innerWidth;
        height = window.innerHeight;
        // Cap the backing store at ~3 megapixels so big HiDPI screens stay smooth
        dpr = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(3e6 / (width * height)));
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        horizonY = height * (width < height ? 0.87 : 0.84);
        const below = 2 * Math.tan(CENTER_ALT / 2);
        scale = horizonY / (below + 2 * Math.tan((TOP_ALT - CENTER_ALT) / 2));
        cx = width / 2;
        cy = horizonY - scale * below;
        aurora.resize(width, height, horizonY);
        hills.resize(width, height, horizonY, dpr);
        measureContent();
        dragged = null;
        reproject(true);
        if (reduceMotion) drawStatic();
    }

    // ------------------------------------------------------------------ sprites

    function makeGlow(color) {
        const c = document.createElement('canvas');
        c.width = c.height = 64;
        const g = c.getContext('2d').createRadialGradient(32, 32, 0, 32, 32, 32);
        g.addColorStop(0, `rgba(${color}, 0.9)`);
        g.addColorStop(0.12, `rgba(${color}, 0.35)`);
        g.addColorStop(0.4, `rgba(${color}, 0.08)`);
        g.addColorStop(1, `rgba(${color}, 0)`);
        const cctx = c.getContext('2d');
        cctx.fillStyle = g;
        cctx.fillRect(0, 0, 64, 64);
        return c;
    }
    const glowWhite = makeGlow('235, 240, 255');
    const glowGold = makeGlow(GOLD);
    const glowCyan = makeGlow(CYAN);

    // ------------------------------------------------------------------ intro & exit

    // Intro timeline in seconds (the short in-site arrival plays it at 0.55× this)
    const T = { warpEnd: 1.15, starsFrom: 0.15, starsSpan: 0.6, starDur: 0.7, sky: [0.3, 1.4], hills: [0.55, 1.6], aurora: [1.1, 2.5], nameStart: 0.7, reveal: 1.95, end: 2.5 };
    const ease = {
        outCubic: (t) => 1 - Math.pow(1 - t, 3),
        outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
        inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    };

    let intro = null;
    {
        const mode = root.classList.contains('arrive-full') ? 'full' : root.classList.contains('arrive-short') ? 'short' : null;
        try {
            sessionStorage.removeItem('hind-jump');
            sessionStorage.setItem('hind-visited', '1');
        } catch {
            /* private mode: the intro simply plays again */
        }
        if (mode && !reduceMotion) {
            intro = { scale: mode === 'full' ? 1 : 0.55, start: performance.now(), warp: [], name: null, revealed: false, fontReady: false };
            for (let i = 0; i < 240; i++) intro.warp.push({ x: Math.random() * 2 - 1, y: Math.random() * 2 - 1, z: Math.random(), tone: 0.35 + Math.random() * 0.65 });
            for (const s of stars) s.introDelay = T.starsFrom + Math.random() * T.starsSpan;
            if (document.fonts && document.fonts.load) {
                const h1 = document.querySelector('h1');
                const style = h1 && getComputedStyle(h1);
                const font = style ? `${style.fontWeight} ${style.fontSize} Orbitron` : '700 32px Orbitron';
                document.fonts.load(font).then(() => intro && (intro.fontReady = true), () => {});
            }
        }
    }
    const introTime = (now) => (intro ? (now - intro.start) / 1000 / intro.scale : Infinity);

    function finishIntro() {
        if (!intro) return;
        intro = null;
        root.classList.add('arrived');
        for (const s of visible) {
            s.x = s.hx;
            s.y = s.hy;
            s.vx = s.vy = 0;
        }
    }

    // Sample the h1's glyphs into particle targets that will fly in and form the name
    function prepareName() {
        const h1 = document.querySelector('h1');
        const node = h1 && [...h1.childNodes].find((n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim());
        if (!node) return [];
        const style = getComputedStyle(h1);
        const rect = h1.getBoundingClientRect();
        const off = document.createElement('canvas');
        off.width = Math.ceil(width);
        off.height = Math.ceil(height);
        const octx = off.getContext('2d', { willReadFrequently: true });
        octx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        octx.fillStyle = '#fff';
        const range = document.createRange();
        const text = node.textContent;
        for (let i = 0; i < text.length; i++) {
            if (!text[i].trim()) continue;
            range.setStart(node, i);
            range.setEnd(node, i + 1);
            const r = range.getBoundingClientRect();
            if (!r.width) continue;
            const m = octx.measureText(text[i]);
            const ascent = m.fontBoundingBoxAscent || parseFloat(style.fontSize) * 0.8;
            const descent = m.fontBoundingBoxDescent || parseFloat(style.fontSize) * 0.2;
            octx.fillText(text[i], r.left, r.top + (ascent * r.height) / (ascent + descent));
        }
        const x0 = Math.max(0, Math.floor(rect.left - 4));
        const y0 = Math.max(0, Math.floor(rect.top - 4));
        const w = Math.min(off.width - x0, Math.ceil(rect.width + 8));
        const h = Math.min(off.height - y0, Math.ceil(rect.height + 8));
        if (w <= 0 || h <= 0) return [];
        const data = octx.getImageData(x0, y0, w, h).data;
        const step = Math.max(2, Math.round(parseFloat(style.fontSize) / 13));
        let points = [];
        for (let y = 0; y < h; y += step) {
            for (let x = 0; x < w; x += step) {
                if (data[(y * w + x) * 4 + 3] > 120) points.push([x0 + x, y0 + y]);
            }
        }
        if (points.length > 1400) points = points.filter(() => Math.random() < 1400 / points.length);
        const sources = visible.filter((s) => s.mag < 4.5);
        return points.map(([tx, ty]) => {
            const src = sources.length && Math.random() < 0.6 ? sources[Math.floor(Math.random() * sources.length)] : null;
            const sx = src ? src.hx : Math.random() * width;
            const sy = src ? src.hy : Math.random() * height;
            const mx = (sx + tx) / 2;
            const my = (sy + ty) / 2;
            const swirl = (Math.random() - 0.5) * 260;
            const len = Math.hypot(tx - sx, ty - sy) || 1;
            return {
                sx, sy, tx, ty,
                qx: mx + (-(ty - sy) / len) * swirl,
                qy: my + ((tx - sx) / len) * swirl,
                delay: Math.random() * 0.18 + ((tx - rect.left) / rect.width) * 0.28,
                dur: 0.65 + Math.random() * 0.25,
            };
        });
    }

    function startLeaving(href) {
        leaving = { start: performance.now(), href };
        root.classList.add('leaving');
        if (sound) sound.whoosh();
        if (sound) sound.glideEnd();
        dragged = null;
        if (blackHole) collapse();
        setTimeout(() => {
            try {
                sessionStorage.setItem('hind-jump', '1');
            } catch {
                /* the next page just won't play the arrival */
            }
            window.location.href = href;
        }, 720);
    }

    // ------------------------------------------------------------------ interactions

    const offset = (depth) => ({ x: -parallax.x * depth, y: -parallax.y * depth * 0.6 });
    const panOf = (x) => clamp((x / width) * 2 - 1, -1, 1); // stereo position of a screen x
    const DEPTH = { sky: 5, aurora: 12, stars: 9, far: 18, near: 30 };

    // Pointer in star space (stars are drawn with their own parallax offset)
    function localPointer() {
        if (pointer.x === null) return null;
        const o = offset(DEPTH.stars);
        return { x: pointer.x - o.x, y: pointer.y - o.y };
    }

    const grabbable = (s) => s.mag < GRAB_MAG;

    function nearestStar(x, y, maxDist, filter = () => true) {
        let best = null;
        let bestDist = maxDist;
        for (const s of visible) {
            if (s.hidden || s.ext < 0.2 || !filter(s)) continue;
            const d = Math.hypot(s.x - x, s.y - y);
            if (d < bestDist) {
                bestDist = d;
                best = s;
            }
        }
        return best;
    }

    function segmentDistance(px, py, a, b) {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len2 = dx * dx + dy * dy || 1;
        const t = clamp(((px - a.x) * dx + (py - a.y) * dy) / len2);
        return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
    }

    function constellationNear(x, y, maxDist) {
        let best = null;
        let bestDist = maxDist;
        for (const c of constellations) {
            if (c.onFrac < 0.6) continue;
            for (const [a, b] of c.edges) {
                if (!a.on || !b.on) continue;
                const d = segmentDistance(x, y, a, b);
                if (d < bestDist) {
                    bestDist = d;
                    best = c;
                }
            }
        }
        return best;
    }

    function burst(x, y, count, color, speed = 4) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const v = speed * (0.3 + Math.random());
            sparks.push({ x, y, vx: Math.cos(angle) * v, vy: Math.sin(angle) * v, life: 1, decay: 0.012 + Math.random() * 0.02, color });
        }
    }

    function supernova(el) {
        const rect = el.getBoundingClientRect();
        const o = offset(DEPTH.stars);
        const x = rect.left + rect.width / 2 - o.x;
        const y = rect.top + rect.height / 2 - o.y;
        goldUntil = performance.now() + 4000;
        flare = Math.min(1.6, flare + 1.2);
        const reach = Math.max(width, height);
        for (const s of visible) {
            const dx = s.x - x;
            const dy = s.y - y;
            const d = Math.hypot(dx, dy) || 1;
            const force = 11 * Math.max(0.25, 1 - d / reach);
            s.vx += (dx / d) * force;
            s.vy += (dy / d) * force;
            s.tether = 0.05;
        }
        shockwaves.push({ x, y, radius: 0, energy: 1.6, gold: true });
        burst(x, y, 90, GOLD, 7);
        if (sound) sound.supernova(panOf(x));
    }

    // ---- black hole accretion disk: glowing particles on Keplerian orbits that spiral in,
    // heating from cyan through gold to white. The disk is tilted almost edge-on.
    const DISK_TILT = 0.28;
    const DISK_ROT = -0.16;
    const COS_ROT = Math.cos(DISK_ROT);
    const SIN_ROT = Math.sin(DISK_ROT);
    const holeCore = (bh) => 8 + 14 * Math.min(1, bh.mass);

    function feedDisk(bh, count, color = null) {
        const core = holeCore(bh);
        for (let i = 0; i < count; i++) {
            const r = core * (2.6 + Math.random() * 4);
            const theta = Math.random() * Math.PI * 2;
            bh.disk.push({ r, theta, pr: r, ptheta: theta, size: 0.6 + Math.random() * 1.1, life: 0, color });
        }
    }

    function updateDisk(bh) {
        const core = holeCore(bh);
        const target = Math.round(60 + 340 * Math.min(1, bh.mass));
        if (bh.disk.length < target) feedDisk(bh, Math.min(5, target - bh.disk.length));
        for (const p of bh.disk) {
            p.pr = p.r;
            p.ptheta = p.theta;
            p.theta += 0.17 * Math.pow(core / p.r, 1.5); // inner orbits run faster
            p.r -= 0.012 * core * (core / p.r);
            p.life = Math.min(1, p.life + 0.03);
            if (p.r < core * 1.08) {
                // Fell through the horizon: recycle it at the rim
                p.r = p.pr = core * (3 + Math.random() * 3.6);
                p.theta = p.ptheta = Math.random() * Math.PI * 2;
                p.life = 0;
                p.color = null;
            }
        }
    }

    // Disk-plane polar coordinates to screen, around the hole
    function diskPoint(bh, r, theta) {
        const x = Math.cos(theta) * r;
        const y = Math.sin(theta) * r * DISK_TILT;
        return [bh.x + x * COS_ROT - y * SIN_ROT, bh.y + x * SIN_ROT + y * COS_ROT];
    }

    // Lensed image of the far side of the disk, bent over (or under) the shadow
    function lensedPoint(bh, r, theta, below) {
        const core = holeCore(bh);
        const radius = core * (1.7 + (r / core - 1.1) * 0.16);
        const x = Math.cos(theta) * radius;
        const y = Math.abs(Math.sin(theta)) * radius * (below ? 0.85 : -1);
        return [bh.x + x * COS_ROT - y * SIN_ROT, bh.y + x * SIN_ROT + y * COS_ROT];
    }

    const HEAT_STOPS = [[0, [0, 173, 181]], [0.55, [255, 211, 105]], [1, [255, 248, 235]]];
    function heatColor(heat, tint) {
        const i = heat < HEAT_STOPS[1][0] ? 0 : 1;
        const [h0, c0] = HEAT_STOPS[i];
        const [h1, c1] = HEAT_STOPS[i + 1];
        const f = clamp((heat - h0) / (h1 - h0));
        let c = c0.map((v, k) => lerp(v, c1[k], f));
        if (tint) {
            // Matter from a swallowed star keeps a little of its own colour while it's cool
            const t = tint.split(', ').map(Number);
            c = c.map((v, k) => lerp(t[k], v, 0.4 + 0.6 * heat));
        }
        return c.map(Math.round).join(', ');
    }

    const HEAT_LEVELS = 7;
    const ALPHA_LEVELS = 5;
    const HEAT_CSS = Array.from({ length: HEAT_LEVELS }, (_, i) => `rgb(${heatColor(i / (HEAT_LEVELS - 1))})`);

    function collapse() {
        const bh = blackHole;
        blackHole = null;
        if (!bh) return;
        // The disk unwinds into stardust: muted starlight drifting off along the orbits
        const core = holeCore(bh);
        for (const p of bh.disk) {
            if (p.life < 0.2 || Math.random() < 0.45) continue;
            const [x, y] = diskPoint(bh, p.r, p.theta);
            const [nx, ny] = diskPoint(bh, p.r, p.theta + 0.05);
            const tx = nx - x;
            const ty = ny - y;
            const tl = Math.hypot(tx, ty) || 1;
            const rx = x - bh.x;
            const ry = y - bh.y;
            const rl = Math.hypot(rx, ry) || 1;
            const heat = clamp(1 - (p.r - core * 1.1) / (core * 4.5));
            const spin = 1.2 + heat * 2.8;
            const out = 0.6 + Math.random() * 1.8 + bh.mass * 1.2;
            sparks.push({
                x, y,
                vx: (tx / tl) * spin + (rx / rl) * out,
                vy: (ty / tl) * spin + (ry / rl) * out,
                life: 1,
                decay: 0.004 + Math.random() * 0.006,
                drag: 0.975,
                dust: true,
                phase: Math.random() * Math.PI * 2,
                color: heat > 0.6 ? '240, 232, 214' : '214, 226, 248',
            });
        }
        for (const s of bh.swallowed) {
            const angle = Math.random() * Math.PI * 2;
            const v = 4 + Math.random() * 9 + bh.mass * 6;
            s.hidden = false;
            s.x = bh.x + Math.cos(angle) * 3;
            s.y = bh.y + Math.sin(angle) * 3;
            s.vx = Math.cos(angle) * v;
            s.vy = Math.sin(angle) * v;
            s.tether = 0;
        }
        shockwaves.push({ x: bh.x, y: bh.y, radius: 0, energy: 0.5 + bh.mass });
        flare = Math.min(1.6, flare + bh.mass * 0.7);
        if (sound) {
            sound.holeRelease(Math.min(1, bh.mass), bh.swallowed.length > 0, panOf(bh.x));
        }
    }

    function makeWish(x, y) {
        burst(x, y, 40, GOLD, 3);
        wishes.push({ x, y, born: performance.now() });
        shootingStar = null;
        console.log('%c✦ wish granted', 'color:#FFD369; font-family:monospace');
        if (sound) sound.shimmer(panOf(x));
    }

    // ------------------------------------------------------------------ simulation

    function step(now) {
        parallax.x += (parallax.tx - parallax.x) * 0.04;
        parallax.y += (parallax.ty - parallax.y) * 0.04;
        flare *= 0.985;

        const ti = introTime(now);
        if (intro && ti < T.starsFrom + T.starsSpan + T.starDur) return;

        const local = localPointer();
        const leaveT = leaving ? (now - leaving.start) / 1000 : 0;

        if (pointer.down && !dragged && !blackHole && local && now - pointer.downAt > 380 && !leaving) {
            blackHole = { x: local.x, y: local.y, mass: 0, born: now, swallowed: [], spin: 0, disk: [], implode: 1 };
        }
        if (blackHole) {
            const bh = blackHole;
            bh.mass = Math.min(1.25, (now - bh.born) / 1800 + bh.swallowed.length * 0.004);
            bh.spin += 0.02 + bh.mass * 0.05;
            bh.implode = Math.max(0, bh.implode - 0.025);
            if (local) {
                bh.x += (local.x - bh.x) * 0.06;
                bh.y += (local.y - bh.y) * 0.06;
            }
            updateDisk(bh);
            if (sound) sound.hole(Math.min(1, bh.mass), panOf(bh.x));
        }

        for (const s of visible) {
            if (s.hidden) continue;
            if (s === dragged) {
                if (local) {
                    // Spring toward the pointer; retained velocity becomes the fling
                    s.vx = (local.x - s.x) * 0.35;
                    s.vy = (local.y - s.y) * 0.35;
                }
                s.x += s.vx;
                s.y += s.vy;
                if (sound) sound.glide(Math.hypot(s.vx, s.vy), s.y / height, panOf(s.x));
                continue;
            }

            if (leaving) {
                const dx = s.x - width / 2;
                const dy = s.y - height * 0.45;
                const d = Math.hypot(dx, dy) || 1;
                const accel = 0.2 + leaveT * leaveT * 9;
                s.vx += (dx / d) * accel;
                s.vy += (dy / d) * accel;
                s.x += s.vx;
                s.y += s.vy;
                continue;
            }

            if (local && !blackHole) {
                const dx = local.x - s.x;
                const dy = local.y - s.y;
                const d = Math.hypot(dx, dy);
                if (d > 1 && d < POINTER_DIST) {
                    // Stars lean toward the cursor
                    const force = 0.09 * (1 - d / POINTER_DIST);
                    s.vx += (dx / d) * force;
                    s.vy += (dy / d) * force;
                }
            }

            for (const wave of shockwaves) {
                const dx = s.x - wave.x;
                const dy = s.y - wave.y;
                const d = Math.hypot(dx, dy);
                if (d > 1 && Math.abs(d - wave.radius) < 40) {
                    const force = 1.5 * wave.energy;
                    s.vx += (dx / d) * force;
                    s.vy += (dy / d) * force;
                    s.tether = Math.min(s.tether, 0.3);
                }
            }

            if (blackHole) {
                const bh = blackHole;
                const dx = bh.x - s.x;
                const dy = bh.y - s.y;
                const d = Math.hypot(dx, dy) || 1;
                const reach = 90 + 280 * bh.mass;
                if (d < reach) {
                    s.tether = 0;
                    const pull = bh.mass * (0.35 * (1 - d / reach) + 6 / (d + 12));
                    s.vx += (dx / d) * pull - (dy / d) * pull * 0.8;
                    s.vy += (dy / d) * pull + (dx / d) * pull * 0.8;
                    s.vx *= 0.99;
                    s.vy *= 0.99;
                    if (d < holeCore(bh) * 1.5) {
                        // The star is torn apart and its light joins the disk
                        s.hidden = true;
                        bh.swallowed.push(s);
                        feedDisk(bh, 5, s.rgb);
                    }
                }
            }

            // Spring home to the star's true position; a disturbed star drifts freely first
            const k = 0.006 * s.tether;
            s.vx += (s.hx - s.x) * k;
            s.vy += (s.hy - s.y) * k;
            const damp = 0.985 - 0.055 * s.tether;
            s.vx *= damp;
            s.vy *= damp;
            s.x += s.vx;
            s.y += s.vy;
            s.tether = Math.min(1, s.tether + 0.004);
        }

        for (let i = shockwaves.length - 1; i >= 0; i--) {
            const wave = shockwaves[i];
            wave.radius += 7;
            wave.energy *= 0.94;
            if (wave.energy < 0.02) shockwaves.splice(i, 1);
        }

        for (let i = sparks.length - 1; i >= 0; i--) {
            const p = sparks[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vx *= p.drag || 0.96;
            p.vy *= p.drag || 0.96;
            p.life -= p.decay;
            if (p.life <= 0) sparks.splice(i, 1);
        }

        if (!shootingStar && now > nextShootingStar && !leaving) {
            const fromLeft = Math.random() < 0.5;
            shootingStar = {
                x: fromLeft ? -40 : width * (0.3 + Math.random() * 0.7),
                y: Math.random() * horizonY * 0.45,
                vx: (fromLeft ? 1 : -1) * (6 + Math.random() * 4),
                vy: 2.5 + Math.random() * 2,
                life: 1,
            };
            nextShootingStar = now + 7000 + Math.random() * 10000;
            if (sound) sound.meteor(panOf(shootingStar.x), panOf(shootingStar.x + shootingStar.vx * 90), 1.4);
        }
        if (shootingStar) {
            const s = shootingStar;
            s.x += s.vx;
            s.y += s.vy;
            s.life -= 0.01;
            if (s.life <= 0 || s.y > horizonY) shootingStar = null;
        }
    }

    // ------------------------------------------------------------------ drawing

    function auroraIntensity(t) {
        // Some nights are quiet, some are wild: a fixed level per night, breathing
        // slowly, with an occasional substorm surge
        const night = Math.floor(skyNow() / 86400000 + 0.5);
        const base = 0.35 + 0.5 * S.rng(night * 7919)();
        const breath = 0.75 + 0.25 * S.noise(t * 0.02, 3.3);
        const substorm = 0.6 * smoothstep(0.35, 0.8, S.noise(t * 0.012, 8.8));
        const daylight = 1 - 0.55 * smoothstep(-12, 6, sunAlt);
        return (base * breath + substorm) * daylight;
    }

    function drawMoon() {
        if (!moon || !moon.onScreen) return;
        const r = Math.max(8, height * 0.016);
        const x = moon.x;
        const y = moon.y;
        const low = 1 - smoothstep(2, 14, moon.alt);
        const lit = `rgb(${Math.round(lerp(236, 255, low))}, ${Math.round(lerp(238, 196, low))}, ${Math.round(lerp(242, 150, low))})`;
        ctx.globalAlpha = 0.25 + 0.45 * moon.illum;
        ctx.drawImage(glowWhite, x - r * 7, y - r * 7, r * 14, r * 14);
        ctx.globalAlpha = 1;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(moon.angle);
        ctx.fillStyle = '#161b23';
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(140, 158, 190, 0.14)'; // earthshine
        ctx.fill();
        // Lit part: the sunward half-disc closed by the terminator's half-ellipse
        const xt = r * (1 - 2 * moon.illum);
        ctx.beginPath();
        ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false);
        ctx.ellipse(0, 0, Math.abs(xt), r, 0, Math.PI / 2, -Math.PI / 2, xt > 0);
        ctx.fillStyle = lit;
        ctx.fill();
        ctx.clip();
        ctx.fillStyle = 'rgba(90, 100, 120, 0.22)'; // maria
        for (const [mx, my, mr] of [[-0.3, -0.25, 0.28], [0.15, -0.35, 0.2], [0.25, 0.1, 0.24], [-0.2, 0.3, 0.18], [-0.45, 0.05, 0.14]]) {
            ctx.beginPath();
            ctx.arc(mx * r, my * r, mr * r, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    // Page content (name, links, key) that sky labels must not cover; measured in screen space
    let contentRects = [];
    function measureContent() {
        contentRects = [...document.querySelectorAll('h1, nav a, pre, .pgp-link a')].map((el) => {
            const r = el.getBoundingClientRect();
            return { l: r.left - 14, t: r.top - 10, r: r.right + 14, b: r.bottom + 10 };
        });
    }

    // First candidate baseline y whose label box stays clear of content and above the horizon
    function placeLabel(x, candidates, main, sub) {
        const o = offset(DEPTH.stars);
        const half = Math.max(main.length * 6.5, sub.length * 4.5) + 8;
        for (const y of candidates) {
            const box = { l: x + o.x - half, r: x + o.x + half, t: y + o.y - 12, b: y + o.y + (sub ? 20 : 6) };
            if (box.t < 8 || box.b > horizonY - 16) continue;
            if (!contentRects.some((c) => box.l < c.r && box.r > c.l && box.t < c.b && box.b > c.t)) return y;
        }
        return null;
    }

    function drawLabel(x, y, main, sub, alpha) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.textAlign = 'center';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
        ctx.shadowBlur = 6;
        if ('letterSpacing' in ctx) ctx.letterSpacing = '3px';
        ctx.font = '600 11px Orbitron, sans-serif';
        ctx.fillStyle = 'rgba(238, 238, 238, 0.9)';
        ctx.fillText(main.toUpperCase(), x, y);
        if (sub) {
            if ('letterSpacing' in ctx) ctx.letterSpacing = '1px';
            ctx.font = '400 10px Orbitron, sans-serif';
            ctx.fillStyle = `rgba(${GOLD}, 0.75)`;
            ctx.fillText(sub, x, y + 15);
        }
        ctx.restore();
    }

    function drawConstellations(now, local) {
        const hovered = local && !dragged && !blackHole ? constellationNear(local.x, local.y, 34) : null;
        if (tap && now > tap.until) tap = null;

        // Idle sky tour: now and then, the sky points out one of its constellations
        const idle = now - pointer.lastMove > 6000 && !hovered;
        if (!intro && !leaving && idle && !tour.target && now > tour.next) {
            const candidates = constellations.filter((c) => FAMOUS.includes(c.id) && c.onFrac > 0.85 && c !== tour.last);
            if (candidates.length) {
                const uma = tour.first && candidates.find((c) => c.id === 'UMa');
                tour.target = uma || candidates[Math.floor(Math.random() * candidates.length)];
                tour.first = false;
                tour.until = now + 5500;
            }
            tour.next = now + 12000 + Math.random() * 8000;
        }
        if (tour.target && (now > tour.until || !idle)) {
            tour.last = tour.target;
            tour.target = null;
        }

        for (const c of constellations) {
            const want = c.onFrac >= 0.6 && (c === hovered || c === tour.target || (tap && tap.c === c));
            if (want) {
                c.alpha = Math.min(1, c.alpha + 0.06);
                c.progress = Math.min(1, c.progress + 0.016);
                if (!c.sounded && sound) {
                    // One soft chord per reveal; the idle tour plays it quieter
                    c.sounded = true;
                    const lead = c.members.find((s) => s.on) || c.members[0];
                    sound.reveal(panOf(lead.x), c === tour.target);
                }
            } else {
                c.alpha = Math.max(0, c.alpha - 0.025);
                if (c.alpha === 0) {
                    c.progress = 0;
                    c.drawn = 0;
                    c.sounded = false;
                }
            }
            if (c.alpha <= 0) continue;

            const total = c.edges.length * ease.inOutCubic(c.progress);
            const full = Math.floor(total);
            if (want && full > c.drawn) {
                c.drawn = full;
            }
            ctx.strokeStyle = `rgba(${CYAN}, ${0.6 * c.alpha})`;
            ctx.lineWidth = 1.1;
            ctx.beginPath();
            for (let i = 0; i < Math.min(c.edges.length, full + 1); i++) {
                const [a, b] = c.edges[i];
                if (!a.on || !b.on || a.hidden || b.hidden) continue;
                const f = i < full ? 1 : total - full;
                if (f <= 0) continue;
                ctx.moveTo(a.x, a.y);
                ctx.lineTo(lerp(a.x, b.x, f), lerp(a.y, b.y, f));
            }
            ctx.stroke();

            let sx = 0;
            let sy = 0;
            let minY = Infinity;
            let maxY = -Infinity;
            let n = 0;
            ctx.strokeStyle = `rgba(${CYAN}, ${0.35 * c.alpha})`;
            ctx.beginPath();
            for (const s of c.members) {
                if (!s.on || s.hidden) continue;
                sx += s.x;
                sy += s.y;
                minY = Math.min(minY, s.y);
                maxY = Math.max(maxY, s.y);
                n++;
                ctx.moveTo(s.x + s.r + 4, s.y);
                ctx.arc(s.x, s.y, s.r + 4, 0, Math.PI * 2);
            }
            ctx.stroke();
            const sub = c.no !== c.la ? c.no : '';
            const labelY = n ? placeLabel(sx / n, [maxY + 26, minY - 24, sy / n, sy / n - 45, sy / n + 45], c.la, sub) : null;
            if (labelY !== null) drawLabel(sx / n, labelY, c.la, sub, c.alpha * smoothstep(0.2, 0.7, c.progress));
        }
    }

    function drawHoverLabel(local) {
        if (!local || dragged || blackHole) return;
        if (moon && moon.onScreen && Math.hypot(local.x - moon.x, local.y - moon.y) < Math.max(8, height * 0.016) + 12) {
            const r = Math.max(8, height * 0.016);
            const sub = `Månen · ${Math.round(moon.illum * 100)} %`;
            const y = placeLabel(moon.x, [moon.y - r - 16, moon.y + r + 22], 'Moon', sub);
            if (y !== null) drawLabel(moon.x, y, 'Moon', sub, 0.95);
            return;
        }
        const s = nearestStar(local.x, local.y, 22, (st) => st.name && st.alt > 0);
        if (!s) return;
        ctx.strokeStyle = `rgba(${GOLD}, 0.7)`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r + 6, 0, Math.PI * 2);
        ctx.stroke();
        const sub = s.planet ? 'planet' : '';
        const y = placeLabel(s.x, [s.y - s.r - 14, s.y + s.r + 22], s.name, sub);
        if (y !== null) drawLabel(s.x, y, s.name, sub, 0.95);
    }

    function drawStars(now, introT) {
        const allGold = now < goldUntil;
        const t = now / 1000;
        const leaveT = leaving ? (now - leaving.start) / 1000 : 0;
        for (const s of visible) {
            if (s.hidden) continue;
            let x = s.x;
            let y = s.y;
            let a = s.alpha * s.ext;
            let streak = 0;
            let px = x;
            let py = y;

            if (intro && introT < T.starsFrom + T.starsSpan + T.starDur) {
                // Hyperspace arrival: every star decelerates from the vanishing point to its home
                const e = ease.outExpo(clamp((introT - s.introDelay) / T.starDur));
                if (e <= 0) continue;
                const vx = width / 2;
                const vy = height * 0.45;
                x = lerp(vx, s.hx, e);
                y = lerp(vy, s.hy, e);
                const prev = ease.outExpo(clamp((introT - s.introDelay - 0.06) / T.starDur));
                px = lerp(vx, s.hx, prev);
                py = lerp(vy, s.hy, prev);
                streak = 1;
                a *= Math.min(1, e * 1.5);
                s.x = x;
                s.y = y;
            } else if (leaving) {
                px = x - s.vx * 2.5;
                py = y - s.vy * 2.5;
                streak = 1;
                a *= 1 - smoothstep(0.45, 0.7, leaveT);
            } else if (!s.planet && !reduceMotion) {
                const scint = 0.14 + 0.4 * (1 - s.ext);
                a *= 1 - scint * (0.5 + 0.5 * Math.sin(s.phase + t * s.speed * (1 + 2 * (1 - s.ext))));
            }
            if (a < 0.02) continue;

            const color = allGold ? GOLD_CSS : s.css;
            if (streak && Math.hypot(x - px, y - py) > 1.5) {
                ctx.globalAlpha = a;
                ctx.strokeStyle = color;
                ctx.lineWidth = Math.max(0.8, s.r);
                ctx.beginPath();
                ctx.moveTo(px, py);
                ctx.lineTo(x, y);
                ctx.stroke();
                continue;
            }
            if (s.r > 1.5) {
                const g = s.r * (s.planet ? 5 : 6);
                ctx.globalAlpha = a * 0.6;
                ctx.drawImage(allGold ? glowGold : glowWhite, x - g, y - g, g * 2, g * 2);
                if (s.mag < 0.5 && !s.planet) {
                    // Faint diffraction spikes on the very brightest stars
                    ctx.globalAlpha = a * 0.22;
                    ctx.strokeStyle = color;
                    ctx.lineWidth = 0.7;
                    ctx.beginPath();
                    ctx.moveTo(x - s.r * 7, y);
                    ctx.lineTo(x + s.r * 7, y);
                    ctx.moveTo(x, y - s.r * 7);
                    ctx.lineTo(x, y + s.r * 7);
                    ctx.stroke();
                }
            }
            ctx.globalAlpha = a;
            ctx.fillStyle = color;
            if (s.r < 1.1) {
                ctx.fillRect(x - s.r, y - s.r, s.r * 2, s.r * 2);
            } else {
                ctx.beginPath();
                ctx.arc(x, y, s.r, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.globalAlpha = 1;
    }

    function drawPointer(local) {
        if (!local || blackHole || leaving || pointer.type === 'touch') return;
        const glow = ctx.createRadialGradient(local.x, local.y, 0, local.x, local.y, 140);
        glow.addColorStop(0, `rgba(${CYAN}, 0.08)`);
        glow.addColorStop(1, `rgba(${CYAN}, 0)`);
        ctx.fillStyle = glow;
        ctx.fillRect(local.x - 140, local.y - 140, 280, 280);
        ctx.lineWidth = 1;
        for (const s of visible) {
            if (s.hidden || s.mag > 4.3) continue;
            const d = Math.hypot(s.x - local.x, s.y - local.y);
            if (d < POINTER_DIST) {
                ctx.strokeStyle = `rgba(${CYAN}, ${0.32 * (1 - d / POINTER_DIST) * s.ext})`;
                ctx.beginPath();
                ctx.moveTo(s.x, s.y);
                ctx.lineTo(local.x, local.y);
                ctx.stroke();
            }
        }
    }

    function drawBlackHole(skyOffset, now) {
        const bh = blackHole;
        if (!bh) return;
        const m = Math.min(1, bh.mass);
        const core = holeCore(bh);
        const lens = core * 5;
        const t = now / 1000;

        // Gravitational lensing: the backdrop is magnified and swirled in soft rings
        if (!skyDirty) {
            const sx = -SKY_PAD + skyOffset.x;
            const sy = -SKY_PAD + skyOffset.y;
            for (let i = 0; i < 4; i++) {
                const outer = lens * (1 - i * 0.2);
                const zoom = 1 + m * (0.04 + i * i * 0.09);
                ctx.save();
                ctx.beginPath();
                ctx.arc(bh.x, bh.y, outer, 0, Math.PI * 2);
                ctx.clip();
                ctx.translate(bh.x, bh.y);
                ctx.scale(zoom, zoom);
                ctx.rotate(bh.spin * 0.03 * (i + 1));
                ctx.translate(-bh.x, -bh.y);
                ctx.drawImage(skyLayer, sx, sy, width + 2 * SKY_PAD, height + 2 * SKY_PAD);
                ctx.restore();
            }
        }

        const visibility = Math.min(1, bh.mass * 1.6);
        // Particles are batched into heat × brightness buckets: one stroke per bucket
        // instead of one per particle keeps hundreds of them cheap
        const drawParticles = (front) => {
            const buckets = new Map();
            const add = (heatLevel, a, x0, y0, x1, y1) => {
                const alphaLevel = Math.min(ALPHA_LEVELS - 1, Math.floor(a * ALPHA_LEVELS));
                if (alphaLevel <= 0 && a < 0.06) return;
                const key = heatLevel * ALPHA_LEVELS + alphaLevel;
                let path = buckets.get(key);
                if (!path) buckets.set(key, (path = new Path2D()));
                path.moveTo(x0, y0);
                path.lineTo(x1, y1);
            };
            for (const p of bh.disk) {
                if (front !== Math.sin(p.theta) >= 0) continue;
                const heat = clamp(1 - (p.r - core * 1.1) / (core * 4.5));
                const heatLevel = Math.round(heat * (HEAT_LEVELS - 1));
                // Doppler beaming: the side swinging toward us is brighter
                const beaming = 0.65 + 0.35 * Math.cos(p.theta);
                const a = visibility * p.life * (0.3 + 0.7 * heat) * beaming;
                const [x, y] = diskPoint(bh, p.r, p.theta);
                const [px, py] = diskPoint(bh, p.pr, p.ptheta);
                add(heatLevel, a, x - (x - px) * 4, y - (y - py) * 4, x, y); // motion streak
                if (!front) {
                    // The far side reappears, bent over the top and faintly under the bottom
                    for (const below of [false, true]) {
                        const [lx, ly] = lensedPoint(bh, p.r, p.theta, below);
                        const [plx, ply] = lensedPoint(bh, p.pr, p.ptheta, below);
                        add(heatLevel, a * (below ? 0.25 : 0.6), lx - (lx - plx) * 4, ly - (ly - ply) * 4, lx, ly);
                    }
                }
            }
            for (const [key, path] of buckets) {
                const heatLevel = Math.floor(key / ALPHA_LEVELS);
                ctx.globalAlpha = ((key % ALPHA_LEVELS) + 0.5) / ALPHA_LEVELS;
                ctx.strokeStyle = HEAT_CSS[heatLevel];
                ctx.lineWidth = 0.9 + heatLevel * 0.15;
                ctx.stroke(path);
            }
            ctx.globalAlpha = 1;
        };

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        // One soft glow for the whole disk instead of a sprite per particle
        ctx.save();
        ctx.translate(bh.x, bh.y);
        ctx.rotate(DISK_ROT);
        ctx.scale(1, DISK_TILT * 1.8);
        const glow = ctx.createRadialGradient(0, 0, core, 0, 0, core * 6.5);
        glow.addColorStop(0, `rgba(${GOLD}, ${0.22 * visibility})`);
        glow.addColorStop(0.4, `rgba(${CYAN}, ${0.07 * visibility})`);
        glow.addColorStop(1, `rgba(${CYAN}, 0)`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(0, 0, core * 6.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        drawParticles(false);
        ctx.restore();

        // The shadow, with a soft edge rather than a hard disc
        const shadow = ctx.createRadialGradient(bh.x, bh.y, 0, bh.x, bh.y, core * 1.35);
        shadow.addColorStop(0, `rgba(0, 0, 0, ${visibility})`);
        shadow.addColorStop(0.7, `rgba(0, 0, 0, ${visibility})`);
        shadow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = shadow;
        ctx.beginPath();
        ctx.arc(bh.x, bh.y, core * 1.35, 0, Math.PI * 2);
        ctx.fill();

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        // Photon ring: a thin, flickering band of light hugging the shadow
        const flicker = 0.8 + 0.2 * S.noise(t * 2.2, 5.5);
        const ring = ctx.createRadialGradient(bh.x, bh.y, core * 0.9, bh.x, bh.y, core * 1.3);
        ring.addColorStop(0, `rgba(${GOLD}, 0)`);
        ring.addColorStop(0.35, `rgba(255, 244, 222, ${0.5 * visibility * flicker})`);
        ring.addColorStop(0.6, `rgba(${GOLD}, ${0.25 * visibility * flicker})`);
        ring.addColorStop(1, `rgba(${GOLD}, 0)`);
        ctx.fillStyle = ring;
        ctx.beginPath();
        ctx.arc(bh.x, bh.y, core * 1.3, 0, Math.PI * 2);
        ctx.fill();
        drawParticles(true);

        // Birth: a faint ring collapsing inward as the hole forms
        if (bh.implode > 0) {
            ctx.strokeStyle = `rgba(${CYAN}, ${0.5 * bh.implode})`;
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.arc(bh.x, bh.y, core + 170 * bh.implode * bh.implode, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.restore();
    }

    function drawEffects(now) {
        if (dragged) {
            ctx.strokeStyle = `rgba(${CYAN}, 0.8)`;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(dragged.x, dragged.y, dragged.r + 5, 0, Math.PI * 2);
            ctx.stroke();
        }

        if (shootingStar) {
            const s = shootingStar;
            const tail = 14;
            const trail = ctx.createLinearGradient(s.x, s.y, s.x - s.vx * tail, s.y - s.vy * tail);
            trail.addColorStop(0, `rgba(255, 255, 255, ${0.95 * s.life})`);
            trail.addColorStop(0.3, `rgba(${CYAN}, ${0.4 * s.life})`);
            trail.addColorStop(1, `rgba(${CYAN}, 0)`);
            ctx.strokeStyle = trail;
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            ctx.moveTo(s.x, s.y);
            ctx.lineTo(s.x - s.vx * tail, s.y - s.vy * tail);
            ctx.stroke();
            ctx.globalAlpha = s.life;
            ctx.drawImage(glowWhite, s.x - 10, s.y - 10, 20, 20);
            ctx.globalAlpha = 1;
        }

        for (const wave of shockwaves) {
            ctx.strokeStyle = `rgba(${wave.gold ? GOLD : CYAN}, ${wave.energy * 0.5})`;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(wave.x, wave.y, wave.radius, 0, Math.PI * 2);
            ctx.stroke();
        }

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineWidth = 1.4;
        // Short streaks along the motion read as glowing embers; batched per colour and fade level
        const embers = new Map();
        for (const p of sparks) {
            // Stardust fades softly and twinkles like the stars around it
            const life = Math.max(0, p.life);
            const a = p.dust ? Math.pow(life, 1.6) * (0.7 + 0.3 * Math.sin(p.phase + now * 0.005)) : life;
            const key = `${p.color}|${Math.ceil(a * 5)}`;
            let path = embers.get(key);
            if (!path) embers.set(key, (path = new Path2D()));
            const speed = Math.hypot(p.vx, p.vy) || 1;
            // Never shorter than an ember; stardust keeps only a short tail and settles into a dot
            const tail = p.dust ? Math.min(5, Math.max(1.2, speed * 1.5)) / speed : Math.max(2, speed * 2) / speed;
            path.moveTo(p.x - p.vx * tail, p.y - p.vy * tail);
            path.lineTo(p.x, p.y);
        }
        for (const [key, path] of embers) {
            const [color, level] = key.split('|');
            ctx.globalAlpha = Number(level) / 5;
            ctx.strokeStyle = `rgb(${color})`;
            ctx.stroke(path);
        }
        ctx.restore();

        for (let i = wishes.length - 1; i >= 0; i--) {
            const w = wishes[i];
            const age = (now - w.born) / 2400;
            if (age >= 1) {
                wishes.splice(i, 1);
                continue;
            }
            ctx.save();
            ctx.globalAlpha = Math.sin(age * Math.PI);
            ctx.font = '600 12px Orbitron, sans-serif';
            ctx.textAlign = 'center';
            if ('letterSpacing' in ctx) ctx.letterSpacing = '2px';
            ctx.fillStyle = GOLD_CSS;
            ctx.shadowColor = `rgba(${GOLD}, 0.8)`;
            ctx.shadowBlur = 10;
            ctx.fillText('wish granted ✦', w.x, w.y - 20 - age * 30);
            ctx.restore();
        }
    }

    function drawIntroOverlay(now, ti) {
        // Hyperspace streaks rushing past
        if (ti < T.warpEnd) {
            const speed = 0.045 * Math.pow(1 - ti / T.warpEnd, 2);
            const f = Math.min(width, height) * 0.4;
            const vx = width / 2;
            const vy = height * 0.45;
            // One cool starlight tone; each streak keeps its own brightness and fades along its tail
            const fade = 1 - ti / T.warpEnd;
            ctx.strokeStyle = 'rgb(205, 220, 245)';
            ctx.lineWidth = 0.9;
            for (const p of intro.warp) {
                p.z -= speed;
                if (p.z <= 0.02) {
                    if (ti > T.warpEnd * 0.6) continue;
                    p.z += 1;
                }
                const x1 = vx + (p.x / p.z) * f;
                const y1 = vy + (p.y / p.z) * f;
                const zMid = p.z + speed * 3 + 0.001;
                const zTail = p.z + speed * 9 + 0.002;
                const xm = vx + (p.x / zMid) * f;
                const ym = vy + (p.y / zMid) * f;
                const a = clamp(1 - p.z) * fade * p.tone;
                ctx.globalAlpha = a * 0.3;
                ctx.beginPath();
                ctx.moveTo(vx + (p.x / zTail) * f, vy + (p.y / zTail) * f);
                ctx.lineTo(xm, ym);
                ctx.stroke();
                ctx.globalAlpha = a;
                ctx.beginPath();
                ctx.moveTo(xm, ym);
                ctx.lineTo(x1, y1);
                ctx.stroke();
            }
            ctx.globalAlpha = 1;
        }

        // The name condenses out of the stars
        if (!intro.name && ti > T.nameStart - 0.05 && (intro.fontReady || ti > T.nameStart + 0.4)) intro.name = prepareName();
        if (intro.name && intro.name.length) {
            const fadeOut = 1 - smoothstep(T.reveal, T.reveal + 0.45, ti);
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            for (const p of intro.name) {
                const e = ease.inOutCubic(clamp((ti - T.nameStart - p.delay) / p.dur));
                if (e <= 0) continue;
                const u = 1 - e;
                const x = u * u * p.sx + 2 * u * e * p.qx + e * e * p.tx;
                const y = u * u * p.sy + 2 * u * e * p.qy + e * e * p.ty;
                ctx.globalAlpha = (0.2 + 0.6 * e) * fadeOut;
                ctx.fillStyle = '#dfe8f5'; // starlight, not a new colour
                ctx.fillRect(x - 0.7, y - 0.7, 1.4, 1.4);
            }
            ctx.restore();
        }

        if (!intro.revealed && ti >= T.reveal) {
            intro.revealed = true;
            root.classList.add('arrived');
            const h1 = document.querySelector('h1');
            if (h1) {
                const r = h1.getBoundingClientRect();
                const o = offset(DEPTH.stars);
                shockwaves.push({ x: r.left + r.width / 2 - o.x, y: r.top + r.height / 2 - o.y, radius: 0, energy: 0.7 });
            }
            if (sound) sound.arrive();
        }
        if (ti >= T.end) {
            intro = null;
            if (navigator.webdriver) goldUntil = performance.now() + 8000;
        }
    }

    function frame(now) {
        const t = now / 1000;
        const ti = introTime(now);
        const leaveT = leaving ? (now - leaving.start) / 1000 : 0;
        const skyOff = offset(DEPTH.sky);
        const auroraOff = offset(DEPTH.aurora);
        const starOff = offset(DEPTH.stars);
        const farOff = offset(DEPTH.far);
        const nearOff = offset(DEPTH.near);

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#0d1016';
        ctx.fillRect(0, 0, width, height);

        const skyAlpha = (intro ? smoothstep(T.sky[0], T.sky[1], ti) : 1) * (1 - smoothstep(0.2, 0.7, leaveT));
        if (skyAlpha > 0) {
            ctx.globalAlpha = skyAlpha;
            ctx.drawImage(skyLayer, -SKY_PAD + skyOff.x, -SKY_PAD + skyOff.y, width + 2 * SKY_PAD, height + 2 * SKY_PAD);
            ctx.globalAlpha = 1;
        }

        if (sound && now - auroraSoundAt > 500) {
            // The aurora's faint hiss follows its brightness
            auroraSoundAt = now;
            sound.aurora(auroraIntensity(t));
        }
        aurora.draw(ctx, reduceMotion ? 40 : t, {
            intensity: auroraIntensity(reduceMotion ? 40 : t),
            pointer: pointer.x !== null && !reduceMotion ? { x: pointer.x - auroraOff.x, y: pointer.y - auroraOff.y } : null,
            flare,
            offsetX: auroraOff.x,
            offsetY: auroraOff.y,
            alpha: (intro ? smoothstep(T.aurora[0], T.aurora[1], ti) : 1) * (1 - smoothstep(0, 0.5, leaveT)),
        });

        const local = intro || leaving ? null : localPointer();
        ctx.save();
        ctx.translate(starOff.x, starOff.y);
        if (!intro && !leaving) drawConstellations(now, local);
        if (!intro) drawPointer(local);
        drawStars(now, ti);
        if (!intro && !leaving) drawMoon();
        drawBlackHole({ x: skyOff.x - starOff.x, y: skyOff.y - starOff.y }, now);
        drawEffects(now);
        if (!intro && !leaving) drawHoverLabel(local);
        ctx.restore();

        const u = hills.unit;
        const rise = (intro ? (1 - ease.outCubic(smoothstep(T.hills[0], T.hills[1], ti))) * u * 3 : 0) + leaveT * leaveT * u * 6;
        hills.draw(ctx, t, {
            farX: farOff.x,
            farY: farOff.y,
            nearX: nearOff.x,
            nearY: nearOff.y,
            rise,
            aurora: auroraIntensity(t) * (intro ? smoothstep(T.aurora[0], T.aurora[1], ti) : 1),
            gold: Math.max(0, flare - 0.2),
        });

        if (intro) drawIntroOverlay(now, ti);
    }

    function drawStatic() {
        if (skyDirty) renderSkyLayer();
        frame(performance.now());
    }

    let last = performance.now();
    let acc = 0;
    function loop(now) {
        acc += Math.min(100, now - last);
        last = now;
        let steps = 0;
        while (acc >= STEP_MS && steps < 4) {
            step(now);
            acc -= STEP_MS;
            steps++;
        }
        if (steps === 4) acc = 0;
        if (now - lastProjection > 15000) reproject(false);
        if (skyDirty) renderSkyLayer();
        frame(now);
        requestAnimationFrame(loop);
    }

    // ------------------------------------------------------------------ HUD & controls

    function buildHud() {
        const hud = document.createElement('div');
        hud.className = 'sky-hud';
        hud.title = 'Real stars, Moon and planets, computed live';
        const title = document.createElement('span');
        title.className = 'sky-hud-title';
        title.textContent = 'Live sky';
        const data = document.createElement('span');
        data.className = 'sky-hud-data';
        hud.append(title, data);
        document.body.appendChild(hud);
        const clock = new Intl.DateTimeFormat('nb-NO', {
            hour: '2-digit',
            minute: '2-digit',
            ...(reduceMotion ? {} : { second: '2-digit' }),
        });
        const update = () => {
            data.textContent = clock.format(new Date(skyNow()));
        };
        update();
        setInterval(update, reduceMotion ? 30000 : 1000);
    }

    function buildSoundToggle() {
        if (!sound) return;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'sound-toggle';
        btn.setAttribute('aria-label', 'Sound');
        btn.setAttribute('aria-pressed', String(sound.remembered));
        btn.innerHTML =
            '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
            '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" stroke="none"/>' +
            '<path class="waves" d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>' +
            '<path class="mute" d="M16 9.5l5 5M21 9.5l-5 5"/></svg>';
        btn.addEventListener('click', () => sound.toggle());
        sound.onChange((on) => btn.setAttribute('aria-pressed', String(on)));
        document.body.appendChild(btn);
    }

    // ------------------------------------------------------------------ wiring

    window.addEventListener('resize', resize);
    resize();
    buildHud();
    if (document.fonts && document.fonts.ready) {
        // The compass marks are baked into the hills; redraw them in Orbitron once it loads
        document.fonts.ready.then(() => {
            hills.resize(width, height, horizonY, dpr);
            measureContent();
            if (reduceMotion) drawStatic();
        });
    }

    if (reduceMotion) {
        root.classList.add('arrived');
        setInterval(() => {
            reproject(true);
            drawStatic();
        }, 60000);
        return;
    }

    buildSoundToggle();
    if (!intro) goldUntil = navigator.webdriver ? performance.now() + 8000 : 0;
    if (navigator.webdriver) {
        console.log(
            '%cnavigator.webdriver === true — welcome, fellow automation. The stars turn gold in your honor.',
            'color:#FFD369; font-family:monospace'
        );
    }

    const onInteractive = (e) => e.target instanceof Element && e.target.closest('a, h1, button, .sky-hud');

    window.addEventListener('pointermove', (e) => {
        pointer.x = e.clientX;
        pointer.y = e.clientY;
        pointer.type = e.pointerType;
        pointer.lastMove = performance.now();
        if (e.pointerType === 'mouse') {
            parallax.tx = (e.clientX / width - 0.5) * 2;
            parallax.ty = (e.clientY / height - 0.5) * 2;
        }
        if (pointer.down && Math.hypot(e.clientX - pointer.downX, e.clientY - pointer.downY) > 14 && !blackHole) {
            pointer.down = false; // a drag, not a hold
        }
        if (!dragged && !onInteractive(e) && !intro) {
            const local = localPointer();
            document.body.style.cursor = blackHole ? 'none' : nearestStar(local.x, local.y, GRAB_DIST, grabbable) ? 'grab' : '';
        }
    });
    window.addEventListener('pointerleave', () => {
        pointer.x = null;
        pointer.y = null;
    });
    document.addEventListener('mouseleave', () => {
        pointer.x = null;
        pointer.y = null;
    });
    window.addEventListener('pointerdown', (e) => {
        if (intro) {
            finishIntro();
            return;
        }
        if (onInteractive(e) || leaving) return;
        pointer.x = e.clientX;
        pointer.y = e.clientY;
        pointer.type = e.pointerType;
        pointer.lastMove = performance.now();
        const local = localPointer();

        if (shootingStar && Math.hypot(shootingStar.x - local.x, shootingStar.y - local.y) < 60) {
            makeWish(shootingStar.x, shootingStar.y);
            return;
        }
        const grabbed = nearestStar(local.x, local.y, GRAB_DIST, grabbable);
        if (grabbed) {
            dragged = grabbed;
            grabbed.tether = 0;
            document.body.style.cursor = 'grabbing';
            if (sound) sound.glideStart(panOf(grabbed.x));
            return;
        }
        shockwaves.push({ x: local.x, y: local.y, radius: 0, energy: 1 });
        if (sound) sound.pulse(panOf(local.x));
        pointer.down = true;
        pointer.downAt = performance.now();
        pointer.downX = e.clientX;
        pointer.downY = e.clientY;
        if (e.pointerType !== 'mouse') {
            const c = constellationNear(local.x, local.y, 50);
            if (c) tap = { c, until: performance.now() + 5000 };
        }
    });
    const release = (e) => {
        pointer.down = false;
        if (blackHole) collapse();
        if (dragged) {
            const speed = Math.hypot(dragged.vx, dragged.vy);
            const maxFling = 16;
            if (speed > maxFling) {
                dragged.vx *= maxFling / speed;
                dragged.vy *= maxFling / speed;
            }
            dragged.tether = 0;
            dragged = null;
            if (sound) sound.glideEnd();
        }
        document.body.style.cursor = '';
        if (e && e.pointerType === 'touch') {
            pointer.x = null;
            pointer.y = null;
        }
    };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    window.addEventListener('contextmenu', (e) => {
        if (blackHole || pointer.down) e.preventDefault();
    });
    // Real phones turn a long press into text selection, a callout or a cancelled pointer,
    // which would kill the black hole. Claim single-finger touches on the sky itself; links,
    // buttons, the name (tap to glitch) and the PGP key (pinch to zoom) keep native behaviour.
    document.addEventListener('touchstart', (e) => {
        const native = e.target instanceof Element && e.target.closest('a, button, h1, pre, .sky-hud');
        if (e.touches.length === 1 && !native) e.preventDefault();
    }, { passive: false });
    window.addEventListener('keydown', () => intro && finishIntro());

    // Phones tilt the scene instead of a mouse (where orientation needs no permission prompt)
    if (window.matchMedia('(pointer: coarse)').matches) {
        window.addEventListener('deviceorientation', (e) => {
            if (e.gamma === null || e.beta === null) return;
            parallax.tx = clamp(e.gamma / 25, -1, 1);
            parallax.ty = clamp((e.beta - 50) / 25, -1, 1);
        });
    }

    const title = document.querySelector('h1');
    if (title) {
        let titleClicks = 0;
        title.addEventListener('click', () => {
            if (intro) return;
            title.classList.remove('glitch');
            void title.offsetWidth; // restart the animation
            title.classList.add('glitch');
            if (sound) sound.shimmer(0, 0.4);
            if (++titleClicks >= 5) {
                titleClicks = 0;
                supernova(title);
            }
        });
    }

    // Same-site links leave through hyperspace; the next page arrives the same way
    document.addEventListener('click', (e) => {
        const link = e.target instanceof Element && e.target.closest('a[href]');
        if (!link || leaving || e.defaultPrevented) return;
        if (link.target === '_blank' || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        const url = new URL(link.href, window.location.href);
        if (url.origin !== window.location.origin || url.href === window.location.href) return;
        e.preventDefault();
        startLeaving(url.href);
    });
    window.addEventListener('pageshow', (e) => {
        if (!e.persisted) return;
        // Restored from the back/forward cache mid-warp: put the sky back together
        leaving = null;
        root.classList.remove('leaving');
        reproject(true);
    });
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) last = performance.now();
    });

    requestAnimationFrame(loop);
})();
