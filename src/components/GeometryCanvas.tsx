import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, Segments, Segment, Points } from "@react-three/drei";
import * as THREE from "three";
import type { FrameMember, GeoNode, ModelGeometry } from "../types/geometry";
import { buildWallGeometry, buildWallSolidGeometry, nodeIndex, nodePositions, supportNodes, toScene } from "../lib/geometryScene";

export interface GeoVisibility {
  cols: boolean;
  beams: boolean;
  braces: boolean;
  walls: boolean;
  nodes: boolean;
  supports: boolean;
  solid: boolean;
}

export type ViewKind = "iso" | "x" | "y" | "z";
export interface ViewRequest {
  kind: ViewKind;
  nonce: number;
}

interface Props {
  geo: ModelGeometry;
  visibility: GeoVisibility;
  view: ViewRequest | null;
}

const hasDims = (m: FrameMember) => m.w != null && m.h != null;

// Lines for members drawn as wireframe (solid mode off, or a section shape we
// can't size into a box).
function MemberLines({ byId, members, color, lineWidth }: { byId: Map<string, GeoNode>; members: FrameMember[]; color: string; lineWidth: number }) {
  const segs = useMemo(
    () =>
      members
        .map((m) => [byId.get(m.a), byId.get(m.b)] as const)
        .filter((p): p is [GeoNode, GeoNode] => !!p[0] && !!p[1]),
    [byId, members]
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

// Extruded boxes for frame members with a solid-rectangle section, one
// InstancedMesh per member type. The section is oriented with a consistent
// local frame (height ~ vertical for beams, in-plane for columns) plus the
// element's own rotation angle when the model provides one — a schematic
// solid, not an exact reproduction of Gen NX's local axes.
function FrameSolids({ byId, members, color }: { byId: Map<string, GeoNode>; members: FrameMember[]; color: string }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const data = useMemo(
    () => members.filter((m) => hasDims(m) && byId.has(m.a) && byId.has(m.b)),
    [members, byId]
  );

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const mat = new THREE.Matrix4();
    const A = new THREE.Vector3();
    const B = new THREE.Vector3();
    const axis = new THREE.Vector3();
    const widthDir = new THREE.Vector3();
    const heightDir = new THREE.Vector3();
    const up = new THREE.Vector3();
    const mid = new THREE.Vector3();
    const q = new THREE.Quaternion();
    data.forEach((m, i) => {
      A.set(...toScene(byId.get(m.a)!));
      B.set(...toScene(byId.get(m.b)!));
      axis.subVectors(B, A);
      const length = axis.length() || 1;
      axis.divideScalar(length);
      up.set(0, 1, 0);
      if (Math.abs(axis.y) > 0.99) up.set(1, 0, 0); // near-vertical member (column)
      widthDir.crossVectors(up, axis).normalize();
      heightDir.crossVectors(axis, widthDir).normalize();
      if (m.angle) {
        q.setFromAxisAngle(axis, (m.angle * Math.PI) / 180);
        widthDir.applyQuaternion(q);
        heightDir.applyQuaternion(q);
      }
      mid.addVectors(A, B).multiplyScalar(0.5);
      mat.makeBasis(widthDir, heightDir, axis);
      mat.scale(new THREE.Vector3(m.w!, m.h!, length));
      mat.setPosition(mid);
      mesh.setMatrixAt(i, mat);
    });
    mesh.count = data.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [data, byId]);

  if (!data.length) return null;
  return (
    <instancedMesh key={data.length} ref={ref} args={[undefined, undefined, data.length]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={color} roughness={0.85} metalness={0} />
    </instancedMesh>
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

function WallSolid({ byId, walls }: { byId: Map<string, GeoNode>; walls: ModelGeometry["walls"] }) {
  const geometry = useMemo(() => {
    const data = buildWallSolidGeometry(byId, walls);
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
      <meshStandardMaterial color="#9b8cff" roughness={0.9} metalness={0} side={THREE.DoubleSide} />
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

// Preset camera directions (scene space; model Z-up is scene Y-up). Small
// epsilons on the axis views keep OrbitControls from gimbal-locking when the
// look direction is exactly parallel to its up vector.
const VIEW_DIR: Record<ViewKind, THREE.Vector3> = {
  iso: new THREE.Vector3(1, 0.75, 1),
  x: new THREE.Vector3(1, 0, 0.0001), // look along model X
  y: new THREE.Vector3(0.0001, 0, 1), // look along model Y
  z: new THREE.Vector3(0, 1, 0.0001), // look along model Z (plan/top)
};

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

// Frames the model to fill the view: once per bounds change (new model, ISO),
// and again whenever a view-preset button is pressed (`view.nonce` changes).
// Deliberately not tied to render/frame or layer toggles, so a user's own
// zoom/orbit is never overridden mid-interaction.
function CameraController({ center, radius, view }: { center: THREE.Vector3; radius: number; view: ViewRequest | null }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as { target: THREE.Vector3; update: () => void } | null;

  const frame = useCallback(
    (kind: ViewKind) => {
      const dist = (radius / Math.sin((FOV / 2) * (Math.PI / 180))) * 1.15;
      const dir = VIEW_DIR[kind].clone().normalize();
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
    },
    [center, radius, camera, controls]
  );

  // Initial framing (and re-frame on a new model).
  useEffect(() => {
    frame("iso");
  }, [center, radius, frame]);

  // View-preset presses.
  useEffect(() => {
    if (view) frame(view.kind);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view?.nonce]);

  return null;
}

// Default-exported for React.lazy() in Geometry3DSection — keeps three.js /
// @react-three/* (a large dependency) out of the app's main bundle.
export default function GeometryCanvas({ geo, visibility, view }: Props) {
  const byId = useMemo(() => nodeIndex(geo), [geo]);
  const supports = useMemo(() => supportNodes(geo), [geo]);
  const { center, radius } = useMemo(() => modelBounds(geo), [geo]);
  const solid = visibility.solid;

  // Solid mode: draw boxes for members with a sizable section, lines for the
  // rest. Wireframe mode: everything as lines.
  const frameGroup = (members: FrameMember[], color: string, lineWidth: number) => {
    if (!solid) return <MemberLines byId={byId} members={members} color={color} lineWidth={lineWidth} />;
    return (
      <>
        <FrameSolids byId={byId} members={members} color={color} />
        <MemberLines byId={byId} members={members.filter((m) => !hasDims(m))} color={color} lineWidth={lineWidth} />
      </>
    );
  };

  const flatWalls = solid ? geo.walls.filter((w) => w.thickness == null) : geo.walls;
  const solidWalls = solid ? geo.walls.filter((w) => w.thickness != null) : [];

  return (
    <Canvas camera={{ position: [30, 30, 30], fov: FOV }} gl={{ antialias: true, alpha: true }}>
      <ambientLight intensity={solid ? 0.75 : 1.2} />
      {solid && <directionalLight position={[1, 2, 1.5]} intensity={1.1} />}
      <group>
        {visibility.cols && frameGroup(geo.cols, "#2a78d6", 3)}
        {visibility.beams && frameGroup(geo.beams, "#38b6d6", 2)}
        {visibility.braces && frameGroup(geo.braces, "#9b8cff", 2)}
        {visibility.walls && <WallMesh byId={byId} walls={flatWalls} />}
        {visibility.walls && solidWalls.length > 0 && <WallSolid byId={byId} walls={solidWalls} />}
        {visibility.nodes && <NodeDots nodes={geo.nodes} color="#898781" size={4} />}
        {visibility.supports && <NodeDots nodes={supports} color="#e34948" size={8} />}
      </group>
      <OrbitControls makeDefault enableDamping dampingFactor={0.1} />
      <CameraController center={center} radius={radius} view={view} />
    </Canvas>
  );
}
