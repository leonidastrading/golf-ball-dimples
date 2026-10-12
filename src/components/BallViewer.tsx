import { Canvas } from '@react-three/fiber';
import { Environment, Lightformer, OrbitControls } from '@react-three/drei';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { DimpleLayout, ProfileOpts } from '../model/layout';
import type { MeshRequest, MeshResult } from '../geometry/ballMesh';
import { buildWireframe } from '../geometry/wireframe';

interface Props {
  layout: DimpleLayout;
  opts: ProfileOpts;
  resolution: number;
  exaggeration: number;
  colorMode: 'white' | 'depth';
  autoRotate: boolean;
  showAxis: boolean;
  smooth: boolean;
  matte: boolean;
  wireframe: boolean;
  spinAxisDeg: number;
}

function useBallGeometry(p: Props) {
  const [geom, setGeom] = useState<THREE.BufferGeometry | null>(null);
  const [busy, setBusy] = useState(false);
  const worker = useRef<Worker | null>(null);
  const pending = useRef<MeshRequest | null>(null);
  const inflight = useRef(false);
  const seq = useRef(0);

  useEffect(() => {
    const w = new Worker(new URL('../geometry/ball.worker.ts', import.meta.url), { type: 'module' });
    worker.current = w;
    w.onmessage = (e: MessageEvent<MeshResult>) => {
      const r = e.data;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(r.positions, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(r.normals, 3));
      g.setAttribute('color', new THREE.BufferAttribute(r.colors, 3));
      g.setIndex(new THREE.BufferAttribute(r.index, 1));
      g.computeBoundingSphere();
      setGeom((old) => { old?.dispose(); return g; });
      inflight.current = false;
      if (pending.current) {
        const next = pending.current;
        pending.current = null;
        inflight.current = true;
        w.postMessage(next);
      } else setBusy(false);
    };
    return () => w.terminate();
  }, []);

  useEffect(() => {
    const L = p.layout;
    const req: MeshRequest = {
      id: ++seq.current,
      res: p.resolution,
      total: L.total,
      centers: L.centers,
      axes: L.axes,
      radii: L.radii,
      depths: L.depths,
      isMicro: L.isMicro,
      kinds: L.kinds,
      opts: { shape: p.opts.shape, wallSteepness: p.opts.wallSteepness, innerRatio: p.opts.innerRatio, islandRatio: p.opts.islandRatio },
      exaggeration: p.exaggeration,
      colorMode: p.colorMode,
      smooth: p.smooth,
    };
    const w = worker.current;
    if (!w) return;
    setBusy(true);
    if (inflight.current) pending.current = req;
    else { inflight.current = true; w.postMessage(req); }
  }, [p.layout, p.opts.shape, p.opts.wallSteepness, p.opts.innerRatio, p.opts.islandRatio, p.resolution, p.exaggeration, p.colorMode, p.smooth]);

  return { geom, busy };
}

function SpinAxis({ tiltDeg }: { tiltDeg: number }) {
  // ball "pole" axis is z; when shown, rotate so it reads as the backspin axis (horizontal, tilted)
  const t = (tiltDeg * Math.PI) / 180;
  return (
    <group rotation={[0, 0, -t]}>
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.008, 0.008, 2.8, 12]} />
        <meshBasicMaterial color="#d95926" />
      </mesh>
      <mesh position={[1.42, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <coneGeometry args={[0.035, 0.1, 16]} />
        <meshBasicMaterial color="#d95926" />
      </mesh>
    </group>
  );
}

function Wireframe({ layout, opts, exaggeration }: Pick<Props, 'layout' | 'opts' | 'exaggeration'>) {
  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(buildWireframe(layout, opts, exaggeration), 3));
    return g;
  }, [layout, opts, exaggeration]);
  useEffect(() => () => geom.dispose(), [geom]);
  return (
    <lineSegments geometry={geom}>
      <lineBasicMaterial color="#d8343a" transparent opacity={0.85} />
    </lineSegments>
  );
}

export function BallViewer(p: Props) {
  const { geom, busy } = useBallGeometry(p);
  return (
    <div className="viewer">
      <Canvas frameloop={p.autoRotate ? "always" : "demand"} camera={{ position: [0, 0.4, 3.1], fov: 38, near: 0.01, far: 50 }} dpr={[1, 2]} gl={{ antialias: true }}>
        <color attach="background" args={[p.wireframe ? '#f4f4f2' : '#121211']} />
        <ambientLight intensity={0.15} />
        <directionalLight position={[3, 4, 5]} intensity={1.6} />
        <directionalLight position={[-4, -1, -2]} intensity={0.35} />
        <Environment resolution={256}>
          <Lightformer form="rect" intensity={2.2} position={[0, 4, 2]} scale={[6, 2, 1]} />
          <Lightformer form="rect" intensity={1.2} position={[-4, 0, 1]} scale={[2, 4, 1]} />
          <Lightformer form="ring" intensity={0.8} position={[4, 1, -2]} scale={2} />
        </Environment>
        {/* map the ball's polar axis (z) onto x: horizontal, along the backspin axis, as a Polara is teed */}
        <group rotation={[0, Math.PI / 2, 0]}>
          {geom && (
            <mesh geometry={geom}>
              {p.wireframe ? (
                <meshStandardMaterial color="#f7f7f5" roughness={0.9} metalness={0} envMapIntensity={0.35} />
              ) : p.matte ? (
                <meshStandardMaterial vertexColors roughness={0.95} metalness={0} envMapIntensity={0.25} />
              ) : (
                <meshPhysicalMaterial vertexColors roughness={0.42} clearcoat={0.6} clearcoatRoughness={0.25} envMapIntensity={0.6} />
              )}
            </mesh>
          )}
          {p.wireframe && <Wireframe layout={p.layout} opts={p.opts} exaggeration={p.exaggeration} />}
        </group>
        {p.showAxis && <SpinAxis tiltDeg={p.spinAxisDeg} />}
        <OrbitControls enableDamping dampingFactor={0.08} minDistance={1.12} maxDistance={8} autoRotate={p.autoRotate} autoRotateSpeed={0.8} enablePan={false} />
      </Canvas>
      <div className="viewer-hint">Drag to rotate · scroll or pinch to zoom</div>
      {busy && <div className="viewer-busy">Building mesh…</div>}
    </div>
  );
}
