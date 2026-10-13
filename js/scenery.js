// Scenery for the starfield: the sky backdrop (gradient, twilight, Milky Way, faint field
// stars), the aurora, and layered hills with drifting valley mist along the horizon.
// Everything is generated from a fixed seed, so the scenery is identical on every visit.
(() => {
    const H = (window.Hind = window.Hind || {});
    const RAD = Math.PI / 180;

    const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
    const lerp = (a, b, t) => a + (b - a) * t;
    const smoothstep = (a, b, v) => {
        const t = clamp((v - a) / (b - a));
        return t * t * (3 - 2 * t);
    };
    const mixRgb = (a, b, t) => a.map((v, i) => Math.round(lerp(v, b[i], t)));
    const rgb = (c, alpha = 1) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${alpha})`;

    // Mulberry32: tiny seeded PRNG
    function rng(seed) {
        return () => {
            seed = (seed + 0x6d2b79f5) | 0;
            let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    // 2D Perlin noise, roughly in [-1, 1]
    const perm = new Uint8Array(512);
    {
        const r = rng(1337);
        const p = [...Array(256).keys()];
        for (let i = 255; i > 0; i--) {
            const j = Math.floor(r() * (i + 1));
            [p[i], p[j]] = [p[j], p[i]];
        }
        for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
    }
    const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
    function grad(h, x, y) {
        switch (h & 7) {
            case 0: return x + y;
            case 1: return -x + y;
            case 2: return x - y;
            case 3: return -x - y;
            case 4: return x;
            case 5: return -x;
            case 6: return y;
            default: return -y;
        }
    }
    function noise(x, y) {
        const xi = Math.floor(x);
        const yi = Math.floor(y);
        const X = xi & 255;
        const Y = yi & 255;
        const xf = x - xi;
        const yf = y - yi;
        const u = fade(xf);
        const v = fade(yf);
        const a = lerp(grad(perm[perm[X] + Y], xf, yf), grad(perm[perm[X + 1] + Y], xf - 1, yf), u);
        const b = lerp(grad(perm[perm[X] + Y + 1], xf, yf - 1), grad(perm[perm[X + 1] + Y + 1], xf - 1, yf - 1), u);
        return lerp(a, b, v);
    }

    // ---------------------------------------------------------------- sky backdrop

    function createMilkyWay(galacticToEquatorial) {
        const r = rng(2026);
        const gauss = () => Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());
        // Brighter toward the galactic centre, with clumpy star clouds along the band
        const weight = (l) => (0.45 + 0.55 * Math.pow((1 + Math.cos(l * RAD)) / 2, 1.5)) * (0.65 + 0.35 * noise(l * 0.09, 4.2));
        const place = (l, b, extra) => ({ ...galacticToEquatorial(l, b), ...extra });

        const clouds = [];
        for (let i = 0; i < 340; i++) {
            const l = r() * 360;
            const b = gauss() * 4.2 + 2.2 * noise(l * 0.05, 1.7);
            clouds.push(place(l, b, { size: 2.5 + r() * 5.5, a: 0.06 * weight(l), warm: r() < 0.3 }));
        }
        // Dark dust lanes, strongest along the Great Rift from Cygnus to Aquila
        const dust = [];
        for (let i = 0; i < 90; i++) {
            const l = i < 60 ? 15 + r() * 75 : r() * 360;
            const b = 1.4 + gauss() * (i < 60 ? 1.4 : 2.5);
            dust.push(place(l, b, { size: 1.2 + r() * 2.6, a: 0.22 + r() * 0.25 }));
        }
        const specks = [];
        for (let i = 0; i < 2600; i++) {
            const l = r() * 360;
            const b = gauss() * 6.5;
            specks.push(place(l, b, { size: 0.5 + r() * 0.7, a: (0.14 + r() * 0.42) * weight(l) }));
        }
        const field = [];
        for (let i = 0; i < 1600; i++) {
            field.push({ ra: r() * 360, dec: Math.asin(2 * r() - 1) / RAD, size: 0.4 + r() * 0.6, a: 0.07 + r() * 0.3 });
        }
        return { clouds, dust, specks, field };
    }

    // Paints everything that only changes as the Earth turns. `view.toScreen(ra, dec)`
    // returns { x, y, alt } in CSS pixels, or null when the point is out of view.
    function renderSky(canvas, mw, view) {
        const { w, h, dpr, pad, horizonY, pxPerDeg, sunAlt, sunX, moon } = view;
        canvas.width = Math.round((w + 2 * pad) * dpr);
        canvas.height = Math.round((h + 2 * pad) * dpr);
        const ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, pad * dpr, pad * dpr);

        const twilight = smoothstep(-18, -4, sunAlt);
        const day = smoothstep(-4, 10, sunAlt);
        const zenith = mixRgb(mixRgb([11, 15, 22], [22, 30, 50], twilight), [32, 46, 74], day);
        const middle = mixRgb(mixRgb([20, 26, 36], [38, 46, 72], twilight), [46, 64, 98], day);
        const horizon = mixRgb(mixRgb([40, 48, 62], [78, 74, 100], twilight), [72, 98, 138], day);
        const base = ctx.createLinearGradient(0, -pad, 0, horizonY);
        base.addColorStop(0, rgb(zenith));
        base.addColorStop(0.6, rgb(middle));
        base.addColorStop(1, rgb(horizon));
        ctx.fillStyle = base;
        ctx.fillRect(-pad, -pad, w + 2 * pad, h + 2 * pad);

        // Faint airglow hugging the horizon
        const dome = ctx.createRadialGradient(w / 2, horizonY + h * 0.1, 0, w / 2, horizonY + h * 0.1, Math.max(w, h) * 0.7);
        dome.addColorStop(0, 'rgba(150, 175, 210, 0.07)');
        dome.addColorStop(0.4, 'rgba(130, 160, 200, 0.03)');
        dome.addColorStop(1, 'rgba(130, 160, 200, 0)');
        ctx.fillStyle = dome;
        ctx.fillRect(-pad, -pad, w + 2 * pad, h + 2 * pad);

        // Twilight glow where the Sun hides below the horizon (in summer it creeps around the north)
        const glow = smoothstep(-20, -6, sunAlt) * (1 - smoothstep(4, 20, sunAlt));
        if (glow > 0.01) {
            const radius = w * 0.75;
            const g = ctx.createRadialGradient(sunX, horizonY, 0, sunX, horizonY, radius);
            g.addColorStop(0, `rgba(255, 150, 90, ${0.4 * glow})`);
            g.addColorStop(0.35, `rgba(220, 110, 120, ${0.16 * glow})`);
            g.addColorStop(1, 'rgba(120, 80, 140, 0)');
            ctx.fillStyle = g;
            ctx.fillRect(-pad, -pad, w + 2 * pad, h + 2 * pad);
        }

        const moonWash = moon && moon.alt > 0 ? moon.illum * smoothstep(0, 15, moon.alt) : 0;
        const visibility = (1 - 0.85 * Math.max(twilight * 0.75, day)) * (1 - 0.45 * moonWash);
        const extinction = (alt) => smoothstep(0, 12, alt);

        if (visibility > 0.02) {
            for (const c of mw.clouds) {
                const p = view.toScreen(c.ra, c.dec);
                if (!p) continue;
                const a = c.a * visibility * extinction(p.alt);
                if (a < 0.003) continue;
                const radius = c.size * pxPerDeg;
                const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
                const tint = c.warm ? '255, 232, 205' : '196, 210, 255';
                g.addColorStop(0, `rgba(${tint}, ${a})`);
                g.addColorStop(1, `rgba(${tint}, 0)`);
                ctx.fillStyle = g;
                ctx.fillRect(p.x - radius, p.y - radius, radius * 2, radius * 2);
            }
            for (const d of mw.dust) {
                const p = view.toScreen(d.ra, d.dec);
                if (!p) continue;
                const radius = d.size * pxPerDeg;
                const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
                g.addColorStop(0, rgb(middle, d.a * visibility * extinction(p.alt)));
                g.addColorStop(1, rgb(middle, 0));
                ctx.fillStyle = g;
                ctx.fillRect(p.x - radius, p.y - radius, radius * 2, radius * 2);
            }
            ctx.fillStyle = '#dfe6ff';
            for (const s of mw.specks) {
                const p = view.toScreen(s.ra, s.dec);
                if (!p) continue;
                ctx.globalAlpha = s.a * visibility * extinction(p.alt);
                ctx.fillRect(p.x, p.y, s.size, s.size);
            }
        }
        const fieldVisibility = (1 - 0.6 * day) * (1 - 0.3 * moonWash);
        ctx.fillStyle = '#eef1ff';
        for (const s of mw.field) {
            const p = view.toScreen(s.ra, s.dec);
            if (!p) continue;
            ctx.globalAlpha = s.a * fieldVisibility * extinction(p.alt);
            ctx.fillRect(p.x, p.y, s.size, s.size);
        }
        ctx.globalAlpha = 1;

        if (moonWash > 0 && moon.onScreen !== false) {
            const radius = h * 0.4;
            const g = ctx.createRadialGradient(moon.x, moon.y, 0, moon.x, moon.y, radius);
            g.addColorStop(0, `rgba(215, 225, 255, ${0.16 * moonWash})`);
            g.addColorStop(1, 'rgba(215, 225, 255, 0)');
            ctx.fillStyle = g;
            ctx.fillRect(moon.x - radius, moon.y - radius, radius * 2, radius * 2);
        }
    }

    // ---------------------------------------------------------------- aurora

    const AURORA_STEP = 6; // px per curtain column; the low-res buffer is upscaled, which softens it
    const AURORA_PAD = 60;

    function makeStrip(stops) {
        const strip = document.createElement('canvas');
        strip.width = 1;
        strip.height = 128;
        const ctx = strip.getContext('2d');
        const g = ctx.createLinearGradient(0, 0, 0, 128);
        for (const [at, color] of stops) g.addColorStop(at, color);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 1, 128);
        return strip;
    }

    function createAurora() {
        // Real aurora: violet-red tops, green lower curtain with a bright, sharp lower edge
        const strip = makeStrip([
            [0, 'rgba(170, 70, 255, 0)'],
            [0.3, 'rgba(160, 80, 240, 0.22)'],
            [0.58, 'rgba(0, 173, 181, 0.5)'],
            [0.86, 'rgba(70, 255, 170, 0.9)'],
            [0.95, 'rgba(170, 255, 210, 1)'],
            [1, 'rgba(70, 255, 170, 0)'],
        ]);
        const goldStrip = makeStrip([
            [0, 'rgba(255, 140, 60, 0)'],
            [0.45, 'rgba(255, 170, 90, 0.35)'],
            [0.85, 'rgba(255, 211, 105, 0.9)'],
            [1, 'rgba(255, 211, 105, 0)'],
        ]);
        const buffer = document.createElement('canvas');
        const bctx = buffer.getContext('2d');
        // Blurred copy at the same low resolution: softens the curtain columns almost for free
        const soft = document.createElement('canvas');
        const sctx = soft.getContext('2d');
        const canBlur = 'filter' in sctx;
        const ribbons = [
            { lift: 0.05, height: 0.2, weight: 1, speed: 1 },
            { lift: 0.13, height: 0.25, weight: 0.6, speed: 0.7 },
            { lift: 0.24, height: 0.18, weight: 0.35, speed: 0.5 },
        ];
        let w = 0;
        let h = 0;
        let horizonY = 0;

        return {
            resize(width, height, horizon) {
                w = width;
                h = height;
                horizonY = horizon;
                buffer.width = Math.ceil((w + 2 * AURORA_PAD) / AURORA_STEP);
                buffer.height = Math.ceil((horizonY + AURORA_PAD) / AURORA_STEP);
                soft.width = buffer.width;
                soft.height = buffer.height;
            },

            // t in seconds; pointer in screen space (or null); flare adds a gold surge
            draw(ctx, t, { intensity, pointer, flare = 0, offsetX = 0, offsetY = 0, alpha = 1 }) {
                if (intensity * alpha < 0.01) return;
                bctx.globalCompositeOperation = 'source-over';
                bctx.clearRect(0, 0, buffer.width, buffer.height);
                bctx.globalCompositeOperation = 'lighter';
                const columns = buffer.width;
                const pointerNear = pointer && pointer.y < horizonY ? 1 - smoothstep(horizonY * 0.2, horizonY, horizonY - pointer.y) * 0.6 : 0;
                for (let r = 0; r < ribbons.length; r++) {
                    const rb = ribbons[r];
                    for (let i = 0; i < columns; i++) {
                        const x = i * AURORA_STEP - AURORA_PAD;
                        const nx = x / 1000;
                        const patch = smoothstep(-0.25, 0.55, noise(nx * 1.6 - t * 0.02 * rb.speed, r * 11.3 + t * 0.035));
                        if (patch <= 0) continue;
                        // Vertical rays: two drifting frequencies, so they never line up into a row
                        const rays = 0.62
                            + 0.22 * Math.sin(x * 0.045 + 3 * noise(nx * 6, t * 0.2 + r) + t * (0.5 + r * 0.2))
                            + 0.16 * Math.sin(x * 0.13 - t * (0.9 + r * 0.3) + 2 * noise(nx * 14, t * 0.4));
                        const shimmer = 0.8 + 0.2 * noise(nx * 45, t * 1.6 + r * 5);
                        let boost = 0;
                        if (pointerNear) {
                            const dx = (x - pointer.x) / 140;
                            boost = Math.exp(-dx * dx) * pointerNear;
                        }
                        const brightness = intensity * rb.weight * patch * rays * shimmer * (1 + 0.9 * boost) * alpha;
                        if (brightness < 0.01) continue;
                        // The curtain's lower edge folds and drifts like hanging fabric
                        const baseY = horizonY - h * (rb.lift
                            + 0.05 * noise(nx * 1.2 + r * 7.3, t * 0.03 + r)
                            + 0.025 * noise(nx * 4.5 + r * 2.1, t * 0.08))
                            - boost * h * 0.02 * Math.sin(t * 2.4 + x * 0.02);
                        const height = h * rb.height * (0.6 + 0.7 * Math.max(0, noise(nx * 2 + r * 3, t * 0.05)) + 0.4 * boost) * (0.7 + 0.45 * rays);
                        bctx.globalAlpha = Math.min(1, brightness);
                        bctx.drawImage(strip, 0, 0, 1, 128, i, (baseY - height) / AURORA_STEP, 1, height / AURORA_STEP);
                        if (flare > 0.01) {
                            bctx.globalAlpha = Math.min(0.5, flare * 0.35 * patch * rays * rb.weight);
                            bctx.drawImage(goldStrip, 0, 0, 1, 128, i, (baseY - height * 1.2) / AURORA_STEP, 1, (height * 1.2) / AURORA_STEP);
                        }
                    }
                }
                bctx.globalAlpha = 1;
                let source = buffer;
                if (canBlur) {
                    sctx.clearRect(0, 0, soft.width, soft.height);
                    sctx.filter = 'blur(0.8px)';
                    sctx.drawImage(buffer, 0, 0);
                    sctx.filter = 'none';
                    sctx.globalAlpha = 0.6;
                    sctx.drawImage(buffer, 0, 0); // keep the bright lower edge crisp
                    sctx.globalAlpha = 1;
                    source = soft;
                }
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.imageSmoothingEnabled = true;
                ctx.drawImage(source, -AURORA_PAD + offsetX, offsetY, buffer.width * AURORA_STEP, buffer.height * AURORA_STEP);
                ctx.restore();
            },
        };
    }

    // ---------------------------------------------------------------- hills

    const HILLS_PAD = 48;
    // Back to front: each ridge sits lower, darker and moves more with parallax; the
    // nearer ones carry a ragged forest edge. lift/amp are in skyline units above the horizon.
    const RIDGES = [
        { lift: 0.35, amp: 1.0, freq: 2.2, top: [44, 54, 72], bottom: [30, 37, 50], trees: 0, depth: 0 },
        { lift: 0.12, amp: 0.8, freq: 3.0, top: [30, 37, 50], bottom: [21, 26, 36], trees: 0.025, depth: 0.33 },
        { lift: -0.15, amp: 0.7, freq: 3.8, top: [19, 24, 33], bottom: [13, 16, 23], trees: 0.05, depth: 0.66 },
        { lift: -0.5, amp: 0.8, freq: 3.3, top: [10, 12, 17], bottom: [6, 7, 10], trees: 0.08, depth: 1 },
    ];

    function createHills() {
        let layers = [];
        let rim = []; // back ridge top, for the aurora rim light
        let size = { u: 0 };
        let compass = () => [];

        function build(w, h, horizonY, dpr) {
            const r = rng(4242);
            const u = h * 0.11; // skyline unit height
            const top = horizonY - u * 2.4; // canvas origin in screen space
            const fullW = w + 2 * HILLS_PAD;
            const fullH = h - top + HILLS_PAD;
            size = { u, top, fullW, fullH };

            layers = RIDGES.map((ridge, i) => {
                const canvas = document.createElement('canvas');
                canvas.width = Math.round(fullW * dpr);
                canvas.height = Math.round(fullH * dpr);
                const ctx = canvas.getContext('2d');
                ctx.setTransform(dpr, 0, 0, dpr, HILLS_PAD * dpr, -top * dpr);
                const profile = (x) => {
                    const n = x / Math.max(w, 600);
                    const shape = 0.5 + 0.5 * noise(n * ridge.freq + i * 9.7, i * 3.1);
                    const detail = 0.3 * noise(n * ridge.freq * 3.5 + i * 4.2, i * 7.7);
                    return horizonY - u * (ridge.lift + ridge.amp * (shape + detail));
                };

                const fill = ctx.createLinearGradient(0, horizonY - u * (ridge.lift + ridge.amp), 0, h);
                fill.addColorStop(0, rgb(ridge.top));
                fill.addColorStop(0.35, rgb(ridge.bottom));
                fill.addColorStop(1, rgb(ridge.bottom));
                ctx.fillStyle = fill;
                ctx.beginPath();
                ctx.moveTo(-HILLS_PAD, h + u);
                const points = [];
                for (let x = -HILLS_PAD; x <= w + HILLS_PAD; ) {
                    const y = profile(x);
                    if (ridge.trees) {
                        // Ragged treeline: narrow spikes of varying height
                        const tree = u * ridge.trees * (0.4 + 0.6 * r()) * (0.6 + 0.4 * noise(x * 0.015, i));
                        const tw = Math.max(1.5, tree * (0.5 + 0.3 * r()));
                        ctx.lineTo(x, y);
                        ctx.lineTo(x + tw / 2, y - tree);
                        ctx.lineTo(x + tw, y);
                        x += tw * (0.6 + r() * 0.7);
                    } else {
                        ctx.lineTo(x, y);
                        points.push(x, y);
                        x += 4;
                    }
                }
                ctx.lineTo(w + HILLS_PAD, h + u);
                ctx.closePath();
                ctx.fill();

                if (i === 0) {
                    rim = points;
                    // Compass marks just above the farthest ridge, in Norwegian
                    ctx.font = `600 ${Math.max(9, Math.round(u * 0.13))}px Orbitron, sans-serif`;
                    ctx.textAlign = 'center';
                    for (const m of compass()) {
                        const y = profile(m.x) - u * 0.4;
                        ctx.fillStyle = 'rgba(0, 173, 181, 0.45)';
                        ctx.fillText(m.label, m.x, y);
                        ctx.fillRect(m.x - 0.5, y + 4, 1, u * 0.14);
                    }
                }

                // A soft band of mist settled in the valley in front of this ridge
                const mist = document.createElement('canvas');
                const mw = Math.ceil(fullW / 4);
                const mh = Math.ceil(u * 0.9 / 4);
                mist.width = mw;
                mist.height = mh;
                const mctx = mist.getContext('2d');
                for (let x = 0; x < mw; x++) {
                    // Wisps that tile seamlessly across the full width
                    const a = (x / mw) * Math.PI * 2;
                    const wisp = smoothstep(-0.35, 0.6, noise(Math.cos(a) * 1.6 + i * 5, Math.sin(a) * 1.6 + i * 2));
                    const g = mctx.createLinearGradient(0, 0, 0, mh);
                    g.addColorStop(0, 'rgba(255, 255, 255, 0)');
                    g.addColorStop(0.6, `rgba(255, 255, 255, ${wisp})`);
                    g.addColorStop(1, `rgba(255, 255, 255, ${wisp * 0.4})`);
                    mctx.fillStyle = g;
                    mctx.fillRect(x, 0, 1, mh);
                }

                return { canvas, mist, baseY: profile(w / 2), depth: ridge.depth };
            });
        }

        // Tints the white mist mask with the given colour into a reusable buffer
        const tinted = document.createElement('canvas');
        const tctx = tinted.getContext('2d');
        function tint(mist, color) {
            if (tinted.width !== mist.width || tinted.height !== mist.height) {
                tinted.width = mist.width;
                tinted.height = mist.height;
            } else {
                tctx.clearRect(0, 0, tinted.width, tinted.height);
            }
            tctx.globalCompositeOperation = 'source-over';
            tctx.drawImage(mist, 0, 0);
            tctx.globalCompositeOperation = 'source-in';
            tctx.fillStyle = color;
            tctx.fillRect(0, 0, tinted.width, tinted.height);
            return tinted;
        }

        return {
            setCompass(fn) {
                compass = fn;
            },
            resize(w, h, horizonY, dpr) {
                build(w, h, horizonY, dpr);
            },
            get unit() {
                return size.u;
            },

            // far*/near* offsets are the parallax of the back and front ridge; the rest interpolate
            draw(ctx, t, { farX = 0, farY = 0, nearX = 0, nearY = 0, rise = 0, aurora = 0, gold = 0 }) {
                const { u, top, fullW, fullH } = size;
                const haze = gold > 0.05 ? [255, 211, 105] : [Math.round(lerp(150, 90, clamp(aurora * 0.6))), Math.round(lerp(168, 230, clamp(aurora * 0.6))), Math.round(lerp(196, 185, clamp(aurora * 0.6)))];
                layers.forEach((layer, i) => {
                    const ox = lerp(farX, nearX, layer.depth);
                    const oy = lerp(farY, nearY, layer.depth) + rise * (1 + layer.depth * 0.6);
                    if (i > 0) {
                        // Mist drifts slowly sideways and breathes; each band at its own pace
                        const breathe = 0.75 + 0.25 * noise(t * 0.05, i * 3.3);
                        const alpha = (0.2 + 0.08 * aurora + 0.2 * gold) * breathe;
                        const source = tint(layer.mist, rgb(haze));
                        const drift = ((t * (3 + i * 2)) % fullW + fullW) % fullW;
                        const y = layer.baseY - u * 0.75 + oy;
                        ctx.globalAlpha = alpha;
                        for (const dx of [drift - fullW, drift]) {
                            ctx.drawImage(source, -HILLS_PAD + ox + dx, y, fullW, u * 0.9);
                        }
                        ctx.globalAlpha = 1;
                    }
                    ctx.drawImage(layer.canvas, -HILLS_PAD + ox, top + oy, fullW, fullH);

                    // Rim light from the aurora along the farthest ridge
                    if (i === 0 && aurora > 0.02 && rim.length) {
                        ctx.save();
                        ctx.translate(ox, oy);
                        ctx.strokeStyle = gold > 0.05 ? `rgba(255, 211, 105, ${0.35 * gold})` : `rgba(90, 255, 190, ${0.14 * aurora})`;
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.moveTo(rim[0], rim[1]);
                        for (let k = 2; k < rim.length; k += 2) ctx.lineTo(rim[k], rim[k + 1]);
                        ctx.stroke();
                        ctx.restore();
                    }
                });
            },
        };
    }

    H.scenery = { clamp, lerp, smoothstep, rng, noise, createMilkyWay, renderSky, createAurora, createHills };
})();
