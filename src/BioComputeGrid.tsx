import React, {
  useRef,
  useState,
  useMemo,
  useEffect,
  useCallback,
  Suspense,
  lazy,
} from 'react';
import { Canvas, useFrame, useThree, extend } from '@react-three/fiber';
import {
  OrbitControls,
  Html,
  Text,
  shaderMaterial,
  useScroll,
  useAnimations,
  Stage,
  ContactShadows,
  useGLTF,
} from '@react-three/drei';
import {
  EffectComposer,
  Bloom,
  ChromaticAberration,
  Vignette,
  Noise,
} from '@react-three/postprocessing';
import * as THREE from 'three';
import { motion, animate, useMotionValue, useTransform, useSpring, useScroll as useFramerScroll } from 'framer-motion';
import {
  Github,
  Mail,
  Check,
  Loader2,
  Cpu,
  Database,
  Code,
  Terminal,
  ExternalLink,
  Sun,
  Moon,
} from 'lucide-react';

// ==========================================
// CUSTOM SHADERS
// ==========================================

// Fresnel/Rim Glow Shader for Helix Strands
const HelixStrandMaterial = shaderMaterial(
  {
    uTime: 0,
    uColorA: new THREE.Color(0x00f2fe),
    uColorB: new THREE.Color(0x10b981),
    uFresnelPower: 2.5,
    uFresnelIntensity: 1.2,
  },
  /* glsl */ `
    varying vec3 vNormal;
    varying vec3 vWorldPosition;
    uniform float uTime;
    void main() {
      vNormal = normalize(normalMatrix * normal);
      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPos.xyz;
      gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
  `,
  /* glsl */ `
    uniform float uTime;
    uniform vec3 uColorA;
    uniform vec3 uColorB;
    uniform float uFresnelPower;
    uniform float uFresnelIntensity;
    varying vec3 vNormal;
    varying vec3 vWorldPosition;
    void main() {
      vec3 viewDir = normalize(cameraPosition - vWorldPosition);
      float fresnel = pow(1.0 - abs(dot(vNormal, viewDir)), uFresnelPower) * uFresnelIntensity;
      float colorMix = sin(vWorldPosition.y * 2.0 + uTime * 0.5) * 0.5 + 0.5;
      vec3 color = mix(uColorA, uColorB, colorMix);
      float glow = fresnel + sin(vWorldPosition.y * 5.0 - uTime * 2.0) * 0.1 + 0.1;
      gl_FragColor = vec4(color * (1.0 + glow), 1.0);
    }
  `
);

// Scanline/Data Flow Shader for Server Ring
const ServerRingMaterial = shaderMaterial(
  {
    uTime: 0,
    uColor: new THREE.Color(0x94a3b8),
    uGlowColor: new THREE.Color(0x00f2fe),
    uScanSpeed: 0.5,
    uScanWidth: 0.1,
  },
  /* glsl */ `
    varying vec2 vUv;
    varying vec3 vWorldPosition;
    void main() {
      vUv = uv;
      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPos.xyz;
      gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
  `,
  /* glsl */ `
    uniform float uTime;
    uniform vec3 uColor;
    uniform vec3 uGlowColor;
    uniform float uScanSpeed;
    uniform float uScanWidth;
    varying vec2 vUv;
    varying vec3 vWorldPosition;
    void main() {
      float scan = sin(vUv.x * 20.0 - uTime * uScanSpeed) * 0.5 + 0.5;
      float scanline = smoothstep(0.5 - uScanWidth, 0.5 + uScanWidth, scan);
      vec3 color = mix(uColor, uGlowColor, scanline * 0.8);
      float edge = 1.0 - smoothstep(0.0, 0.1, length(vUv - 0.5) * 2.0);
      gl_FragColor = vec4(color * edge, 1.0);
    }
  `
);

extend({ HelixStrandMaterial, ServerRingMaterial });

// ==========================================
// 3D SCENE COMPONENTS
// ==========================================

// Double Helix Component
const DoubleHelix = ({ radius = 1.5, height = 12, turns = 3, strandRadius = 0.08, rungLength = 3.2 }) => {
  const groupRef = useRef<THREE.Group>(null);
  const strandRefs = useRef<THREE.Mesh[]>([]);
  const rungRefs = useRef<THREE.Mesh[]>([]);
  const timeRef = useRef(0);
  const bobRef = useRef(0);

  // Generate helix geometry once
  const helixData = useMemo(() => {
    const strands = [];
    const rungs = [];
    const pointsPerTurn = 64;
    const totalPoints = turns * pointsPerTurn;
    const strandCurve1 = new THREE.CatmullRomCurve3([]);
    const strandCurve2 = new THREE.CatmullRomCurve3([]);

    for (let i = 0; i <= totalPoints; i++) {
      const t = i / totalPoints;
      const angle = t * turns * Math.PI * 2;
      const y = t * height - height / 2;
      const x1 = radius * Math.cos(angle);
      const z1 = radius * Math.sin(angle);
      const x2 = radius * Math.cos(angle + Math.PI);
      const z2 = radius * Math.sin(angle + Math.PI);
      strandCurve1.points.push(new THREE.Vector3(x1, y, z1));
      strandCurve2.points.push(new THREE.Vector3(x2, y, z2));
      if (i % 4 === 0) {
        rungs.push({ y, angle });
      }
    }
    return { strandCurve1, strandCurve2, rungs };
  }, [radius, height, turns]);

  useFrame((state, delta) => {
    timeRef.current += delta;
    bobRef.current = Math.sin(timeRef.current * 0.5) * 0.15;
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.15;
      groupRef.current.position.y = bobRef.current;
    }
  });

  return (
    <group ref={groupRef}>
      <HelixStrandMaterial
        attach="material"
        uTime={timeRef.current}
        uColorA="#00f2fe"
        uColorB="#10b981"
        uFresnelPower={2.5}
        uFresnelIntensity={1.2}
      />
      {/* Strand 1 */}
      <mesh
        geometry={new THREE.TubeGeometry(helixData.strandCurve1, helixData.strandCurve1.points.length * 2, strandRadius, 8, false)}
        material={HelixStrandMaterial}
        castShadow
        receiveShadow
      />
      {/* Strand 2 */}
      <mesh
        geometry={new THREE.TubeGeometry(helixData.strandCurve2, helixData.strandCurve2.points.length * 2, strandRadius, 8, false)}
        material={HelixStrandMaterial}
        castShadow
        receiveShadow
      />
      {/* Base Pair Rungs */}
      {helixData.rungs.map((rung, i) => (
        <mesh
          key={i}
          geometry={new THREE.CylinderGeometry(0.02, 0.02, rungLength, 6)}
          material={new THREE.MeshStandardMaterial({
            color: i % 2 === 0 ? '#00f2fe' : '#10b981',
            emissive: i % 2 === 0 ? '#00f2fe' : '#10b981',
            emissiveIntensity: 0.6,
            transparent: true,
            opacity: 0.9,
          })}
          position={[0, rung.y, 0]}
          rotation={[0, rung.angle, Math.PI / 2]}
          castShadow
          receiveShadow
        />
      ))}
    </group>
  );
};

// Server Ring Component
const ServerRing = ({ count = 24, ringRadius = 5, boxSize = 0.6 }) => {
  const dummy = useRef(new THREE.Object3D()).current;
  const timeRef = useRef(0);
  const meshRef = useRef<THREE.InstancedMesh>(null);

  // Set each instance's base transform once on mount
  useEffect(() => {
    if (!meshRef.current) return;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      dummy.position.set(
        Math.cos(angle) * ringRadius,
        (Math.random() - 0.5) * 2,
        Math.sin(angle) * ringRadius
      );
      dummy.lookAt(0, dummy.position.y, 0);
      dummy.rotation.y += Math.PI / 2;
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [count, ringRadius, dummy]);

  useFrame((state, delta) => {
    timeRef.current += delta;
    if (meshRef.current) {
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        const phase = (i / count) * Math.PI * 2;
        const intensity = 0.3 + Math.sin(timeRef.current * 2 + phase) * 0.3;
        dummy.position.set(
          Math.cos(angle) * ringRadius,
          (Math.random() - 0.5) * 0.001 + Math.sin(timeRef.current + i) * 0.05,
          Math.sin(angle) * ringRadius
        );
        dummy.lookAt(0, dummy.position.y, 0);
        dummy.rotation.y += Math.PI / 2;
        dummy.scale.setScalar(0.9 + intensity * 0.2);
        dummy.updateMatrix();
        meshRef.current.setMatrixAt(i, dummy.matrix);
      }
      meshRef.current.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]} castShadow receiveShadow>
      <boxGeometry args={[boxSize, boxSize * 1.5, boxSize * 0.8]} />
      <meshStandardMaterial
        color="#1e293b"
        metalness={0.7}
        roughness={0.3}
        emissive="#00f2fe"
        emissiveIntensity={0.2}
      />
    </instancedMesh>
  );
};

// Particle Field Component
const ParticleField = ({ count = 800, radius = 15 }) => {
  const timeRef = useRef(0);
  const mouseRef = useRef(new THREE.Vector2(0, 0));
  const repelRadius = 2.5;
  const repelStrength = 0.15;
  const springStrength = 0.02;
  const damping = 0.98;

  // Build buffers synchronously (useMemo) so the first render always has valid arrays
  const { positions, velocities, homePositions, colors, sizes } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const homePositions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const phi = Math.acos(2 * Math.random() - 1);
      const theta = Math.random() * Math.PI * 2;
      const r = radius * Math.cbrt(Math.random());
      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta);
      const z = r * Math.cos(phi);
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
      homePositions[i * 3] = x;
      homePositions[i * 3 + 1] = y;
      homePositions[i * 3 + 2] = z;
      velocities[i * 3] = (Math.random() - 0.5) * 0.01;
      velocities[i * 3 + 1] = (Math.random() - 0.5) * 0.01;
      velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.01;
      colors[i * 3] = 0;
      colors[i * 3 + 1] = 1;
      colors[i * 3 + 2] = 0.5;
      sizes[i] = 0.02 + Math.random() * 0.03;
    }

    return { positions, velocities, homePositions, colors, sizes };
  }, [count, radius]);

  const positionsRef = useRef(positions);
  const velocitiesRef = useRef(velocities);
  const homePositionsRef = useRef(homePositions);
  const colorsRef = useRef(colors);
  const sizesRef = useRef(sizes);

  useFrame((state, delta) => {
    timeRef.current += delta;
    const { camera, raycaster, scene } = state;
    const positions = positionsRef.current;
    const velocities = velocitiesRef.current;
    const homePositions = homePositionsRef.current;
    const colors = colorsRef.current;
    const sizes = sizesRef.current;

    if (!positions) return;

    // Raycast mouse to plane
    raycaster.setFromCamera(mouseRef.current, camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const intersectPoint = new THREE.Vector3();
    raycaster.ray.intersectPlane(plane, intersectPoint);

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const px = positions[i3];
      const py = positions[i3 + 1];
      const pz = positions[i3 + 2];

      // Drift noise
      const noiseX = Math.sin(timeRef.current * 0.3 + i * 0.1) * 0.005;
      const noiseY = Math.cos(timeRef.current * 0.2 + i * 0.15) * 0.005;
      const noiseZ = Math.sin(timeRef.current * 0.25 + i * 0.05) * 0.005;

      // Mouse repel
      let repelX = 0, repelY = 0, repelZ = 0;
      const dx = px - intersectPoint.x;
      const dy = py - intersectPoint.y;
      const dz = pz - intersectPoint.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < repelRadius && dist > 0.001) {
        const force = (repelRadius - dist) / repelRadius * repelStrength;
        repelX = (dx / dist) * force;
        repelY = (dy / dist) * force;
        repelZ = (dz / dist) * force;
      }

      // Spring back to home
      const hx = homePositions[i3] - px;
      const hy = homePositions[i3 + 1] - py;
      const hz = homePositions[i3 + 2] - pz;
      const springX = hx * springStrength;
      const springY = hy * springStrength;
      const springZ = hz * springStrength;

      velocities[i3] = (velocities[i3] + noiseX + repelX + springX) * damping;
      velocities[i3 + 1] = (velocities[i3 + 1] + noiseY + repelY + springY) * damping;
      velocities[i3 + 2] = (velocities[i3 + 2] + noiseZ + repelZ + springZ) * damping;

      positions[i3] += velocities[i3];
      positions[i3 + 1] += velocities[i3 + 1];
      positions[i3 + 2] += velocities[i3 + 2];

      // Color interpolation
      const colorPhase = (Math.sin(timeRef.current * 0.5 + i * 0.01) + 1) * 0.5;
      colors[i3] = 0 * (1 - colorPhase) + 0 * colorPhase; // R
      colors[i3 + 1] = 1 * (1 - colorPhase) + 0.6 * colorPhase; // G
      colors[i3 + 2] = 0.5 * (1 - colorPhase) + 1 * colorPhase; // B

      // Size pulse
      sizes[i] = 0.02 + Math.sin(timeRef.current * 1.5 + i * 0.1) * 0.01 + 0.01;
    }

    // Update buffer attributes
    const geometry = state.scene.getObjectByName('particles')?.geometry;
    if (geometry) {
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.color.needsUpdate = true;
      geometry.attributes.size.needsUpdate = true;
    }
  });

  return (
    <points name="particles">
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positionsRef.current, 3]} usage={THREE.DynamicDrawUsage} />
        <bufferAttribute attach="attributes-color" args={[colorsRef.current, 3]} usage={THREE.DynamicDrawUsage} />
        <bufferAttribute attach="attributes-size" args={[sizesRef.current, 1]} usage={THREE.DynamicDrawUsage} />
      </bufferGeometry>
      <pointsMaterial
        vertexColors
        size={0.05}
        sizeAttenuation
        transparent
        opacity={0.8}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
};

// Main 3D Scene
const CanvasScene = ({
  cameraTarget,
  isMobile,
  onMouseMove,
}) => {
  const { camera, scene, gl } = useThree();
  const timeRef = useRef(0);
  const pointLightRef = useRef<THREE.PointLight>(null);
  const rimLightRef = useRef<THREE.PointLight>(null);

  useFrame((state, delta) => {
    timeRef.current += delta;
    // Animate point light color
    if (pointLightRef.current) {
      const hue = (Math.sin(timeRef.current * 0.2) + 1) * 0.5;
      pointLightRef.current.color.setHSL(0.5 + hue * 0.1, 1, 0.5);
    }
  });

  return (
    <>
      <color attach="background" args={['#0b0f19']} />
      <fog attach="fog" args={['#0b0f19', 20, 60]} />
      {/* Lights */}
      <ambientLight color="#1e293b" intensity={0.3} />
      <directionalLight
        position={[10, 15, 10]}
        color="#ffffff"
        intensity={1.2}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={1}
        shadow-camera-far={50}
        shadow-camera-left={-15}
        shadow-camera-right={15}
        shadow-camera-top={15}
        shadow-camera-bottom={-15}
      />
      <pointLight
        ref={pointLightRef}
        position={[0, 0, 0]}
        color="#00f2fe"
        intensity={1.5}
        distance={30}
        decay={2}
      />
      <pointLight
        ref={rimLightRef}
        position={[0, 0, -10]}
        color="#10b981"
        intensity={0.8}
        distance={30}
        decay={2}
      />
      {/* Scene Objects */}
      <DoubleHelix />
      <ServerRing count={isMobile ? 12 : 24} />
      <ParticleField count={isMobile ? 300 : 800} />
      {/* Post Processing */}
      <EffectComposer multisampling={8}>
        <Bloom
          intensity={1.2}
          luminanceThreshold={0.8}
          luminanceSmoothing={0.025}
          mipmapBlur={true}
        />
        <ChromaticAberration offset={[0.002, 0.002]} />
        <Vignette eskil={false} offset={0.3} darkness={1.2} />
        <Noise opacity={0.02} />
      </EffectComposer>
    </>
  );
};

// ==========================================
// UI COMPONENTS
// ==========================================

const Header = ({ activeSection, setActiveSection, scrollToSection }) => {
  const navLinks = [
    { id: 'about', label: 'About' },
    { id: 'skills', label: 'Skills' },
    { id: 'projects', label: 'Projects' },
    { id: 'contact', label: 'Contact' },
  ];

  return (
    <header className="fixed top-0 left-0 right-0 z-50 px-6 py-4">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">System Online</span>
        </div>
        <nav className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <button
              key={link.id}
              onClick={() => scrollToSection(link.id)}
              className={`relative px-2 py-1 text-sm font-medium transition-colors ${
                activeSection === link.id
                  ? 'text-cyan-400'
                  : 'text-slate-400 hover:text-cyan-400'
              }`}
            >
              {link.label}
              {activeSection === link.id && (
                <motion.div
                  layoutId="navIndicator"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-400 rounded-full"
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                />
              )}
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-4">
          <a
            href="https://github.com/maneesh22122005-hub/biopulse-hud-agar-analytics"
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-lg bg-slate-800/50 border border-slate-700 text-slate-300 hover:border-cyan-500 hover:text-cyan-400 transition-all"
            aria-label="GitHub"
          >
            <Github className="w-5 h-5" />
          </a>
        </div>
      </div>
    </header>
  );
};

const Hero = ({
  onExploreClick,
  isReducedMotion,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const subtitleRef = useRef<HTMLParagraphElement>(null);
  const locationRef = useRef<HTMLParagraphElement>(null);
  const ctaRef = useRef<HTMLButtonElement>(null);
  const githubRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (isReducedMotion) return;
    const elements = [titleRef.current, subtitleRef.current, locationRef.current, ctaRef.current, githubRef.current].filter(
      (el): el is HTMLElement => el !== null
    );
    const ctx = animate(
      elements,
      { opacity: [0, 1], y: [20, 0] },
      { duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: (i: number) => i * 0.1 }
    );
    return () => ctx.stop();
  }, [isReducedMotion]);

  return (
    <section id="hero" className="relative min-h-screen flex items-center justify-center px-6 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-radial from-cyan-500/10 via-transparent to-emerald-500/10" />
      <div className="relative z-10 max-w-4xl text-center">
        <motion.h1
          ref={titleRef}
          className="text-5xl md:text-7xl font-bold tracking-tight text-white mb-6"
          style={{ opacity: isReducedMotion ? 1 : 0 }}
        >
          Maneesh B
        </motion.h1>
        <motion.p
          ref={subtitleRef}
          className="text-xl md:text-2xl text-slate-300 mb-4 max-w-2xl mx-auto"
          style={{ opacity: isReducedMotion ? 1 : 0 }}
        >
          Machine Learning &amp; High-Performance Computing (HPC) | Computational Biology
        </motion.p>
        <motion.p
          ref={locationRef}
          className="text-lg text-slate-500 mb-10 font-mono"
          style={{ opacity: isReducedMotion ? 1 : 0 }}
        >
          Kasaragod, Kerala, India | SSSIHL
        </motion.p>
        <motion.div
          ref={ctaRef}
          className="flex items-center justify-center gap-6"
          style={{ opacity: isReducedMotion ? 1 : 0 }}
        >
          <motion.button
            onClick={onExploreClick}
            whileHover={{ scale: 1.02, boxShadow: '0 0 30px rgba(0, 242, 254, 0.4)' }}
            whileTap={{ scale: 0.98 }}
            className="px-8 py-3 rounded-lg bg-gradient-to-r from-cyan-500 to-emerald-500 text-slate-950 font-semibold text-lg shadow-lg shadow-cyan-500/25 transition-all"
          >
            Explore Compute Grid
          </motion.button>
          <motion.a
            ref={githubRef}
            href="https://github.com/maneesh22122005-hub/biopulse-hud-agar-analytics"
            target="_blank"
            rel="noopener noreferrer"
            whileHover={{ scale: 1.1, rotate: 10 }}
            whileTap={{ scale: 0.9 }}
            className="p-3 rounded-lg bg-slate-800/50 border border-slate-700 text-slate-300 hover:border-cyan-500 hover:text-cyan-400 transition-all"
            aria-label="View GitHub Repository"
          >
            <Github className="w-6 h-6" />
          </motion.a>
        </motion.div>
      </div>
      <motion.div
        className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-slate-500"
        animate={{ y: [0, 10] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
      >
        <span className="text-xs font-mono uppercase tracking-wider">Scroll to Initialize</span>
        <motion.div
          className="w-1 h-6 bg-gradient-to-b from-cyan-500 to-transparent rounded-full"
          animate={{ scaleY: [1, 0.3, 1] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
        />
      </motion.div>
    </section>
  );
};

const SkillCard = ({ title, description, icon: Icon, index, isReducedMotion }) => {
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useTransform(y, [-100, 100], ['10deg', '-10deg']);
  const rotateY = useTransform(x, [-100, 100], ['-10deg', '10deg']);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isReducedMotion) return;
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    x.set((e.clientX - centerX) / (rect.width / 2) * 20);
    y.set((e.clientY - centerY) / (rect.height / 2) * 20);
  };

  const handleMouseLeave = () => {
    if (isReducedMotion) return;
    x.set(0);
    y.set(0);
  };

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        transform: `perspective(1000px) rotateX(${rotateX.get()}deg) rotateY(${rotateY.get()}deg)`,
        transformStyle: 'preserve-3d',
      }}
      className="group relative p-8 bg-slate-900/50 backdrop-blur-lg border border-slate-800 rounded-2xl overflow-hidden transition-all duration-300 hover:border-cyan-500/50"
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 to-emerald-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-500 to-emerald-500 transform scale-x-0 group-hover:scale-x-100 origin-left transition-transform duration-500" />
      <div className="relative z-10">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500/20 to-emerald-500/20 flex items-center justify-center mb-6">
          <Icon className="w-6 h-6 text-cyan-400" />
        </div>
        <h3 className="text-xl font-semibold text-white mb-3">{title}</h3>
        <p className="text-slate-400 leading-relaxed">{description}</p>
      </div>
    </motion.div>
  );
};

const SkillsGrid = ({ isReducedMotion }) => {
  const skills = [
    {
      title: 'Computational Biology & Bioinformatics',
      description: 'Sequence processing, structural analysis, statistical modeling (Python, R)',
      icon: Database,
    },
    {
      title: 'High-Performance Computing (HPC)',
      description: 'SLURM workload manager, Linux shell, cluster scheduling & scaling',
      icon: Cpu,
    },
    {
      title: 'Machine Learning & AI',
      description: 'Model training, distributed data preprocessing, predictive analytics',
      icon: Code,
    },
  ];

  return (
    <section id="skills" className="py-24 px-6 bg-slate-950/50">
      <div className="max-w-7xl mx-auto">
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">Core Competencies</h2>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto">
            Specialized expertise at the intersection of computational biology, high-performance computing, and machine learning infrastructure.
          </p>
        </motion.div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {skills.map((skill, index) => (
            <SkillCard key={skill.title} {...skill} index={index} isReducedMotion={isReducedMotion} />
          ))}
        </div>
      </div>
    </section>
  );
};

const ProjectHighlight = ({ isReducedMotion }) => {
  const [copied, setCopied] = useState(false);
  const terminalLines = useRef<string[]>([
    '> Initializing BioPulse HUD...',
    '> Loading Agar Analytics Module...',
    '> Establishing SLURM connection...',
    '> Cluster nodes: 42 active',
    '> GPU utilization: 87%',
    '> Processing genomic batch #1247...',
    '> Alignment complete: 99.2% accuracy',
    '> Writing results to distributed FS...',
    '> Awaiting next workload...',
  ]);
  const [displayLines, setDisplayLines] = useState<string[]>([]);
  const lineIndex = useRef(0);

  useEffect(() => {
    if (isReducedMotion) {
      setDisplayLines(terminalLines.current);
      return;
    }
    const interval = setInterval(() => {
      if (lineIndex.current < terminalLines.current.length) {
        setDisplayLines(prev => [...prev, terminalLines.current[lineIndex.current]]);
        lineIndex.current++;
      } else {
        lineIndex.current = 0;
        setDisplayLines([]);
      }
    }, 800);
    return () => clearInterval(interval);
  }, [isReducedMotion]);

  const copyEmail = async () => {
    await navigator.clipboard.writeText('maneesh.b@sssihl.edu.in');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section id="projects" className="py-24 px-6 bg-slate-950/50">
      <div className="max-w-7xl mx-auto">
        <motion.div
          className="grid lg:grid-cols-2 gap-12 items-start"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">Featured Project</span>
            </div>
            <h2 className="text-4xl md:text-5xl font-bold text-white leading-tight">
              BioPulse HUD &amp; Agar Analytics
            </h2>
            <p className="text-lg text-slate-300 leading-relaxed">
              A real-time computational biology dashboard for high-throughput genomic analysis on HPC clusters.
              Integrates SLURM job monitoring, live sequence alignment visualization, and distributed data aggregation.
            </p>
            <div className="flex flex-wrap gap-3 mt-6">
              {['Python', 'R', 'SLURM', 'Bio-Analytics', 'MPI', 'Docker'].map((tag) => (
                <span
                  key={tag}
                  className="px-3 py-1 rounded-full text-xs font-medium bg-slate-800 border border-slate-700 text-slate-300 hover:border-cyan-500 hover:text-cyan-400 transition-all"
                >
                  {tag}
                </span>
              ))}
            </div>
            <motion.a
              href="https://github.com/maneesh22122005-hub/biopulse-hud-agar-analytics"
              target="_blank"
              rel="noopener noreferrer"
              whileHover={{ x: 4 }}
              whileTap={{ scale: 0.98 }}
              className="inline-flex items-center gap-2 mt-8 px-6 py-3 rounded-lg bg-gradient-to-r from-cyan-500 to-emerald-500 text-slate-950 font-semibold transition-all"
            >
              View Repository
              <ExternalLink className="w-4 h-4" />
            </motion.a>
          </div>
          <div className="relative">
            <div className="bg-slate-900/80 backdrop-blur-lg border border-slate-800 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 bg-slate-950 border-b border-slate-800 flex items-center gap-2">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-500" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500" />
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                </div>
                <span className="text-xs font-mono text-slate-500 ml-4">~/biopulse-hud/terminal</span>
              </div>
              <div className="p-4 font-mono text-sm text-slate-300 h-96 overflow-y-auto bg-slate-950">
                {displayLines.map((line, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="mb-1"
                  >
                    <span className="text-cyan-400">{line}</span>
                  </motion.div>
                ))}
                <motion.div
                  className="flex items-center gap-1"
                  animate={{ opacity: [1, 0, 1] }}
                  transition={{ duration: 1, repeat: Infinity }}
                >
                  <span className="text-cyan-400">{'>'}_</span>
                </motion.div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

const Footer = () => {
  const [copied, setCopied] = useState(false);
  const email = 'maneesh.b@sssihl.edu.in';

  const copyEmail = async () => {
    await navigator.clipboard.writeText(email);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <footer id="contact" className="py-24 px-6 bg-slate-950 border-t border-slate-800">
      <div className="max-w-7xl mx-auto">
        <motion.div
          className="text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="inline-flex items-center gap-4 px-8 py-6 rounded-2xl bg-slate-900/50 backdrop-blur-lg border border-slate-800 mb-8">
            <Mail className="w-6 h-6 text-cyan-400" />
            <div className="text-left">
              <p className="text-sm text-slate-500 font-mono">Open to research collaborations</p>
              <p className="text-lg font-medium text-white">ML Infrastructure, HPC, Scalable AI</p>
            </div>
          </div>
          <motion.button
            onClick={copyEmail}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="inline-flex items-center gap-3 px-6 py-3 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:border-cyan-500 hover:text-cyan-400 transition-all"
          >
            <Mail className="w-5 h-5" />
            <span className="font-mono">{copied ? 'Copied!' : email}</span>
            {copied && <Check className="w-5 h-5 text-emerald-500" />}
          </motion.button>
          <p className="mt-10 text-sm text-slate-500">
            Built with React Three Fiber, Framer Motion, and Tailwind CSS
          </p>
        </motion.div>
      </div>
    </footer>
  );
};

// ==========================================
// MAIN COMPONENT
// ==========================================

const BioComputeGrid = () => {
  const [activeSection, setActiveSection] = useState('hero');
  const [isMobile, setIsMobile] = useState(false);
  const [isReducedMotion, setIsReducedMotion] = useState(false);
  const [cameraState, setCameraState] = useState<'idle' | 'zooming-in' | 'settled'>('idle');
  const cameraTargetRef = useRef({ x: 0, y: 0, z: 25, fov: 50 });
  const scrollProgressRef = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Check for reduced motion preference
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setIsReducedMotion(mediaQuery.matches);
    const handler = (e: MediaQueryListEvent) => setIsReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  // Mobile check
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Intersection Observer for active section
  useEffect(() => {
    const sections = ['hero', 'about', 'skills', 'projects', 'contact'];
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        });
      },
      { rootMargin: '-20% 0px -60% 0px', threshold: 0 }
    );
    sections.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  // Smooth scroll to section
  const scrollToSection = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);

  // Handle Explore Compute Grid click
  const handleExploreClick = useCallback(() => {
    setCameraState('zooming-in');
    // Scroll to about section after zoom starts
    setTimeout(() => scrollToSection('about'), 500);
  }, [scrollToSection]);

  // Camera animation logic
  useFrame((state, delta) => {
    const { camera } = state;
    const target = cameraTargetRef.current;

    if (cameraState === 'zooming-in') {
      // Dolly in to helix core
      target.z = THREE.MathUtils.lerp(target.z, 4, delta * 3);
      target.fov = THREE.MathUtils.lerp(target.fov, 30, delta * 3);
      if (Math.abs(target.z - 4) < 0.1) {
        setCameraState('settled');
      }
    } else if (cameraState === 'settled') {
      // Pull back to reveal full scene
      target.z = THREE.MathUtils.lerp(target.z, 25, delta * 2);
      target.fov = THREE.MathUtils.lerp(target.fov, 50, delta * 2);
      if (Math.abs(target.z - 25) < 0.1) {
        setCameraState('idle');
      }
    } else {
      // Idle parallax based on scroll
      const scrollY = window.scrollY;
      const maxScroll = document.body.scrollHeight - window.innerHeight;
      scrollProgressRef.current = THREE.MathUtils.lerp(
        scrollProgressRef.current,
        scrollY / maxScroll,
        delta * 5
      );
      const progress = scrollProgressRef.current;
      target.x = Math.sin(progress * Math.PI * 2) * 2;
      target.y = Math.cos(progress * Math.PI) * 1;
    }

    // Apply camera target
    camera.position.lerp(new THREE.Vector3(target.x, target.y, target.z), delta * 5);
    camera.fov = THREE.MathUtils.lerp(camera.fov, target.fov, delta * 5);
    camera.updateProjectionMatrix();
  });

  // Mouse move handler for particle repel
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const x = (e.clientX / window.innerWidth) * 2 - 1;
    const y = -(e.clientY / window.innerHeight) * 2 + 1;
    // This will be passed to ParticleField via context or state
    // For simplicity, we'll use a global ref in ParticleField
  }, []);

  return (
    <div className="relative min-h-screen bg-slate-950 text-white overflow-x-hidden">
      {/* 3D Canvas */}
      <div className="fixed inset-0 z-0" style={{ touchAction: 'none' }}>
        <Canvas
          ref={canvasRef}
          camera={{ position: [0, 0, 25], fov: 50 }}
          gl={{ antialias: true, alpha: true, preserveDrawingBuffer: false }}
          dpr={[1, 2]}
          performance={{ min: 0.5 }}
          onPointerMove={handleMouseMove}
          shadows
          shadowMapType={THREE.PCFSoftShadowMap}
        >
          <Suspense fallback={null}>
            <CanvasScene
              isMobile={isMobile}
              onMouseMove={handleMouseMove}
            />
          </Suspense>
          <OrbitControls
            enableZoom={false}
            enablePan={false}
            enableDamping
            dampingFactor={0.05}
            minPolarAngle={0.2}
            maxPolarAngle={Math.PI - 0.2}
            autoRotate={false}
          />
        </Canvas>
      </div>

      {/* DOM Overlay */}
      <div className="relative z-10">
        <Header
          activeSection={activeSection}
          setActiveSection={setActiveSection}
          scrollToSection={scrollToSection}
        />
        <main>
          <Hero
            onExploreClick={handleExploreClick}
            isReducedMotion={isReducedMotion}
          />
          <section id="about" className="py-24 px-6 bg-slate-950/50">
            <div className="max-w-7xl mx-auto">
              <motion.div
                className="prose prose-invert max-w-3xl mx-auto text-center"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              >
                <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">About</h2>
                <p className="text-lg text-slate-300 leading-relaxed mb-6">
                  I'm a Computational Biologist and HPC Engineer specializing in building scalable machine learning
                  infrastructure for genomic data analysis. My work sits at the intersection of high-performance computing,
                  bioinformatics, and distributed systems.
                </p>
                <p className="text-lg text-slate-300 leading-relaxed mb-6">
                  Currently researching at SSSIHL, focusing on optimizing distributed training workflows for large-scale
                  biological sequence models on SLURM-managed clusters. Passionate about open-source tooling for
                  computational biology and reproducible research practices.
                </p>
                <div className="flex flex-wrap justify-center gap-4 mt-8">
                  <span className="px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 text-sm">
                    Python / R / C++
                  </span>
                  <span className="px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 text-sm">
                    SLURM / MPI / Kubernetes
                  </span>
                  <span className="px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 text-sm">
                    PyTorch / JAX / TensorFlow
                  </span>
                  <span className="px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 text-sm">
                    Nextflow / Snakemake
                  </span>
                </div>
              </motion.div>
            </div>
          </section>
          <SkillsGrid isReducedMotion={isReducedMotion} />
          <ProjectHighlight isReducedMotion={isReducedMotion} />
        </main>
        <Footer />
      </div>
    </div>
  );
};

export default BioComputeGrid;
