import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Bounds, Segments, Segment, Points } from "@react-three/drei";
import * as THREE from "three";
import type { GeoNode, MemberPair, ModelGeometry } from "../types/geometry";
import { buildWallGeometry, nodeIndex, nodePositions, supportNodes, toScene } from "../lib/geometryScene";

export interface GeoVisibility {
  cols: boolean;
  beams: boolean;
  braces: boolean;
  walls: boolean;
  nodes: boolean;
  supports: boolean;
}

interface Props {
  geo: ModelGeometry;
  visibility: GeoVisibility;
}

function MemberLines({
  byId,
  pairs,
  color,
  lineWidth,
}: {
  byId: Map<string, GeoNode>;
  pairs: MemberPair[];
  color: string;
  lineWidth: number;
}) {
  const segs = useMemo(
    () =>
      pairs
        .map(([a, b]) => [byId.get(a), byId.get(b)] as const)
        .filter((p): p is [GeoNode, GeoNode] => !!p[0] && !!p[1]),
    [byId, pairs]
  );
  if (!segs.length) return null;
  return (
    <Segments limit={segs.length} lineWidth={lineWidth}>
      {segs.map(([a, b], i) => (
        <Segment key={i} start={toScene(a)} end={toScene(b)} color={color} />
      ))}
    </Segments>
  );
}

function WallMesh({ byId, walls }: { byId: Map<string, GeoNode>; walls: ModelGeometry["walls"] }) {
  const geometry = useMemo(() => {
    const data = buildWallGeometry(byId, walls);
    if (!data) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(data.positions, 3));
    geo.setIndex(data.indices);
    geo.computeVertexNormals();
    return geo;
  }, [byId, walls]);
  if (!geometry) return null;
  return (
    <mesh geometry={geometry}>
      <meshBasicMaterial color="#9b8cff" transparent opacity={0.55} side={THREE.DoubleSide} />
    </mesh>
  );
}

function NodeDots({ nodes, color, size }: { nodes: GeoNode[]; color: string; size: number }) {
  const positions = useMemo(() => nodePositions(nodes), [nodes]);
  if (!nodes.length) return null;
  return (
    <Points positions={positions}>
      <pointsMaterial size={size} color={color} sizeAttenuation={false} />
    </Points>
  );
}

// Default-exported for React.lazy() in Geometry3DSection — keeps three.js /
// @react-three/* (a large dependency) out of the app's main bundle, same
// intent as the old CDN-loaded Plotly setup, done the bundler-native way.
export default function GeometryCanvas({ geo, visibility }: Props) {
  const byId = useMemo(() => nodeIndex(geo), [geo]);
  const supports = useMemo(() => supportNodes(geo), [geo]);

  return (
    <Canvas camera={{ position: [30, 30, 30], fov: 45 }} gl={{ antialias: true, alpha: true }}>
      <ambientLight intensity={1.2} />
      <Bounds fit clip observe margin={1.2}>
        <group>
          {visibility.cols && <MemberLines byId={byId} pairs={geo.cols} color="#2a78d6" lineWidth={3} />}
          {visibility.beams && <MemberLines byId={byId} pairs={geo.beams} color="#38b6d6" lineWidth={2} />}
          {visibility.braces && <MemberLines byId={byId} pairs={geo.braces} color="#9b8cff" lineWidth={2} />}
          {visibility.walls && <WallMesh byId={byId} walls={geo.walls} />}
          {visibility.nodes && <NodeDots nodes={geo.nodes} color="#898781" size={4} />}
          {visibility.supports && <NodeDots nodes={supports} color="#e34948" size={8} />}
        </group>
      </Bounds>
      <OrbitControls makeDefault enableDamping dampingFactor={0.1} />
    </Canvas>
  );
}
