(() => {
    console.log(
        '%chind.nu_',
        'color:#00ADB5; font-family:monospace; font-size:22px; font-weight:bold; text-shadow:0 0 8px rgba(0,173,181,0.7)'
    );
    console.log(
        "%cHi, fellow explorer!",
        'color:#EEEEEE; font-family:monospace'
    );

    const canvas = document.getElementById('starfield');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const CYAN = '0, 173, 181';
    const GOLD = '255, 211, 105';
    const LINK_DIST = 110;
    const POINTER_DIST = 180;
    const GRAB_DIST = 30;

    let width = 0;
    let height = 0;
    const pointer = { x: null, y: null };
    const particles = [];
    const shockwaves = [];
    let dragged = null;
    let goldUntil = 0;
    let shootingStar = null;
    let nextShootingStar = performance.now() + 4000 + Math.random() * 6000;

    if (navigator.webdriver) {
        console.log(
            '%cnavigator.webdriver === true — welcome, fellow automation. The stars turn gold in your honor.',
            'color:#FFD369; font-family:monospace'
        );
        goldUntil = performance.now() + 8000;
    }

    function resize() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        width = window.innerWidth;
        height = window.innerHeight;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        seed();
        if (reduceMotion) drawFrame(performance.now());
    }

    function seed() {
        dragged = null;
        particles.length = 0;
        const count = Math.min(150, Math.floor((width * height) / 11000));
        for (let i = 0; i < count; i++) {
            particles.push({
                x: Math.random() * width,
                y: Math.random() * height,
                vx: (Math.random() - 0.5) * 0.3,
                vy: (Math.random() - 0.5) * 0.3,
                r: 0.6 + Math.random() * 1.4,
                gold: Math.random() < 0.08,
                twinkle: Math.random() * Math.PI * 2,
            });
        }
    }

    function nearestParticle(x, y, maxDist) {
        let best = null;
        let bestDist = maxDist;
        for (const p of particles) {
            const d = Math.hypot(p.x - x, p.y - y);
            if (d < bestDist) {
                bestDist = d;
                best = p;
            }
        }
        return best;
    }

    function supernova(el) {
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        goldUntil = performance.now() + 4000;
        const reach = Math.max(width, height);
        for (const p of particles) {
            const dx = p.x - cx;
            const dy = p.y - cy;
            const d = Math.hypot(dx, dy) || 1;
            const force = 9 * Math.max(0.25, 1 - d / reach);
            p.vx += (dx / d) * force;
            p.vy += (dy / d) * force;
        }
        shockwaves.push({ x: cx, y: cy, radius: 0, energy: 1.6 });
    }

    function update(now) {
        for (const p of particles) {
            if (p === dragged) {
                if (pointer.x !== null) {
                    // Spring toward the pointer; retained velocity becomes the fling
                    p.vx = (pointer.x - p.x) * 0.35;
                    p.vy = (pointer.y - p.y) * 0.35;
                }
            } else {
                if (pointer.x !== null) {
                    const dx = pointer.x - p.x;
                    const dy = pointer.y - p.y;
                    const d = Math.hypot(dx, dy);
                    if (d > 1 && d < POINTER_DIST) {
                        // Gentle pull toward the cursor so stars gather around it
                        const force = 0.012 * (1 - d / POINTER_DIST);
                        p.vx += (dx / d) * force;
                        p.vy += (dy / d) * force;
                    }
                }

                for (const wave of shockwaves) {
                    const dx = p.x - wave.x;
                    const dy = p.y - wave.y;
                    const d = Math.hypot(dx, dy);
                    if (d > 1 && Math.abs(d - wave.radius) < 40) {
                        const force = 2.2 * wave.energy;
                        p.vx += (dx / d) * force;
                        p.vy += (dy / d) * force;
                    }
                }
            }

            p.x += p.vx;
            p.y += p.vy;
            // Friction pulls speed back toward calm drift after pulls and shocks
            p.vx *= 0.985;
            p.vy *= 0.985;

            if (p.x < -10) p.x = width + 10;
            if (p.x > width + 10) p.x = -10;
            if (p.y < -10) p.y = height + 10;
            if (p.y > height + 10) p.y = -10;
        }

        for (let i = shockwaves.length - 1; i >= 0; i--) {
            const wave = shockwaves[i];
            wave.radius += 7;
            wave.energy *= 0.94;
            if (wave.energy < 0.02) shockwaves.splice(i, 1);
        }

        if (!shootingStar && now > nextShootingStar) {
            const fromLeft = Math.random() < 0.5;
            shootingStar = {
                x: fromLeft ? -40 : width * (0.3 + Math.random() * 0.7),
                y: Math.random() * height * 0.4,
                vx: (fromLeft ? 1 : -1) * (7 + Math.random() * 4),
                vy: 3 + Math.random() * 2,
                life: 1,
            };
            nextShootingStar = now + 7000 + Math.random() * 9000;
        }
        if (shootingStar) {
            shootingStar.x += shootingStar.vx;
            shootingStar.y += shootingStar.vy;
            shootingStar.life -= 0.012;
            if (shootingStar.life <= 0 || shootingStar.y > height + 60) shootingStar = null;
        }
    }

    function drawFrame(now) {
        ctx.clearRect(0, 0, width, height);

        // Faint glow following the cursor
        if (pointer.x !== null) {
            const glow = ctx.createRadialGradient(pointer.x, pointer.y, 0, pointer.x, pointer.y, 140);
            glow.addColorStop(0, `rgba(${CYAN}, 0.08)`);
            glow.addColorStop(1, `rgba(${CYAN}, 0)`);
            ctx.fillStyle = glow;
            ctx.fillRect(pointer.x - 140, pointer.y - 140, 280, 280);
        }

        for (let i = 0; i < particles.length; i++) {
            const a = particles[i];
            for (let j = i + 1; j < particles.length; j++) {
                const b = particles[j];
                const dx = a.x - b.x;
                const dy = a.y - b.y;
                if (Math.abs(dx) > LINK_DIST || Math.abs(dy) > LINK_DIST) continue;
                const d = Math.hypot(dx, dy);
                if (d < LINK_DIST) {
                    ctx.strokeStyle = `rgba(${CYAN}, ${0.14 * (1 - d / LINK_DIST)})`;
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(a.x, a.y);
                    ctx.lineTo(b.x, b.y);
                    ctx.stroke();
                }
            }
            if (pointer.x !== null) {
                const d = Math.hypot(a.x - pointer.x, a.y - pointer.y);
                if (d < POINTER_DIST) {
                    ctx.strokeStyle = `rgba(${CYAN}, ${0.35 * (1 - d / POINTER_DIST)})`;
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(a.x, a.y);
                    ctx.lineTo(pointer.x, pointer.y);
                    ctx.stroke();
                }
            }
        }

        const allGold = now < goldUntil;
        for (const p of particles) {
            const twinkle = reduceMotion ? 0.8 : 0.65 + 0.35 * Math.sin(p.twinkle + now * 0.0012);
            ctx.fillStyle =
                p.gold || allGold ? `rgba(${GOLD}, ${twinkle})` : `rgba(238, 238, 238, ${twinkle * 0.9})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fill();
        }

        if (dragged) {
            ctx.strokeStyle = `rgba(${CYAN}, 0.8)`;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(dragged.x, dragged.y, dragged.r + 5, 0, Math.PI * 2);
            ctx.stroke();
        }

        if (shootingStar) {
            const s = shootingStar;
            const trail = ctx.createLinearGradient(s.x, s.y, s.x - s.vx * 10, s.y - s.vy * 10);
            trail.addColorStop(0, `rgba(238, 238, 238, ${0.9 * s.life})`);
            trail.addColorStop(1, 'rgba(238, 238, 238, 0)');
            ctx.strokeStyle = trail;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(s.x, s.y);
            ctx.lineTo(s.x - s.vx * 10, s.y - s.vy * 10);
            ctx.stroke();
        }

        for (const wave of shockwaves) {
            ctx.strokeStyle = `rgba(${CYAN}, ${wave.energy * 0.5})`;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(wave.x, wave.y, wave.radius, 0, Math.PI * 2);
            ctx.stroke();
        }
    }

    function loop(now) {
        update(now);
        drawFrame(now);
        requestAnimationFrame(loop);
    }

    window.addEventListener('resize', resize);
    resize();

    if (!reduceMotion) {
        const onInteractive = (e) => e.target instanceof Element && e.target.closest('a, h1');
        window.addEventListener('pointermove', (e) => {
            pointer.x = e.clientX;
            pointer.y = e.clientY;
            if (!dragged && !onInteractive(e)) {
                document.body.style.cursor = nearestParticle(e.clientX, e.clientY, GRAB_DIST) ? 'grab' : '';
            }
        });
        window.addEventListener('pointerleave', () => {
            pointer.x = null;
            pointer.y = null;
        });
        window.addEventListener('pointerdown', (e) => {
            if (onInteractive(e)) return;
            pointer.x = e.clientX;
            pointer.y = e.clientY;
            const grabbed = nearestParticle(e.clientX, e.clientY, GRAB_DIST);
            if (grabbed) {
                dragged = grabbed;
                document.body.style.cursor = 'grabbing';
            } else {
                shockwaves.push({ x: e.clientX, y: e.clientY, radius: 0, energy: 1 });
            }
        });
        const release = () => {
            if (!dragged) return;
            const speed = Math.hypot(dragged.vx, dragged.vy);
            const maxFling = 14;
            if (speed > maxFling) {
                dragged.vx *= maxFling / speed;
                dragged.vy *= maxFling / speed;
            }
            dragged = null;
            document.body.style.cursor = '';
        };
        window.addEventListener('pointerup', release);
        window.addEventListener('pointercancel', release);

        const title = document.querySelector('h1');
        if (title) {
            let titleClicks = 0;
            title.addEventListener('click', () => {
                title.classList.remove('glitch');
                void title.offsetWidth; // restart the animation
                title.classList.add('glitch');
                if (++titleClicks >= 5) {
                    titleClicks = 0;
                    supernova(title);
                }
            });
        }

        requestAnimationFrame(loop);
    }
})();
