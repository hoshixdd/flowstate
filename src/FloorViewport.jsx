import { Component, lazy, Suspense, useCallback, useState, useSyncExternalStore } from 'react';
import { floorModel } from './floor-model';

const Scene = lazy(() => import('./FloorScene'));

function canRender3D() {
  try {
    return Boolean(document.createElement('canvas').getContext('webgl2'));
  } catch {
    return false;
  }
}

class RendererBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onError();
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function FloorMap({ layout, selected, follow, floor }) {
  const { bounds, stations, links, routes, routeColor, workers } = layout;
  const trail = workers.find((worker) => worker.id === follow)?.path ?? [];
  return (
    <svg className="floor-map" viewBox={`${bounds.left} ${bounds.top} ${bounds.width} ${bounds.depth}`}
      aria-hidden="true">
      <defs>
        <pattern id="floor-grid" width="1" height="1" patternUnits="userSpaceOnUse">
          <path d="M 1 0 H 0 V 1" fill="none" stroke="#2f495c" strokeWidth=".04" />
        </pattern>
        <marker id="floor-arrow" markerWidth="4" markerHeight="4" refX="3.5" refY="2" orient="auto">
          <path d="M0 0 4 2 0 4Z" fill="#83a6bd" />
        </marker>
      </defs>
      <rect x={bounds.left} y={bounds.top} width={bounds.width} height={bounds.depth} rx=".3"
        fill="#182e42" stroke="#4d697e" strokeWidth=".07" />
      <rect x={bounds.left} y={bounds.top} width={bounds.width} height={bounds.depth} rx=".3" fill="url(#floor-grid)" />
      {links.map(({ a, b }) => {
        const length = Math.hypot(b.x - a.x, b.z - a.z);
        if (length < 1.9) return null;
        const end = 1.05 / length;
        return <line key={a.node.id + ':' + b.node.id} x1={a.x} y1={a.z} x2={b.x + (a.x - b.x) * end}
          y2={b.z + (a.z - b.z) * end} stroke="#83a6bd" strokeWidth=".12" markerEnd="url(#floor-arrow)" />;
      })}
      {routes.map(([[ax, az], [bx, bz]], index) => (
        <line key={index} x1={ax} x2={bx} y1={az} y2={bz} stroke={routeColor} strokeWidth=".16" strokeDasharray=".25 .18" />
      ))}
      {trail.length > 1 && (
        <polyline points={trail.map(([x, z]) => `${x},${z}`).join(' ')} fill="none"
          stroke="#78e1dc" strokeWidth=".13" strokeDasharray=".23 .16" />
      )}
      {stations.map(({ node, index, x, z, color }) => (
        <g key={node.id} className="map-station" transform={`translate(${x} ${z})`} onClick={() => floor.select(node.id)}>
          <rect x="-.93" y="-.77" width="1.86" height="1.54" rx=".26" fill={color}
            stroke={selected === node.id ? '#fff' : '#a7bed1'} strokeWidth={selected === node.id ? '.12' : '.04'} />
          <text textAnchor="middle" y=".24" fill="#142333" fontSize=".7" fontWeight="700">{index + 1}</text>
        </g>
      ))}
      {workers.map(({ id, x, z }) => (
        <g key={id} className="map-station" transform={`translate(${x} ${z})`} onClick={() => floor.follow(id)}>
          <circle r=".42" fill={follow === id ? '#fff4b1' : '#f4ca7a'} stroke="#1c2d3d" strokeWidth=".09" />
          <text textAnchor="middle" y=".12" fill="#142333" fontSize=".32" fontWeight="800">{id}</text>
        </g>
      ))}
    </svg>
  );
}

function StationList({ stations, selected, select }) {
  return (
    <div className="floor-stations" role="group" aria-label="Floor stations">
      {stations.map(({ node, index, color, detail }) => (
        <button key={node.id} type="button" aria-label={node.name} title={node.name} aria-describedby={`floor-status-${index}`}
          aria-pressed={selected === node.id}
          onClick={() => select(node.id)}>
          <span className="station-number" style={{ '--station-color': color }} aria-hidden="true">
            {String(index + 1).padStart(2, '0')}
          </span>
          <span className="station-caption"><strong>{node.name}</strong><small id={`floor-status-${index}`}>{detail}</small></span>
        </button>
      ))}
    </div>
  );
}

export function FloorViewport({ floor }) {
  const snapshot = useSyncExternalStore(floor.subscribe, floor.getSnapshot);
  const [mode, setMode] = useState(() => canRender3D() ? '3d' : 'unavailable');
  const onFailure = useCallback(() => setMode('unavailable'), []);
  if (!snapshot.model) return null;

  const layout = floorModel(snapshot);
  const showMap = mode !== '3d';
  const map = <FloorMap layout={layout} selected={snapshot.selected} follow={snapshot.follow} floor={floor} />;
  const switchMode = () => {
    if (mode === '3d') setMode('map');
    else setMode(canRender3D() ? '3d' : 'unavailable');
  };

  return (
    <div className="floor-view" data-renderer={showMap ? '2d' : 'r3f'}>
      <div className="floor-drawing" role="group" aria-label="Process floor visualization">
        {showMap ? map : (
          <RendererBoundary fallback={map} onError={onFailure}>
            <Suspense fallback={map}>
              <Scene layout={layout} snapshot={snapshot} floor={floor} onFailure={onFailure} />
            </Suspense>
          </RendererBoundary>
        )}
      </div>
      <div className="floor-mode">
        <span className="renderer-status" role="status">{mode === 'unavailable' ? '3D unavailable · Floor map' : ''}</span>
        <button type="button" className="floor-mode-button" onClick={switchMode}>
          {mode === '3d' ? 'Floor map' : mode === 'map' ? 'Open 3D floor' : 'Try 3D again'}
        </button>
      </div>
      <StationList stations={layout.stations} selected={snapshot.selected} select={floor.select} />
    </div>
  );
}
