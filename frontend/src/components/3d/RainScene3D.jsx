import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';

/**
 * Procedural Web Audio API rain sound synthesizer.
 * Generates natural rain sound using pink/brown filtered noise without any external audio files.
 */
class RainAudioSynthesizer {
  constructor() {
    this.ctx = null;
    this.gainNode = null;
    this.isPlaying = false;
  }

  start() {
    if (this.isPlaying) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();

      // Buffer of noise
      const bufferSize = this.ctx.sampleRate * 2;
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        output[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
        output[i] *= 0.04;
        b6 = white * 0.115926;
      }

      const whiteNoise = this.ctx.createBufferSource();
      whiteNoise.buffer = noiseBuffer;
      whiteNoise.loop = true;

      // Lowpass filter for deep rain rumble
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(800, this.ctx.currentTime);

      this.gainNode = this.ctx.createGain();
      this.gainNode.gain.setValueAtTime(0.01, this.ctx.currentTime);
      this.gainNode.gain.exponentialRampToValueAtTime(0.2, this.ctx.currentTime + 1.5);

      whiteNoise.connect(filter);
      filter.connect(this.gainNode);
      this.gainNode.connect(this.ctx.destination);

      whiteNoise.start(0);
      this.isPlaying = true;
    } catch (e) {
      console.warn('AudioContext not allowed without user interaction:', e);
    }
  }

  stop() {
    if (!this.isPlaying || !this.ctx) return;
    try {
      this.gainNode.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.6);
      setTimeout(() => {
        if (this.ctx && this.ctx.state !== 'closed') {
          this.ctx.close();
        }
        this.isPlaying = false;
      }, 700);
    } catch (e) {
      this.isPlaying = false;
    }
  }

  setIntensity(level) {
    if (!this.isPlaying || !this.gainNode || !this.ctx) return;
    const vol = level === 'drizzle' ? 0.08 : level === 'monsoon' ? 0.22 : 0.42;
    this.gainNode.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.2);
  }
}

/**
 * 3D Atmospheric Rain & Glass Window Rivulets Component.
 * - Deep 3D perspective falling rain streaks in Three.js with mouse parallax
 * - Realistic glass window droplets and sliding vertical rivulets matching the user's image
 * - Dynamic lightning flashes illuminating the scene
 * - Weather controls (Intensity: Drizzle / Monsoon / Cloudburst, Lightning on/off, Ambient Audio)
 */
export default function RainScene3D({ mode = 'background', theme = 'dark' }) {
  const containerRef = useRef(null);
  const glassCanvasRef = useRef(null);
  const audioSynthRef = useRef(null);

  const [intensity, setIntensity] = useState('monsoon'); // 'drizzle' | 'monsoon' | 'cloudburst'
  const [dropSize, setDropSize] = useState('huge'); // 'standard' | 'large' | 'huge'
  const [lightningEnabled, setLightningEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [collapsed, setCollapsed] = useState(() => (typeof window !== 'undefined' ? window.innerWidth < 768 : false));

  // Initialize audio synthesizer instance
  useEffect(() => {
    audioSynthRef.current = new RainAudioSynthesizer();
    return () => {
      if (audioSynthRef.current) audioSynthRef.current.stop();
    };
  }, []);

  const toggleAudio = () => {
    if (!audioSynthRef.current) return;
    if (audioEnabled) {
      audioSynthRef.current.stop();
      setAudioEnabled(false);
    } else {
      audioSynthRef.current.start();
      audioSynthRef.current.setIntensity(intensity);
      setAudioEnabled(true);
    }
  };

  const handleIntensityChange = (lvl) => {
    setIntensity(lvl);
    if (audioEnabled && audioSynthRef.current) {
      audioSynthRef.current.setIntensity(lvl);
    }
  };

  /* =========================================================================
     1. THREE.JS 3D RAIN & LIGHTNING ENGINE
     ========================================================================= */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let width = container.clientWidth || window.innerWidth;
    let height = container.clientHeight || window.innerHeight;

    // Scene, Camera, Renderer
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x060a16, 0.0016);

    const camera = new THREE.PerspectiveCamera(60, width / height, 1, 1000);
    camera.position.set(0, 0, 100);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.domElement.style.position = 'absolute';
    renderer.domElement.style.top = '0';
    renderer.domElement.style.left = '0';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.pointerEvents = 'none';
    renderer.domElement.style.zIndex = '0';
    container.appendChild(renderer.domElement);

    // Lights
    const ambientLight = new THREE.AmbientLight(0x1a2638, 1.2);
    scene.add(ambientLight);

    const lightningLight = new THREE.PointLight(0xa5c9ff, 0, 900, 1.2);
    lightningLight.position.set(0, 150, 50);
    scene.add(lightningLight);

    // Rain Particle System
    const count = intensity === 'drizzle' ? 1800 : intensity === 'monsoon' ? 4200 : 8000;
    const dropGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 6); // 2 vertices per line drop
    const velocities = new Float32Array(count);
    const alphas = new Float32Array(count * 2);

    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * 450;
      const y = Math.random() * 400 - 200;
      const z = Math.random() * 300 - 150;
      const len = 3.5 + Math.random() * 5.5;

      const idx = i * 6;
      positions[idx] = x;
      positions[idx + 1] = y;
      positions[idx + 2] = z;

      // Drop end tilted slightly by wind
      positions[idx + 3] = x - 0.8;
      positions[idx + 4] = y - len;
      positions[idx + 5] = z;

      velocities[i] = 2.5 + Math.random() * 3.5;

      alphas[i * 2] = 0.2 + Math.random() * 0.5;
      alphas[i * 2 + 1] = 0.05;
    }

    dropGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    // Custom material for raindrops with dark/light mode tuning
    const isLight = theme === 'light';
    const dropMaterial = new THREE.LineBasicMaterial({
      color: isLight ? 0x2563eb : 0x86b0d9,
      transparent: true,
      opacity: isLight ? 0.35 : 0.55,
      blending: isLight ? THREE.NormalBlending : THREE.AdditiveBlending,
    });

    const rainLines = new THREE.LineSegments(dropGeometry, dropMaterial);
    scene.add(rainLines);

    // Dedicated Big 3D Foreground Drops System
    const bigDropCount = dropSize === 'huge' ? 260 : dropSize === 'large' ? 160 : 60;
    const bigDropGeometry = new THREE.BufferGeometry();
    const bigPositions = new Float32Array(bigDropCount * 6);
    const bigVelocities = new Float32Array(bigDropCount);

    for (let i = 0; i < bigDropCount; i++) {
      const x = (Math.random() - 0.5) * 360;
      const y = Math.random() * 320 - 160;
      const z = 35 + Math.random() * 65; // Closer to camera viewport
      const len = 22 + Math.random() * 26; // Prominent large streak length

      const idx = i * 6;
      bigPositions[idx] = x;
      bigPositions[idx + 1] = y;
      bigPositions[idx + 2] = z;

      bigPositions[idx + 3] = x - 1.2;
      bigPositions[idx + 4] = y - len;
      bigPositions[idx + 5] = z;

      bigVelocities[i] = 4.2 + Math.random() * 4.2;
    }
    bigDropGeometry.setAttribute('position', new THREE.BufferAttribute(bigPositions, 3));

    const bigDropMaterial = new THREE.LineBasicMaterial({
      color: isLight ? 0x0284c7 : 0xe0f2fe,
      transparent: true,
      opacity: isLight ? 0.55 : 0.85,
      blending: isLight ? THREE.NormalBlending : THREE.AdditiveBlending,
    });
    const bigRainLines = new THREE.LineSegments(bigDropGeometry, bigDropMaterial);
    scene.add(bigRainLines);

    // Mouse Parallax
    let mouseX = 0;
    let mouseY = 0;
    let targetCameraX = 0;
    let targetCameraY = 0;

    const handleMouseMove = (e) => {
      mouseX = (e.clientX / window.innerWidth) * 2 - 1;
      mouseY = -(e.clientY / window.innerHeight) * 2 + 1;
      targetCameraX = mouseX * 18;
      targetCameraY = mouseY * 12;
    };
    window.addEventListener('mousemove', handleMouseMove, { passive: true });

    // Lightning Flash Timer
    let lightningTimer = 0;
    let flashStep = 0;
    let nextFlashInterval = 300 + Math.random() * 400; // frames until next strike

    // Animation Loop
    let animId;
    const speedMult = intensity === 'drizzle' ? 0.6 : intensity === 'monsoon' ? 1.0 : 1.6;

    const animate = () => {
      animId = requestAnimationFrame(animate);

      // Smooth camera interpolation
      camera.position.x += (targetCameraX - camera.position.x) * 0.04;
      camera.position.y += (targetCameraY - camera.position.y) * 0.04;
      camera.lookAt(0, 0, 0);

      // Animate background rain streaks
      const pos = dropGeometry.attributes.position.array;
      for (let i = 0; i < count; i++) {
        const v = velocities[i] * speedMult;
        const idx = i * 6;
        pos[idx + 1] -= v;
        pos[idx + 4] -= v;
        pos[idx] -= 0.15 * speedMult;
        pos[idx + 3] -= 0.15 * speedMult;

        // Reset to top when passing bottom
        if (pos[idx + 1] < -180) {
          pos[idx + 1] = 200;
          pos[idx + 4] = 200 - (3.5 + Math.random() * 5.5);
          pos[idx] = (Math.random() - 0.5) * 450;
          pos[idx + 3] = pos[idx] - 0.8;
        }
      }
      dropGeometry.attributes.position.needsUpdate = true;

      // Animate big 3D foreground raindrops
      const bPos = bigDropGeometry.attributes.position.array;
      for (let i = 0; i < bigDropCount; i++) {
        const bv = bigVelocities[i] * speedMult * 1.25;
        const bIdx = i * 6;
        bPos[bIdx + 1] -= bv;
        bPos[bIdx + 4] -= bv;
        bPos[bIdx] -= 0.22 * speedMult;
        bPos[bIdx + 3] -= 0.22 * speedMult;

        if (bPos[bIdx + 1] < -180) {
          bPos[bIdx + 1] = 210;
          bPos[bIdx + 4] = 210 - (22 + Math.random() * 26);
          bPos[bIdx] = (Math.random() - 0.5) * 360;
          bPos[bIdx + 3] = bPos[bIdx] - 1.2;
        }
      }
      bigDropGeometry.attributes.position.needsUpdate = true;

      // Lightning Logic
      if (lightningEnabled) {
        lightningTimer++;
        if (lightningTimer > nextFlashInterval) {
          flashStep++;
          if (flashStep === 1) {
            lightningLight.intensity = 3.5 + Math.random() * 2.0;
            lightningLight.position.x = (Math.random() - 0.5) * 200;
            dropMaterial.opacity = 0.95;
            dropMaterial.color.setHex(0xe0f2fe);
            bigDropMaterial.opacity = 1.0;
          } else if (flashStep === 3) {
            lightningLight.intensity = 0.5;
          } else if (flashStep === 5) {
            // Second double-flash
            lightningLight.intensity = 4.0;
          } else if (flashStep > 8) {
            lightningLight.intensity = 0;
            dropMaterial.opacity = 0.55;
            dropMaterial.color.setHex(0x86b0d9);
            bigDropMaterial.opacity = 0.85;
            lightningTimer = 0;
            flashStep = 0;
            nextFlashInterval = 280 + Math.random() * 600;
          }
        }
      }

      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!container) return;
      width = container.clientWidth || window.innerWidth;
      height = container.clientHeight || window.innerHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('resize', handleResize);
      if (renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
      dropGeometry.dispose();
      dropMaterial.dispose();
      bigDropGeometry.dispose();
      bigDropMaterial.dispose();
    };
  }, [intensity, lightningEnabled, dropSize]);

  /* =========================================================================
     2. FOREGROUND GLASS RAINDROPS & SLIDING RIVULETS (MATCHING USER IMAGE)
     ========================================================================= */
  useEffect(() => {
    const canvas = glassCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    // 1. Static Clinging Droplets (from reference image)
    const staticDrops = [];
    const dropDensity = intensity === 'drizzle' ? 60 : intensity === 'monsoon' ? 120 : 180;
    for (let i = 0; i < dropDensity; i++) {
      staticDrops.push({
        x: Math.random() * width,
        y: Math.random() * height,
        r: 1.5 + Math.random() * 4.5,
        alpha: 0.5 + Math.random() * 0.45,
        wobble: Math.random() * Math.PI * 2,
      });
    }

    // 2. Sliding Rivulets (vertical trickles)
    const rivulets = [];
    const rivuletCount = intensity === 'drizzle' ? 3 : intensity === 'monsoon' ? 7 : 12;
    for (let i = 0; i < rivuletCount; i++) {
      rivulets.push({
        x: (width / (rivuletCount + 1)) * (i + 1) + (Math.random() - 0.5) * 60,
        y: Math.random() * (height * 0.4),
        r: 3.5 + Math.random() * 3.5,
        speed: 0.8 + Math.random() * 1.8,
        path: [],
        maxPath: 45 + Math.floor(Math.random() * 30),
      });
    }

    // 3. SINGLE BIG FALLING DROPS (Physical heavy teardrop raindrops)
    const bigDropCount = dropSize === 'huge' ? 22 : dropSize === 'large' ? 14 : 7;
    const fallingBigDrops = [];

    const resetBigDrop = (d, initial = false) => {
      d.x = 40 + Math.random() * (width - 80);
      d.y = initial ? (Math.random() * -height * 1.4) : (-50 - Math.random() * 120);
      const scale = dropSize === 'huge' ? 1.5 : dropSize === 'large' ? 1.1 : 0.8;
      // Big big radius: 15px to 38px!
      d.r = (14 + Math.random() * 14) * scale;
      d.vy = 1.0 + Math.random() * 1.5;
      d.targetVy = 4.2 + Math.random() * 5.8;
      d.accel = 0.09 + Math.random() * 0.14;
      d.trail = [];
      d.maxTrail = 32 + Math.floor(Math.random() * 20);
      d.pauseTimer = Math.random() < 0.35 ? Math.floor(15 + Math.random() * 35) : 0;
      d.wobble = Math.random() * Math.PI * 2;
      d.wobbleSpeed = 0.06 + Math.random() * 0.08;
    };

    for (let i = 0; i < bigDropCount; i++) {
      const drop = {};
      resetBigDrop(drop, true);
      // Stagger delays so drops fall single single across time
      drop.delay = i * 26 + Math.floor(Math.random() * 20);
      fallingBigDrops.push(drop);
    }

    let animId;

    const renderGlass = () => {
      animId = requestAnimationFrame(renderGlass);
      ctx.clearRect(0, 0, width, height);

      // A. Draw sliding rivulet trails
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      rivulets.forEach((riv) => {
        riv.y += riv.speed;
        riv.x += (Math.random() - 0.5) * 0.4;
        riv.path.push({ x: riv.x, y: riv.y, r: riv.r });
        if (riv.path.length > riv.maxPath) {
          riv.path.shift();
        }

        if (riv.path.length > 2) {
          ctx.beginPath();
          ctx.moveTo(riv.path[0].x, riv.path[0].y);
          for (let p = 1; p < riv.path.length; p++) {
            ctx.lineTo(riv.path[p].x, riv.path[p].y);
          }
          ctx.strokeStyle = 'rgba(180, 205, 235, 0.16)';
          ctx.lineWidth = riv.r * 0.8;
          ctx.stroke();

          ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
          ctx.lineWidth = riv.r * 0.3;
          ctx.stroke();
        }

        ctx.beginPath();
        ctx.arc(riv.x, riv.y, riv.r, 0, Math.PI * 2);
        const dropGrad = ctx.createRadialGradient(
          riv.x - riv.r * 0.3, riv.y - riv.r * 0.3, riv.r * 0.1,
          riv.x, riv.y, riv.r
        );
        dropGrad.addColorStop(0, 'rgba(255, 255, 255, 0.7)');
        dropGrad.addColorStop(0.3, 'rgba(165, 195, 230, 0.45)');
        dropGrad.addColorStop(0.85, 'rgba(20, 35, 60, 0.7)');
        dropGrad.addColorStop(1, 'rgba(5, 12, 25, 0.85)');
        ctx.fillStyle = dropGrad;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(riv.x - riv.r * 0.25, riv.y - riv.r * 0.35, riv.r * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.fill();

        if (riv.y > height + 50) {
          riv.y = -20;
          riv.x = Math.random() * width;
          riv.path = [];
          riv.speed = 0.8 + Math.random() * 2.0;
        }
      });

      // B. Draw static clinging droplets
      staticDrops.forEach((d) => {
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        const g = ctx.createRadialGradient(
          d.x - d.r * 0.3, d.y - d.r * 0.35, d.r * 0.08,
          d.x, d.y, d.r
        );
        g.addColorStop(0, 'rgba(240, 248, 255, 0.75)');
        g.addColorStop(0.35, 'rgba(150, 185, 220, 0.35)');
        g.addColorStop(0.85, 'rgba(15, 28, 48, 0.65)');
        g.addColorStop(1, 'rgba(4, 9, 18, 0.85)');
        ctx.fillStyle = g;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(d.x - d.r * 0.28, d.y - d.r * 0.32, d.r * 0.28, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.fill();
      });

      // C. RENDER SINGLE BIG FALLING DROPS (Bold, physical teardrops)
      fallingBigDrops.forEach((d) => {
        if (d.delay > 0) {
          d.delay--;
          return;
        }

        // Slip-and-stick surface tension physics
        if (d.pauseTimer > 0) {
          d.pauseTimer--;
          d.vy = Math.max(0.4, d.vy * 0.9);
        } else {
          d.vy += d.accel;
          if (d.vy > d.targetVy) d.vy = d.targetVy;
          if (Math.random() < 0.009 && d.y > 80 && d.y < height - 100) {
            d.pauseTimer = Math.floor(18 + Math.random() * 30);
          }
        }

        d.wobble += d.wobbleSpeed;
        d.x += Math.sin(d.wobble) * 0.45;
        d.y += d.vy;

        d.trail.push({ x: d.x, y: d.y, r: d.r });
        if (d.trail.length > d.maxTrail) {
          d.trail.shift();
        }

        // 1. Wet Trail behind the big drop
        if (d.trail.length > 2) {
          ctx.beginPath();
          ctx.moveTo(d.trail[0].x, d.trail[0].y);
          for (let p = 1; p < d.trail.length; p++) {
            ctx.lineTo(d.trail[p].x, d.trail[p].y);
          }
          ctx.strokeStyle = 'rgba(175, 210, 245, 0.22)';
          ctx.lineWidth = d.r * 0.85;
          ctx.lineCap = 'round';
          ctx.stroke();

          ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
          ctx.lineWidth = d.r * 0.32;
          ctx.stroke();

          for (let p = 0; p < d.trail.length; p += 7) {
            const pt = d.trail[p];
            ctx.beginPath();
            ctx.arc(pt.x + (Math.sin(p) * 2), pt.y, d.r * 0.22, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(235, 245, 255, 0.6)';
            ctx.fill();
          }
        }

        // 2. The Big Drop (Teardrop shape)
        const stretch = Math.min(2.4, 1 + d.vy * 0.15);
        const rx = d.r * (1 / Math.sqrt(stretch));
        const ry = d.r * stretch;

        ctx.save();
        ctx.translate(d.x, d.y);

        // Soft contact drop shadow
        ctx.beginPath();
        ctx.ellipse(2, ry * 0.22, rx * 1.1, ry * 1.05, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.fill();

        // Teardrop path: tapered top apex, rounded bulbous bottom
        ctx.beginPath();
        ctx.moveTo(0, -ry * 0.95);
        ctx.bezierCurveTo(-rx * 0.55, -ry * 0.45, -rx * 1.05, ry * 0.2, -rx, ry * 0.55);
        ctx.bezierCurveTo(-rx * 0.95, ry * 1.05, rx * 0.95, ry * 1.05, rx, ry * 0.55);
        ctx.bezierCurveTo(rx * 1.05, ry * 0.2, rx * 0.55, -ry * 0.45, 0, -ry * 0.95);
        ctx.closePath();

        // Fluid refraction gradient
        const dropGrad = ctx.createRadialGradient(
          -rx * 0.3, -ry * 0.25, rx * 0.08,
          0, ry * 0.15, ry * 1.1
        );
        dropGrad.addColorStop(0, 'rgba(255, 255, 255, 0.94)');
        dropGrad.addColorStop(0.22, 'rgba(205, 235, 255, 0.65)');
        dropGrad.addColorStop(0.65, 'rgba(30, 65, 115, 0.6)');
        dropGrad.addColorStop(0.9, 'rgba(10, 22, 45, 0.85)');
        dropGrad.addColorStop(1, 'rgba(4, 10, 24, 0.95)');
        ctx.fillStyle = dropGrad;
        ctx.fill();

        // Meniscus contour
        ctx.strokeStyle = 'rgba(10, 20, 42, 0.9)';
        ctx.lineWidth = 1.8;
        ctx.stroke();

        // Primary specular glint (bright white glare)
        ctx.beginPath();
        ctx.ellipse(-rx * 0.32, -ry * 0.28, rx * 0.32, ry * 0.2, -Math.PI / 6, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.fill();

        // Apex glint
        ctx.beginPath();
        ctx.arc(-rx * 0.08, -ry * 0.55, rx * 0.14, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
        ctx.fill();

        // Bottom internal reflection crescent
        ctx.beginPath();
        ctx.ellipse(0, ry * 0.72, rx * 0.65, ry * 0.2, 0, 0, Math.PI);
        ctx.strokeStyle = 'rgba(190, 230, 255, 0.75)';
        ctx.lineWidth = 2.0;
        ctx.stroke();

        ctx.restore();

        // Reset if off-screen
        if (d.y > height + 80) {
          resetBigDrop(d, false);
          d.delay = Math.floor(12 + Math.random() * 50); // Staggered delay for single single falling!
        }
      });
    };
    renderGlass();

    const handleResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
    };
  }, [intensity, dropSize]);

  return (
    <>
      {/* 3D WebGL Rain & Fog Layer */}
      <div
        ref={containerRef}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          zIndex: 0,
          pointerEvents: 'none',
          overflow: 'hidden',
        }}
      />

      {/* 2D Glass Window Droplets & Trickles Layer (Matching User Image) */}
      <canvas
        ref={glassCanvasRef}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          zIndex: 40,
          pointerEvents: 'none',
        }}
      />

      {/* Floating 3D Storm Atmosphere Controller */}
      <div
        className="storm-atmosphere-controller"
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          zIndex: 200,
          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.09) 0%, rgba(255, 255, 255, 0.02) 100%), rgba(8, 16, 32, 0.62)',
          backdropFilter: 'blur(28px) saturate(1.85)',
          WebkitBackdropFilter: 'blur(28px) saturate(1.85)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          borderTop: '1px solid rgba(255, 255, 255, 0.32)',
          borderRadius: 16,
          padding: collapsed ? '10px 14px' : '16px 20px',
          boxShadow: '0 24px 60px -10px rgba(0, 0, 0, 0.65), 0 0 24px rgba(56, 189, 248, 0.18), inset 0 1px 1px 0 rgba(255, 255, 255, 0.22)',
          color: '#f1f5f9',
          fontFamily: 'system-ui, sans-serif',
          transition: 'all 0.35s cubic-bezier(0.2, 0.8, 0.2, 1)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }} onClick={() => setCollapsed(!collapsed)}>
            <span style={{ fontSize: 16 }}>🌧</span>
            <span style={{ fontWeight: 700, fontSize: 12, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#38bdf8' }}>
              3D Storm Engine
            </span>
          </div>
          <button
            onClick={() => setCollapsed(!collapsed)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#86868b',
              cursor: 'pointer',
              fontSize: 11,
              padding: '2px 4px',
            }}
          >
            {collapsed ? '▲' : '▼'}
          </button>
        </div>

        {!collapsed && (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Rain Intensity Selector */}
            <div>
              <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#94a3b8', marginBottom: 5 }}>
                Precipitation Intensity
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {[
                  { id: 'drizzle', label: 'Drizzle' },
                  { id: 'monsoon', label: 'Monsoon' },
                  { id: 'cloudburst', label: 'Cloudburst' },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleIntensityChange(item.id)}
                    style={{
                      background: intensity === item.id ? 'rgba(56, 189, 248, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                      border: intensity === item.id ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.08)',
                      color: intensity === item.id ? '#38bdf8' : '#94a3b8',
                      fontSize: 11,
                      fontWeight: intensity === item.id ? 700 : 500,
                      padding: '4px 9px',
                      borderRadius: 6,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Droplet Size Selector — boxed + enlarged so it's not missed;
                each button carries a size-scaled 💧 icon as an instant visual cue. */}
            <div
              style={{
                border: '1px solid rgba(56, 189, 248, 0.4)',
                borderRadius: 10,
                padding: '9px 9px 8px',
                background: 'rgba(56, 189, 248, 0.07)',
              }}
            >
              <div style={{ fontSize: 11.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.03em', color: '#38bdf8', marginBottom: 7 }}>
                💧 Droplet Size
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {[
                  { id: 'standard', label: 'Normal', icon: '💧' },
                  { id: 'large', label: 'Big Drops', icon: '💧💧' },
                  { id: 'huge', label: 'Huge Drops', icon: '💧💧💧' },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setDropSize(item.id)}
                    style={{
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 3,
                      background: dropSize === item.id ? 'rgba(56, 189, 248, 0.32)' : 'rgba(255, 255, 255, 0.06)',
                      border: dropSize === item.id ? '1.5px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.1)',
                      color: dropSize === item.id ? '#7dd3fc' : '#94a3b8',
                      fontSize: 11,
                      fontWeight: dropSize === item.id ? 800 : 600,
                      padding: '8px 4px',
                      borderRadius: 8,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      whiteSpace: 'nowrap',
                      boxShadow: dropSize === item.id ? '0 0 14px rgba(56, 189, 248, 0.4)' : 'none',
                    }}
                  >
                    <span style={{ fontSize: 13 }}>{item.icon}</span>
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Lightning & Audio Toggles */}
            <div style={{ display: 'flex', gap: 8, paddingTop: 4, borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
              <button
                onClick={() => setLightningEnabled(!lightningEnabled)}
                style={{
                  flex: 1,
                  background: lightningEnabled ? 'rgba(245, 158, 11, 0.18)' : 'rgba(255, 255, 255, 0.04)',
                  border: lightningEnabled ? '1px solid #f59e0b' : '1px solid rgba(255, 255, 255, 0.08)',
                  color: lightningEnabled ? '#fbbf24' : '#64748b',
                  fontSize: 11,
                  padding: '5px 8px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 5,
                }}
              >
                <span>⚡</span> Lightning {lightningEnabled ? 'ON' : 'OFF'}
              </button>

              <button
                onClick={toggleAudio}
                style={{
                  flex: 1,
                  background: audioEnabled ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.04)',
                  border: audioEnabled ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.08)',
                  color: audioEnabled ? '#38bdf8' : '#64748b',
                  fontSize: 11,
                  padding: '5px 8px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 5,
                }}
                title="Synthesize realistic ambient falling rain sound"
              >
                <span>🔊</span> Rain Audio {audioEnabled ? 'ON' : 'OFF'}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
