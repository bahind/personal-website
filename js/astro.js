// Low-precision positional astronomy for the sky over Oslo: sidereal time, horizontal
// coordinates, Sun, Moon and naked-eye planets. Good to a fraction of a degree, which is
// far below a pixel's worth of error at the starfield's scale.
(() => {
    const RAD = Math.PI / 180;
    const OSLO = { lat: 59.9139, lon: 10.7522 };
    const OBLIQUITY = 23.43928 * RAD;

    const norm360 = (deg) => ((deg % 360) + 360) % 360;

    const julianDate = (ms) => ms / 86400000 + 2440587.5;

    // Local mean sidereal time in degrees
    const siderealTime = (jd, lon) => norm360(280.46061837 + 360.98564736629 * (jd - 2451545) + lon);

    // Linear general precession from J2000 to date; plenty for a few decades
    function precess(ra, dec, jd) {
        const years = (jd - 2451545) / 365.25;
        const m = 0.0128117 * years;
        const n = 0.0055672 * years;
        const r = ra * RAD;
        const d = dec * RAD;
        return {
            ra: ra + m + n * Math.sin(r) * Math.tan(d),
            dec: dec + n * Math.cos(r),
        };
    }

    // Equatorial (degrees) to horizontal (radians); azimuth from north through east
    function horizontal(ra, dec, lst, lat = OSLO.lat) {
        const h = (lst - ra) * RAD;
        const d = dec * RAD;
        const p = lat * RAD;
        const sinD = Math.sin(d);
        const cosD = Math.cos(d);
        const sinP = Math.sin(p);
        const cosP = Math.cos(p);
        const cosH = Math.cos(h);
        const alt = Math.asin(sinD * sinP + cosD * cosP * cosH);
        const az = Math.atan2(-cosD * Math.sin(h), sinD * cosP - cosD * sinP * cosH);
        return { alt, az };
    }

    function eclipticToEquatorial(lambda, beta) {
        const l = lambda * RAD;
        const b = beta * RAD;
        const ra = Math.atan2(Math.sin(l) * Math.cos(OBLIQUITY) - Math.tan(b) * Math.sin(OBLIQUITY), Math.cos(l));
        const dec = Math.asin(Math.sin(b) * Math.cos(OBLIQUITY) + Math.cos(b) * Math.sin(OBLIQUITY) * Math.sin(l));
        return { ra: norm360(ra / RAD), dec: dec / RAD };
    }

    function sun(jd) {
        const d = jd - 2451545;
        const g = (357.528 + 0.9856003 * d) * RAD;
        const lambda = 280.46 + 0.9856474 * d + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g);
        return eclipticToEquatorial(norm360(lambda), 0);
    }

    // Astronomical Almanac low-precision lunar theory (~0.3° in longitude)
    function moon(jd) {
        const t = (jd - 2451545) / 36525;
        const s = (a, b) => Math.sin((a + b * t) * RAD);
        const c = (a, b) => Math.cos((a + b * t) * RAD);
        const lambda = 218.32 + 481267.881 * t
            + 6.29 * s(135.0, 477198.87) - 1.27 * s(259.3, -413335.36)
            + 0.66 * s(235.7, 890534.22) + 0.21 * s(269.9, 954397.74)
            - 0.19 * s(357.5, 35999.05) - 0.11 * s(186.5, 966404.03);
        const beta = 5.13 * s(93.3, 483202.02) + 0.28 * s(228.2, 960400.89)
            - 0.28 * s(318.3, 6003.15) - 0.17 * s(217.6, -407332.21);
        const parallax = 0.9508 + 0.0518 * c(135.0, 477198.87) + 0.0095 * c(259.3, -413335.36)
            + 0.0078 * c(235.7, 890534.22) + 0.0028 * c(269.9, 954397.74);
        return { ...eclipticToEquatorial(norm360(lambda), beta), parallax };
    }

    function moonIllumination(sunPos, moonPos) {
        const a = sunPos.dec * RAD;
        const b = moonPos.dec * RAD;
        const cosElong = Math.sin(a) * Math.sin(b) + Math.cos(a) * Math.cos(b) * Math.cos((sunPos.ra - moonPos.ra) * RAD);
        return (1 - cosElong) / 2;
    }

    // JPL "Approximate Positions of the Planets" (Standish), valid 1800–2050:
    // a, e, I, L, long. perihelion, long. ascending node — plus rates per century
    const ELEMENTS = {
        Mercury: [0.38709927, 0.20563593, 7.00497902, 252.2503235, 77.45779628, 48.33076593,
            0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081],
        Venus: [0.72333566, 0.00677672, 3.39467605, 181.9790995, 131.60246718, 76.67984255,
            0.0000039, -0.00004107, -0.0007889, 58517.81538729, 0.00268329, -0.27769418],
        Earth: [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0,
            0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0],
        Mars: [1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891,
            0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343],
        Jupiter: [5.202887, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909,
            -0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106],
        Saturn: [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448,
            -0.0012506, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794],
    };
    // Absolute magnitudes for a rough brightness estimate; phase effects are ignored,
    // so results are clamped to each planet's real apparent range
    const PLANET_H = { Mercury: -0.4, Venus: -4.4, Mars: -1.5, Jupiter: -9.4, Saturn: -8.9 };
    const PLANET_MAG_RANGE = {
        Mercury: [-1.5, 2], Venus: [-4.9, -3.8], Mars: [-2.9, 1.8], Jupiter: [-2.9, -1.6], Saturn: [-0.5, 1.5],
    };

    function heliocentric(name, t) {
        const el = ELEMENTS[name];
        const [a, e, inc, L, peri, node] = el.slice(0, 6).map((v, i) => v + el[i + 6] * t);
        const w = (peri - node) * RAD;
        const o = node * RAD;
        const i = inc * RAD;
        let m = norm360(L - peri);
        if (m > 180) m -= 360;
        m *= RAD;
        let E = m + e * Math.sin(m);
        for (let k = 0; k < 6; k++) E -= (E - e * Math.sin(E) - m) / (1 - e * Math.cos(E));
        const xp = a * (Math.cos(E) - e);
        const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
        const cw = Math.cos(w);
        const sw = Math.sin(w);
        const co = Math.cos(o);
        const so = Math.sin(o);
        const ci = Math.cos(i);
        const si = Math.sin(i);
        return {
            x: (cw * co - sw * so * ci) * xp + (-sw * co - cw * so * ci) * yp,
            y: (cw * so + sw * co * ci) * xp + (-sw * so + cw * co * ci) * yp,
            z: sw * si * xp + cw * si * yp,
        };
    }

    function planets(jd) {
        const t = (jd - 2451545) / 36525;
        const earth = heliocentric('Earth', t);
        return Object.keys(PLANET_H).map((name) => {
            const p = heliocentric(name, t);
            const x = p.x - earth.x;
            const y = p.y - earth.y;
            const z = p.z - earth.z;
            const ye = y * Math.cos(OBLIQUITY) - z * Math.sin(OBLIQUITY);
            const ze = y * Math.sin(OBLIQUITY) + z * Math.cos(OBLIQUITY);
            const dist = Math.hypot(x, ye, ze);
            const r = Math.hypot(p.x, p.y, p.z);
            const [lo, hi] = PLANET_MAG_RANGE[name];
            return {
                name,
                ra: norm360(Math.atan2(ye, x) / RAD),
                dec: Math.asin(ze / dist) / RAD,
                mag: Math.min(hi, Math.max(lo, PLANET_H[name] + 5 * Math.log10(r * dist))),
            };
        });
    }

    // Galactic (degrees) to J2000 equatorial (degrees)
    function galacticToEquatorial(l, b) {
        const lr = l * RAD;
        const br = b * RAD;
        const gx = Math.cos(br) * Math.cos(lr);
        const gy = Math.cos(br) * Math.sin(lr);
        const gz = Math.sin(br);
        const x = -0.0548755604 * gx + 0.4941094279 * gy - 0.867666149 * gz;
        const y = -0.8734370902 * gx - 0.44482963 * gy - 0.1980763734 * gz;
        const z = -0.4838350155 * gx + 0.7469822445 * gy + 0.4559837762 * gz;
        return { ra: norm360(Math.atan2(y, x) / RAD), dec: Math.asin(z) / RAD };
    }

    window.Hind = window.Hind || {};
    window.Hind.astro = {
        RAD,
        OSLO,
        julianDate,
        siderealTime,
        precess,
        horizontal,
        sun,
        moon,
        moonIllumination,
        planets,
        galacticToEquatorial,
    };
})();
