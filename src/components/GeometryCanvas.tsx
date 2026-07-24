import { useEffect, useMemo } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, Segments, Segment, Points } from "@react-three/drei";
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

const FOV = 45;

// The whole model's bounding sphere (center + radius) from every node —
// independent of layer visibility, so toggling a layer never re-frames.
function modelBounds(geo: ModelGeometry): { center: THREE.Vector3; radius: number } {
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  for (const n of geo.nodes) {
    const [x, y, z] = toScene(n);
    box.expandByPoint(v.set(x, y, z));
  }
  if (box.isEmpty()) return { center: new THREE.Vector3(), radius: 1 };
  const center = box.getCenter(new THREE.Vector3());
  const radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 1);
  return { center, radius };
}

// Frames the model to fill the view ONCE per bounds change (i.e. when a new
// model loads) and points the orbit pivot at the model center. Deliberately
// not tied to render/frame or to layer toggles — so a user's own zoom/orbit
// is never overridden while they interact. Replaces drei's <Bounds observe>,
// whose continuous re-fit fought OrbitControls' damping and made the model
// appear to rescale as the mouse moved.
function CameraRig({ center, radius }: { center: THREE.Vector3; radius: number }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as { target: THREE.Vector3; update: () => void } | null;
  useEffect(() => {
    const dist = (radius / Math.sin((FOV / 2) * (Math.PI / 180))) * 1.15;
    const dir = new THREE.Vector3(1, 0.75, 1).normalize();
    camera.position.copy(center).addScaledVector(dir, dist);
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.near = Math.max(dist / 1000, 0.01);
      camera.far = dist * 12 + radius * 12;
      camera.updateProjectionMatrix();
    }
    camera.lookAt(center);
    if (controls) {
      controls.target.copy(center);
      controls.update();
    }
  }, [center, radius, camera, controls]);
  return null;
}

// Default-exported for React.lazy() in Geometry3DSection — keeps three.js /
// @react-three/* (a large dependency) out of the app's main bundle, same
// intent as the old CDN-loaded Plotly setup, done the bundler-native way.
export default function GeometryCanvas({ geo, visibility }: Props) {
  const byId = useMemo(() => nodeIndex(geo), [geo]);
  const supports = useMemo(() => supportNodes(geo), [geo]);
  const { center, radius } = useMemo(() => modelBounds(geo), [geo]);

  return (
    <Canvas camera={{ position: [30, 30, 30], fov: FOV }} gl={{ antialias: true, alpha: true }}>
      <ambientLight intensity={1.2} />
      <group>
        {visibility.cols && <MemberLines byId={byId} pairs={geo.cols} color="#2a78d6" lineWidth={3} />}
        {visibility.beams && <MemberLines byId={byId} pairs={geo.beams} color="#38b6d6" lineWidth={2} />}
        {visibility.braces && <MemberLines byId={byId} pairs={geo.braces} color="#9b8cff" lineWidth={2} />}
        {visibility.walls && <WallMesh byId={byId} walls={geo.walls} />}
        {visibility.nodes && <NodeDots nodes={geo.nodes} color="#898781" size={4} />}
        {visibility.supports && <NodeDots nodes={supports} color="#e34948" size={8} />}
      </group>
      <OrbitControls makeDefault enableDamping dampingFactor={0.1} />
      <CameraRig center={center} radius={radius} />
    </Canvas>
  );
}
