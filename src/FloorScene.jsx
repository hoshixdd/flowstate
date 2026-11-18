import { Canvas, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { useReducedMotion } from 'motion/react';
import { BoxGeometry, CanvasTexture, SRGBColorSpace, Vector3 } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const box = new BoxGeometry();
const steel = '#607d9d';
const light = '#a8bdd0';
const dark = '#1b2e42';
const trim = '#38617c';
const carton = '#d3a063';
const cameraAngle = new Vector3(-0.55, 0.85, 1.17).normalize();
const numberTextures = new Map();

function Block({ at, size, color, glow = false }) {
  return (
    <mesh position={at} scale={size} geometry={box}>
      <meshStandardMaterial color={color} roughness={0.78} emissive={glow ? color : '#000000'} emissiveIntensity={0.23} />
    </mesh>
  );
}

function Drum({ at, radius, height, color, faceFront = false }) {
  return (
    <mesh position={at} rotation={faceFront ? [Math.PI / 2, 0, 0] : [0, 0, 0]}>
      <cylinderGeometry args={[radius, radius, height, 16]} />
      <meshStandardMaterial color={color} roughness={0.72} />
    </mesh>
  );
}

function Crate({ at, color = carton }) {
  return (
    <group position={at}>
      <Block at={[0, 0.21, 0]} size={[0.49, 0.42, 0.44]} color={color} />
      <Block at={[0, 0.43, 0]} size={[0.09, 0.025, 0.44]} color="#f2d39d" />
    </group>
  );
}

function Workbench({ color, state, fixture }) {
  const guarded = fixture === 'forming' || fixture === 'sealer' || fixture === 'press' || fixture === 'vision' || fixture === 'inspection';
  const panel = guarded ? light : steel;
  return (
    <>
      <Block at={[0, 0.44, -0.05]} size={[1.85, 0.72, 1.16]} color={dark} />
      <Block at={[0, 0.88, 0]} size={[2.02, 0.17, 1.3]} color={light} />
      <Block at={[0, 0.45, 0.55]} size={[1.66, 0.52, 0.08]} color={trim} />
      <Block at={[0, 1.06, 0]} size={[1.35, 0.16, 0.64]} color={steel} />
      {guarded ? (
        <>
          <Block at={[-0.73, 1.47, -0.05]} size={[0.23, 1.22, 1.1]} color={panel} />
          <Block at={[0.73, 1.47, -0.05]} size={[0.23, 1.22, 1.1]} color={panel} />
          <Block at={[0, 2.03, -0.05]} size={[1.7, 0.2, 1.1]} color={panel} />
          <Block at={[0, 1.88, 0.5]} size={[1.18, 0.1, 0.08]} color={color} glow />
        </>
      ) : (
        <>
          <Block at={[-0.69, 1.22, -0.34]} size={[0.37, 0.64, 0.43]} color={steel} />
          <Block at={[-0.69, 1.56, -0.34]} size={[0.44, 0.09, 0.46]} color={color} />
          <Block at={[0.58, 1.07, -0.36]} size={[0.55, 0.22, 0.35]} color={panel} />
        </>
      )}
      {(state.busy > 0 || state.paused && state.progress > 0) && (
        <Crate at={[-0.49 + 0.98 * (state.progress ?? 0), 1.14, 0.08]} />
      )}
    </>
  );
}

function Cabinet({ fixture, color, state }) {
  const drum = fixture === 'washer' || fixture === 'dryer';
  const rack = fixture === 'proofer' || fixture === 'cooling';
  return (
    <>
      <Block at={[0, 0.95, 0]} size={[1.8, 1.72, 1.33]} color={steel} />
      <Block at={[0, 1.83, 0]} size={[1.88, 0.14, 1.4]} color={light} />
      <Block at={[0, 1.62, 0.69]} size={[1.58, 0.18, 0.05]} color={dark} />
      <Block at={[0.54, 1.62, 0.73]} size={[0.21, 0.09, 0.03]} color={color} glow />
      {drum ? (
        <>
          <Drum at={[0, 0.93, 0.71]} radius={0.57} height={0.1} color={light} faceFront />
          <Drum at={[0, 0.93, 0.78]} radius={0.46} height={0.09} color={dark} faceFront />
          <Drum at={[0, 0.93, 0.83]} radius={0.32} height={0.04} color={state.busy ? color : trim} faceFront />
        </>
      ) : (
        <>
          <Block at={[0, 0.96, 0.68]} size={[1.51, 1.08, 0.12]} color={dark} />
          {[0.59, 0.84, 1.09, 1.34].map((height) => (
            <Block key={height} at={[0, height, 0.76]} size={[1.29, 0.085, 0.11]}
              color={rack ? light : state.busy ? '#e6a365' : trim} />
          ))}
        </>
      )}
    </>
  );
}

function Equipment({ node, color, state }) {
  const { fixture, type } = node;
  if (type === 'source' || type === 'sink' || type === 'queue') {
    const count = type === 'sink' ? state.completed : type === 'queue' ? state.waiting : state.onHand ?? 3;
    return (
      <>
        <Block at={[0, 0.46, 0]} size={[1.88, 0.58, 1.16]} color={steel} />
        <Block at={[0, 0.78, 0]} size={[2.03, 0.13, 1.27]} color={light} />
        {[-0.58, 0, 0.58].map((x, i) => i < (count ?? 0) && <Crate key={x} at={[x, 0.85, -0.08]} />)}
        <Block at={[0, 0.55, 0.6]} size={[1.52, 0.095, 0.09]} color={color} />
      </>
    );
  }
  if (['oven', 'proofer', 'cooling', 'washer', 'dryer'].includes(fixture)) {
    return <Cabinet fixture={fixture} color={color} state={state} />;
  }
  if (fixture === 'mixer' || fixture === 'filler') {
    return (
      <>
        <Block at={[0, 0.53, 0]} size={[1.65, 0.76, 1.26]} color={steel} />
        <Block at={[0, 0.98, 0]} size={[1.92, 0.13, 1.37]} color={light} />
        <Drum at={[0, 1.27, 0.1]} radius={0.52} height={0.48} color={trim} />
        <Drum at={[0, 1.53, 0.1]} radius={0.59} height={0.13} color={light} />
        <Drum at={[0, 1.6, 0.1]} radius={0.44} height={0.05} color={state.busy ? color : dark} />
        <Block at={[0.62, 1.42, -0.42]} size={[0.3, 0.86, 0.38]} color={steel} />
        <Block at={[0.29, 1.88, -0.15]} size={[0.96, 0.19, 0.46]} color={light} />
      </>
    );
  }
  return <Workbench fixture={fixture || type} color={color} state={state} />;
}

function numberTexture(number) {
  if (numberTextures.has(number)) return numberTextures.get(number);
  const bitmap = document.createElement('canvas');
  bitmap.width = 96;
  bitmap.height = 64;
  const context = bitmap.getContext('2d');
  context.fillStyle = '#152639';
  context.fillRect(0, 0, bitmap.width, bitmap.height);
  context.fillStyle = '#f2f8ff';
  context.font = '700 45px system-ui';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(String(number).padStart(2, '0'), 48, 34);
  const texture = new CanvasTexture(bitmap);
  texture.colorSpace = SRGBColorSpace;
  numberTextures.set(number, texture);
  return texture;
}

function Station({ station, active, select }) {
  const { node, index, x, z, state, color } = station;
  return (
    <group position={[x, 0, z]} onClick={(event) => {
      if (event.delta > 5) return;
      event.stopPropagation();
      select(node.id);
    }}>
      <Block at={[0, 0.045, 0]} size={[2.75, 0.09, 2.47]} color={active ? '#e0f3fd' : '#314d63'} />
      <Block at={[0, 0.105, 0]} size={[2.61, 0.08, 2.34]} color={dark} />
      <Block at={[0, 0.17, 1.17]} size={[2.64, 0.11, 0.13]} color={color} glow />
      <Equipment node={node} color={color} state={state} />
      <mesh position={[-0.99, 0.21, 0.96]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.55, 0.37]} />
        <meshBasicMaterial map={numberTexture(index + 1)} toneMapped={false} />
      </mesh>
      {Array.from({ length: Math.min(5, state.waiting ?? 0) }, (_, i) => (
        <Crate key={i} at={[-1.02 + i * 0.51, 0, 1.58]} />
      ))}
    </group>
  );
}

function Segment({ from, to, color, y = 0.18, width = 0.1, belt = false }) {
  const [ax, az] = from;
  const [bx, bz] = to;
  const distance = Math.hypot(bx - ax, bz - az);
  const length = distance - (belt ? 2.1 : 0);
  if (length < 0.01) return null;
  const rollerCount = Math.min(24, Math.floor(length / 0.45));
  return (
    <group position={[(ax + bx) / 2, y, (az + bz) / 2]} rotation={[0, -Math.atan2(bz - az, bx - ax), 0]}>
      <Block at={[0, 0, 0]} size={[length, belt ? 0.16 : 0.025, width]} color={color} />
      {belt && (
        <>
          <Block at={[0, 0.13, -0.32]} size={[length, 0.13, 0.065]} color={steel} />
          <Block at={[0, 0.13, 0.32]} size={[length, 0.13, 0.065]} color={steel} />
          <Block at={[0, 0.095, 0]} size={[length, 0.035, 0.16]} color="#6b9fac" />
          {Array.from({ length: rollerCount }, (_, i) => (
            <Block key={i} at={[-length / 2 + length * (i + 0.5) / rollerCount, 0.14, 0]}
              size={[0.07, 0.045, 0.57]} color={light} />
          ))}
        </>
      )}
    </group>
  );
}

function Worker({ worker, active, select }) {
  const uniform = active ? '#9df0d2' : '#72a5dc';
  return (
    <group position={[worker.x, 0, worker.z]} rotation={[0, worker.heading, 0]} onClick={(event) => {
      if (event.delta > 5) return;
      event.stopPropagation();
      select(worker.id);
    }}>
      <Drum at={[0, 0.03, 0]} radius={0.36} height={0.045} color={uniform} />
      <Block at={[-0.09, 0.31, 0.02]} size={[0.13, 0.48, 0.18]} color={dark} />
      <Block at={[0.09, 0.31, -0.02]} size={[0.13, 0.48, 0.18]} color={dark} />
      <Drum at={[0, 0.69, 0]} radius={0.2} height={0.43} color={uniform} />
      <Drum at={[0, 0.99, 0]} radius={0.13} height={0.19} color="#b58166" />
      <Drum at={[0, 1.12, 0]} radius={0.18} height={0.09} color="#efc568" />
    </group>
  );
}

function ViewControls({ width, depth, x, z, focus, revision, workerX, workerZ, onFailure }) {
  const { camera, gl, invalidate, size } = useThree();
  const orbit = useRef(null);

  useLayoutEffect(() => {
    const element = gl.domElement;
    const controls = new OrbitControls(camera, element);
    controls.enablePan = false;
    controls.enableDamping = false;
    controls.minPolarAngle = 0.22;
    controls.maxPolarAngle = 1.35;
    controls.addEventListener('change', invalidate);
    orbit.current = controls;
    element.tabIndex = 0;
    element.setAttribute('aria-label', 'Interactive 3D floor. Arrow keys orbit, plus and minus zoom.');
    const keyboard = (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-'].includes(event.key)) return;
      event.preventDefault();
      if (['+', '=', '-'].includes(event.key)) {
        camera.zoom = Math.min(controls.maxZoom, Math.max(controls.minZoom, camera.zoom * (event.key === '-' ? 0.88 : 1.13)));
        camera.updateProjectionMatrix();
      } else {
        const position = camera.position.clone().sub(controls.target);
        const theta = Math.atan2(position.x, position.z) + (event.key === 'ArrowLeft' ? -0.14 : event.key === 'ArrowRight' ? 0.14 : 0);
        const phi = Math.min(controls.maxPolarAngle, Math.max(controls.minPolarAngle,
          Math.acos(position.y / position.length()) + (event.key === 'ArrowUp' ? -0.09 : event.key === 'ArrowDown' ? 0.09 : 0)));
        const radius = position.length();
        camera.position.setFromSphericalCoords(radius, phi, theta).add(controls.target);
        controls.update();
      }
      invalidate();
    };
    element.addEventListener('keydown', keyboard);
    return () => {
      element.removeEventListener('keydown', keyboard);
      controls.removeEventListener('change', invalidate);
      controls.dispose();
      orbit.current = null;
    };
  }, [camera, gl, invalidate]);

  useEffect(() => {
    const element = gl.domElement;
    const lost = (event) => {
      event.preventDefault();
      onFailure();
    };
    element.addEventListener('webglcontextlost', lost);
    return () => element.removeEventListener('webglcontextlost', lost);
  }, [gl, onFailure]);

  useLayoutEffect(() => {
    const controls = orbit.current;
    if (!controls) return;
    const right = new Vector3(0, 1, 0).cross(cameraAngle).normalize();
    const up = cameraAngle.clone().cross(right).normalize();
    const span = focus ? 6.2 : Math.abs(right.x) * width + Math.abs(right.z) * depth;
    const height = focus ? 4.8 : Math.abs(up.x) * width + Math.abs(up.z) * depth + 2.1;
    camera.zoom = Math.min(size.width * 0.91 / span, size.height * 0.90 / height);
    controls.minZoom = camera.zoom * 0.54;
    controls.maxZoom = camera.zoom * 4;
    controls.target.set(x, focus ? 0.85 : 0.12, z);
    camera.position.copy(controls.target).addScaledVector(cameraAngle, Math.max(25, width, depth));
    camera.updateProjectionMatrix();
    controls.update();
    invalidate();
  }, [camera, depth, focus, invalidate, revision, size.width, size.height, width, x, z]);

  useLayoutEffect(() => {
    const controls = orbit.current;
    if (!controls || workerX == null || workerZ == null) return;
    const delta = new Vector3(workerX - controls.target.x, 0, workerZ - controls.target.z);
    controls.target.add(delta);
    camera.position.add(delta);
    controls.update();
    invalidate();
  }, [camera, depth, invalidate, revision, size.width, size.height, width, x, z, workerX, workerZ]);
  return null;
}

function Factory({ layout, snapshot, floor }) {
  const { bounds, stations, links, routes, routeColor, workers } = layout;
  const trail = workers.find((worker) => worker.id === snapshot.follow)?.path ?? [];
  return (
    <>
      <hemisphereLight args={['#dbe9ff', '#405b6f', 2.25]} />
      <directionalLight position={[-9, 22, 13]} intensity={2.55} color="#d5e6ff" />
      <directionalLight position={[14, 8, -13]} intensity={0.8} color="#8dbbd6" />
      <Block at={[bounds.x, -0.31, bounds.z]} size={[bounds.width, 0.57, bounds.depth]} color="#233a50" />
      <gridHelper args={[1, Math.min(36, Math.ceil(bounds.width)), '#426077', '#324b62']}
        position={[bounds.x, -0.017, bounds.z]} scale={[bounds.width, 1, bounds.depth]} />
      {links.map(({ a, b }) => (
        <Segment key={a.node.id + ':' + b.node.id} from={[a.x, a.z]} to={[b.x, b.z]}
          y={0.42} color="#344e62" width={0.7} belt />
      ))}
      {routes.map(([from, to], index) => (
        <Segment key={index} from={from} to={to} y={0.062} color={routeColor} width={0.16} />
      ))}
      {trail.slice(1).map((to, index) => (
        <Segment key={index} from={trail[index]} to={to} y={0.032} color="#78e1dc" width={0.12} />
      ))}
      {stations.map((station) => (
        <Station key={station.node.id} station={station} active={station.node.id === snapshot.selected} select={floor.select} />
      ))}
      {workers.map((worker) => (
        <Worker key={worker.id} worker={worker} active={worker.id === snapshot.follow} select={floor.follow} />
      ))}
    </>
  );
}

export default function FloorScene({ layout, snapshot, floor, onFailure }) {
  const reducedMotion = useReducedMotion();
  const worker = reducedMotion ? null : layout.workers.find((item) => item.id === snapshot.follow);
  const station = snapshot.camera === 'station' && !snapshot.follow ? layout.lookup.get(snapshot.selected) : null;
  const { x, z, width, depth } = layout.bounds;

  return (
    <Canvas orthographic camera={{ near: 0.01, far: 100000 }} dpr={[1, 1.5]} frameloop="demand"
      gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}>
      <ViewControls width={width} depth={depth} x={station?.x ?? x} z={station?.z ?? z}
        revision={snapshot.cameraRevision} focus={Boolean(station || worker)}
        workerX={worker?.x} workerZ={worker?.z} onFailure={onFailure} />
      <Factory layout={layout} snapshot={snapshot} floor={floor} />
    </Canvas>
  );
}
