import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getJson, resolveBase, setCorsPost } from "./lib/midas.js";

const EPS = 1e-6;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsPost(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).end();

  const { product, apiKey, baseUrl } = req.body || {};
  const base = resolveBase(product, baseUrl);
  if (!apiKey) return res.status(400).json({ ok: false, code: "missing_key" });
  if (!base) return res.status(400).json({ ok: false, code: "unknown_product", product });

  try {
    const [nodeRes, elemRes, consRes] = await Promise.all([
      getJson(base, "/db/NODE", apiKey),
      getJson(base, "/db/ELEM", apiKey),
      getJson(base, "/db/CONS", apiKey),
    ]);

    const nodeItems: Record<string, any> = nodeRes.NODE || {};
    const elemItems: Record<string, any> = elemRes.ELEM || {};
    const consItems: Record<string, any> = consRes.CONS || {};

    const nodes = Object.entries(nodeItems).map(([id, v]: [string, any]) => ({
      id,
      x: Number(v?.X) || 0,
      y: Number(v?.Y) || 0,
      z: Number(v?.Z) || 0,
    }));
    const coordById = new Map(nodes.map((n) => [n.id, n]));

    const cols: [string, string][] = [];
    const beams: [string, string][] = [];
    const braces: [string, string][] = [];
    const walls: { nodes: string[] }[] = [];

    for (const v of Object.values<any>(elemItems)) {
      const nodeIds: string[] = (v?.NODE || []).map((n: number) => String(n));
      // Real "Wall" elements (TYPE:"WALL") are one option, but models
      // commonly represent walls as generic shell elements (TYPE:"PLATE")
      // instead — this live model has zero WALL-typed elements and its
      // walls are all PLATE. Both render as mesh panels.
      if ((v?.TYPE === "WALL" || v?.TYPE === "PLATE") && nodeIds.length >= 3) {
        walls.push({ nodes: nodeIds });
        continue;
      }
      if (nodeIds.length < 2) continue;
      const A = coordById.get(nodeIds[0]);
      const B = coordById.get(nodeIds[1]);
      if (!A || !B) continue;
      const pair: [string, string] = [nodeIds[0], nodeIds[1]];
      const sameZ = Math.abs(A.z - B.z) < EPS;
      const sameXY = Math.abs(A.x - B.x) < EPS && Math.abs(A.y - B.y) < EPS;
      if (sameZ) beams.push(pair);
      else if (sameXY) cols.push(pair);
      else braces.push(pair);
    }

    return res.json({
      ok: true,
      data: {
        nodes,
        cols,
        beams,
        braces,
        walls,
        baseNodes: Object.keys(consItems),
      },
    });
  } catch (e: any) {
    return res.json({ ok: false, error: e.message });
  }
}
