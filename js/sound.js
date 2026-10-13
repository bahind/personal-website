// Generative, ethereal sound for the starfield, built entirely with Web Audio — no audio
// files. Off by default; the choice is remembered. Nothing is struck: every sound swells in
// and dissolves into a long reverb. A slowly evolving pad drifts through D Lydian chords,
// the aurora hisses faintly with its own brightness, and interactions answer with breaths,
// glides and swells, panned to where they happen on screen.
(() => {
    const H = (window.Hind = window.Hind || {});
    const KEY = 'hind-sound';

    // D Lydian voicings the pad drifts between (Hz)
    const CHORDS = [
        [73.42, 110, 164.81, 185, 277.18], // Dmaj9(#11)-ish: D A E F# C#
        [73.42, 123.47, 164.81, 207.65, 246.94], // E/D: D B E G# B
        [61.74, 92.5, 110, 146.83, 164.81], // Bm11: B F# A D E
        [65.41, 98, 146.83, 164.81, 220], // Cmaj9 colour: C G D E A
    ];
    // Upper Lydian tones for swells and shimmer
    const HIGH = [440, 493.88, 554.37, 587.33, 659.25, 739.99, 830.61, 880, 987.77, 1108.73];

    let ctx = null;
    let master = null;
    let dry = null;
    let wet = null;
    let pad = null;
    let air = null;
    let hole = null;
    let glide = null;
    let enabled = false;
    let lastPulse = 0;
    const listeners = new Set();

    const stored = () => {
        try {
            return localStorage.getItem(KEY) === '1';
        } catch {
            return false;
        }
    };
    const store = (on) => {
        try {
            localStorage.setItem(KEY, on ? '1' : '0');
        } catch {
            /* storage unavailable: the choice just isn't remembered */
        }
    };

    const rand = (a, b) => a + Math.random() * (b - a);
    const pick = (list) => list[Math.floor(Math.random() * list.length)];

    function noiseBuffer(seconds) {
        const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        return buffer;
    }

    // A long, dark, slightly diffuse tail
    function impulse(seconds) {
        const length = Math.floor(ctx.sampleRate * seconds);
        const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
        for (let ch = 0; ch < 2; ch++) {
            const data = buffer.getChannelData(ch);
            let smooth = 0;
            for (let i = 0; i < length; i++) {
                smooth = smooth * 0.6 + (Math.random() * 2 - 1) * 0.4; // gentle low-pass: no fizz
                data[i] = smooth * Math.pow(1 - i / length, 2.4);
            }
        }
        return buffer;
    }

    function init() {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return false;
        ctx = new AudioContext();
        master = ctx.createGain();
        master.gain.value = 0;
        const tone = ctx.createBiquadFilter();
        tone.type = 'lowpass';
        tone.frequency.value = 6500; // round off the top end
        const compressor = ctx.createDynamicsCompressor();
        compressor.threshold.value = -20;
        compressor.ratio.value = 3;
        master.connect(tone).connect(compressor).connect(ctx.destination);
        dry = ctx.createGain();
        dry.gain.value = 0.55;
        dry.connect(master);
        const reverb = ctx.createConvolver();
        reverb.buffer = impulse(6);
        wet = ctx.createGain();
        wet.gain.value = 1;
        wet.connect(reverb).connect(master);
        return true;
    }

    function lfo(freq, depth, target) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = freq;
        gain.gain.value = depth;
        osc.connect(gain).connect(target);
        osc.start();
        return osc;
    }

    // Routes a source through a stereo position into the dry and reverb buses
    function output(pan = 0, send = 0.8, dryLevel = 1) {
        const input = ctx.createGain();
        let node = input;
        if (ctx.createStereoPanner) {
            const panner = ctx.createStereoPanner();
            panner.pan.value = Math.max(-1, Math.min(1, pan));
            input.connect(panner);
            node = panner;
            input.panner = panner;
        }
        const d = ctx.createGain();
        d.gain.value = dryLevel;
        const s = ctx.createGain();
        s.gain.value = send;
        node.connect(d).connect(dry);
        node.connect(s).connect(wet);
        return input;
    }

    // ---------------------------------------------------------------- ambience

    function startPad() {
        const out = ctx.createGain();
        out.gain.value = 0;
        out.gain.setTargetAtTime(0.09, ctx.currentTime, 3);
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 700;
        filter.Q.value = 0.5;
        filter.connect(out);
        out.connect(output(0, 0.9, 0.7));
        const sources = [lfo(0.017, 450, filter.frequency)];
        const voices = CHORDS[0].map((freq, i) => {
            const gain = ctx.createGain();
            gain.gain.value = 0.16 / (1 + i * 0.3);
            sources.push(lfo(0.03 + i * 0.011, 0.06, gain.gain));
            const pair = [-7, 7].map((cents) => {
                const osc = ctx.createOscillator();
                osc.type = 'sawtooth';
                osc.frequency.value = freq;
                osc.detune.value = cents + rand(-2, 2);
                osc.connect(gain);
                osc.start();
                sources.push(osc);
                return osc;
            });
            gain.connect(filter);
            return pair;
        });

        // Shimmer: faint high partials that only really live in the reverb
        const shimmer = ctx.createGain();
        shimmer.gain.value = 0.004;
        shimmer.connect(output(0, 1, 0.1));
        for (const [freq, rate] of [[587.33, 0.021], [880, 0.013], [1318.5, 0.009]]) {
            const osc = ctx.createOscillator();
            osc.frequency.value = freq;
            const g = ctx.createGain();
            g.gain.value = 0.5;
            sources.push(lfo(rate, 0.5, g.gain));
            osc.connect(g).connect(shimmer);
            osc.start();
            sources.push(osc);
        }

        // The pad drifts to a new chord every ~25 s, each voice gliding at its own pace
        let chord = 0;
        const drift = setInterval(() => {
            chord = (chord + 1) % CHORDS.length;
            voices.forEach((pair, i) => {
                for (const osc of pair) osc.frequency.setTargetAtTime(CHORDS[chord][i], ctx.currentTime + i * 0.8, 3 + i);
            });
        }, 25000);
        pad = { out, sources, drift };
    }

    // Solar wind and the aurora's hiss, fed by two decorrelated noise loops
    function startAir() {
        const sources = [];
        const wind = ctx.createGain();
        wind.gain.value = 0.035;
        const windBand = ctx.createBiquadFilter();
        windBand.type = 'bandpass';
        windBand.frequency.value = 500;
        windBand.Q.value = 0.6;
        sources.push(lfo(0.023, 300, windBand.frequency), lfo(0.041, 0.025, wind.gain));
        windBand.connect(wind).connect(output(0, 0.6, 0.8));

        const hiss = ctx.createGain();
        hiss.gain.value = 0;
        const hissBand = ctx.createBiquadFilter();
        hissBand.type = 'bandpass';
        hissBand.frequency.value = 4200;
        hissBand.Q.value = 3;
        sources.push(lfo(0.07, 1400, hissBand.frequency));
        hissBand.connect(hiss);
        for (let i = 0; i < 2; i++) {
            const src = ctx.createBufferSource();
            src.buffer = noiseBuffer(5 + i * 0.7);
            src.loop = true;
            src.connect(windBand);
            src.connect(hissBand);
            src.start();
            sources.push(src);
        }
        hiss.connect(output(0, 0.9, 0.5));
        air = { sources, hiss };
    }

    function stopAmbience() {
        for (const layer of [pad, air]) {
            if (!layer) continue;
            if (layer.drift) clearInterval(layer.drift);
            if (layer.out) layer.out.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
            if (layer.hiss) layer.hiss.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
            setTimeout(() => layer.sources.forEach((s) => s.stop()), 2500);
        }
        pad = null;
        air = null;
    }

    function setEnabled(on) {
        enabled = on;
        store(on);
        if (on) {
            if (!ctx && !init()) {
                enabled = false;
                return;
            }
            ctx.resume();
            master.gain.cancelScheduledValues(ctx.currentTime);
            master.gain.setTargetAtTime(0.8, ctx.currentTime, 0.8);
            if (!pad) startPad();
            if (!air) startAir();
        } else if (ctx) {
            master.gain.cancelScheduledValues(ctx.currentTime);
            master.gain.setTargetAtTime(0, ctx.currentTime, 0.25);
            stopAmbience();
            stopHole();
            if (glide) H.sound.glideEnd();
        }
        listeners.forEach((fn) => fn(enabled));
    }

    // ---------------------------------------------------------------- building blocks

    // A swelling tone: sine plus a soft, slightly detuned triangle — no attack transient
    function swell(freq, { pan = 0, delay = 0, attack = 0.6, hold = 0.2, release = 3, gain = 0.03, send = 0.9 } = {}) {
        const t = ctx.currentTime + delay;
        const env = ctx.createGain();
        env.gain.setValueAtTime(0, t);
        env.gain.linearRampToValueAtTime(gain, t + attack);
        env.gain.setValueAtTime(gain, t + attack + hold);
        env.gain.setTargetAtTime(0, t + attack + hold, release / 4);
        env.connect(output(pan, send, 0.6));
        for (const [type, detune, level] of [['sine', 0, 1], ['triangle', 6, 0.35]]) {
            const osc = ctx.createOscillator();
            osc.type = type;
            osc.frequency.value = freq;
            osc.detune.value = detune;
            const g = ctx.createGain();
            g.gain.value = level;
            osc.connect(g).connect(env);
            osc.start(t);
            osc.stop(t + attack + hold + release * 1.5);
        }
    }

    // Filtered noise breath sweeping between two frequencies
    function breath({ pan = 0, from, to, duration, gain, q = 1.5, type = 'bandpass', attack = 0.35, send = 0.9 }) {
        const t = ctx.currentTime;
        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer(duration + 0.2);
        const filter = ctx.createBiquadFilter();
        filter.type = type;
        filter.Q.value = q;
        filter.frequency.setValueAtTime(from, t);
        filter.frequency.exponentialRampToValueAtTime(to, t + duration);
        const env = ctx.createGain();
        env.gain.setValueAtTime(0.0001, t);
        env.gain.exponentialRampToValueAtTime(gain, t + duration * attack);
        env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
        const out = output(pan, send, 0.7);
        src.connect(filter).connect(env).connect(out);
        src.start(t);
        src.stop(t + duration + 0.2);
        return out;
    }

    // A soft low "whomp": falling sine under a breath, mostly heard in the reverb
    function whomp(pan, strength = 1) {
        const t = ctx.currentTime;
        const osc = ctx.createOscillator();
        osc.frequency.setValueAtTime(240, t);
        osc.frequency.exponentialRampToValueAtTime(80, t + 0.6); // high enough for phone speakers
        const env = ctx.createGain();
        env.gain.setValueAtTime(0, t);
        env.gain.linearRampToValueAtTime(0.13 * strength, t + 0.035);
        env.gain.setTargetAtTime(0, t + 0.06, 0.28);
        osc.connect(env).connect(output(pan, 0.7, 0.8));
        osc.start(t);
        osc.stop(t + 1.8);
        breath({ pan, from: 1400, to: 300, duration: 1.1, gain: 0.08 * strength, q: 0.9, attack: 0.15 });
    }

    function stopHole() {
        if (!hole) return;
        const h = hole;
        hole = null;
        const t = ctx.currentTime;
        h.env.gain.cancelScheduledValues(t);
        h.env.gain.setTargetAtTime(0, t, 0.06);
        h.sources.forEach((s) => s.stop(t + 0.6));
    }

    const ready = () => enabled && ctx;

    H.sound = {
        get enabled() {
            return enabled;
        },
        get remembered() {
            return stored();
        },
        toggle() {
            setEnabled(!enabled);
        },
        onChange(fn) {
            listeners.add(fn);
        },

        // Click on the sky
        pulse(pan = 0) {
            if (!ready() || ctx.currentTime - lastPulse < 0.12) return;
            lastPulse = ctx.currentTime;
            whomp(pan, 0.8);
        },

        // Holding a star: a breathy, vibrato glide that follows height and speed
        glideStart(pan = 0) {
            if (!ready() || glide) return;
            const osc = ctx.createOscillator();
            osc.frequency.value = 440;
            const vibrato = lfo(4.6, 3, osc.frequency);
            const filter = ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = 1200;
            const env = ctx.createGain();
            env.gain.value = 0;
            env.gain.setTargetAtTime(0.03, ctx.currentTime, 0.12);
            const out = output(pan, 1, 0.6);
            osc.connect(filter).connect(env).connect(out);
            osc.start();
            glide = { osc, vibrato, filter, env, out };
        },
        glide(speed, y, pan = 0) {
            if (!ready() || !glide) return;
            const t = ctx.currentTime;
            const freq = 330 * Math.pow(2, (1 - y) * 1.6) * (1 + Math.min(speed, 20) * 0.01);
            glide.osc.frequency.setTargetAtTime(freq, t, 0.08);
            glide.filter.frequency.setTargetAtTime(900 + Math.min(speed, 20) * 120, t, 0.08);
            glide.env.gain.setTargetAtTime(0.025 + Math.min(speed, 20) * 0.0025, t, 0.1);
            if (glide.out.panner) glide.out.panner.pan.setTargetAtTime(pan, t, 0.1);
        },
        glideEnd() {
            if (!glide || !ctx) return;
            const g = glide;
            glide = null;
            const t = ctx.currentTime;
            g.env.gain.setTargetAtTime(0, t, 0.35);
            g.osc.stop(t + 2.5);
            g.vibrato.stop(t + 2.5);
        },

        // A constellation is drawn: one slow chord swell with a glassy top
        reveal(pan = 0, quiet = false) {
            if (!ready()) return;
            const root = Math.floor(Math.random() * 4);
            const notes = [HIGH[root], HIGH[root + 2], HIGH[root + 4], HIGH[root + 6]];
            const level = quiet ? 0.6 : 1;
            notes.forEach((f, i) => swell(f, { pan: pan * 0.7, delay: i * 0.22, attack: 1.1, hold: 0.6, release: 4, gain: 0.018 * level }));
            swell(notes[3] * 2, { pan, delay: 0.9, attack: 0.8, hold: 0, release: 3, gain: 0.006 * level, send: 1 });
        },

        // Wish granted, or the name glitching: a soft, high glimmer
        shimmer(pan = 0, strength = 1) {
            if (!ready()) return;
            for (let i = 0; i < 4; i++) {
                swell(pick(HIGH.slice(5)) * 2, { pan: pan + rand(-0.3, 0.3), delay: i * 0.09, attack: 0.08, hold: 0, release: 2.4, gain: 0.012 * strength, send: 1 });
            }
        },

        // A shooting star crossing the screen
        meteor(fromPan, toPan, duration = 1.4) {
            if (!ready()) return;
            const out = breath({ pan: fromPan, from: 5200, to: 1400, duration, gain: 0.035, q: 2.5, attack: 0.25 });
            if (out.panner) out.panner.pan.linearRampToValueAtTime(Math.max(-1, Math.min(1, toPan)), ctx.currentTime + duration);
        },

        // Aurora brightness, 0..~1.5, sets the level of its faint hiss
        aurora(level) {
            if (!ready() || !air) return;
            air.hiss.gain.setTargetAtTime(0.004 + Math.min(1.5, level) * 0.01, ctx.currentTime, 1.5);
        },

        // Leaving through hyperspace: a rising sweep with a sine riser underneath
        whoosh() {
            if (!ready()) return;
            breath({ from: 180, to: 3600, duration: 0.85, gain: 0.12, q: 2.2, attack: 0.7 });
            const t = ctx.currentTime;
            const osc = ctx.createOscillator();
            osc.frequency.setValueAtTime(110, t);
            osc.frequency.exponentialRampToValueAtTime(660, t + 0.8);
            const env = ctx.createGain();
            env.gain.setValueAtTime(0, t);
            env.gain.linearRampToValueAtTime(0.04, t + 0.7);
            env.gain.linearRampToValueAtTime(0, t + 0.85);
            osc.connect(env).connect(output(0, 1, 0.6));
            osc.start(t);
            osc.stop(t + 1);
        },
        // Arriving: the sweep settles, and a low chord blooms
        arrive() {
            if (!ready()) return;
            breath({ from: 3600, to: 200, duration: 1.6, gain: 0.07, q: 1.5, attack: 0.1 });
            [73.42, 110, 164.81, 277.18].forEach((f, i) => swell(f * 2, { delay: 0.2 + i * 0.12, attack: 1.2, hold: 0.4, release: 4, gain: 0.02 }));
        },

        // Five clicks on the name: a slow sunrise of a chord over a washing noise
        supernova(pan = 0) {
            if (!ready()) return;
            whomp(pan, 1.4);
            breath({ pan, from: 7000, to: 260, duration: 3.5, gain: 0.08, q: 0.5, type: 'lowpass', attack: 0.08 });
            [73.42, 110, 164.81, 277.18, 440, 659.25, 830.61].forEach((f, i) =>
                swell(f, { pan: pan * (i % 2 ? 0.5 : -0.5), delay: i * 0.08, attack: 0.5 + i * 0.1, hold: 1, release: 5, gain: i < 3 ? 0.04 : 0.02 }));
        },

        // Black hole: a deep, beating hum and a resonant sweep that rises as spacetime stretches
        hole(mass, pan = 0) {
            if (!ready()) return;
            const t = ctx.currentTime;
            if (!hole) {
                const env = ctx.createGain();
                env.gain.value = 0;
                const out = output(pan, 0.7, 0.9);
                env.connect(out);
                const subs = [36.7, 37.4].map((f) => {
                    const osc = ctx.createOscillator();
                    osc.frequency.value = f; // two close sines beat slowly against each other
                    osc.connect(env);
                    osc.start();
                    return osc;
                });
                const src = ctx.createBufferSource();
                src.buffer = noiseBuffer(4);
                src.loop = true;
                const band = ctx.createBiquadFilter();
                band.type = 'bandpass';
                band.Q.value = 9;
                band.frequency.value = 160;
                const noiseGain = ctx.createGain();
                noiseGain.gain.value = 0.8;
                src.connect(band).connect(noiseGain).connect(env);
                src.start();
                hole = { env, band, out, subs, sources: [...subs, src] };
            }
            hole.subs[0].frequency.setTargetAtTime(36.7 - mass * 6, t, 0.2);
            hole.subs[1].frequency.setTargetAtTime(37.4 - mass * 5.2, t, 0.2);
            hole.band.frequency.setTargetAtTime(160 + mass * 1400, t, 0.25);
            hole.env.gain.setTargetAtTime(0.03 + mass * 0.09, t, 0.2);
            if (hole.out.panner) hole.out.panner.pan.setTargetAtTime(pan, t, 0.2);
        },
        // Release: a reversed breath sucks inward, then the disk blooms outward
        holeRelease(mass, fed, pan = 0) {
            stopHole();
            if (!ready()) return;
            breath({ pan, from: 300, to: 2600, duration: 0.35, gain: 0.08 * (0.5 + mass), q: 1.2, attack: 0.92 });
            setTimeout(() => {
                if (!ready()) return;
                whomp(pan, 0.6 + mass * 0.6);
                if (fed) H.sound.reveal(pan);
            }, 300);
        },
    };

    // A remembered "on" can only start after a user gesture (autoplay policy)
    if (stored()) {
        const start = () => {
            if (!enabled && stored()) setEnabled(true);
        };
        window.addEventListener('pointerdown', start, { once: true, capture: true });
        window.addEventListener('keydown', start, { once: true, capture: true });
    }

    document.addEventListener('visibilitychange', () => {
        if (!ctx) return;
        if (document.hidden) ctx.suspend();
        else if (enabled) ctx.resume();
    });
})();
