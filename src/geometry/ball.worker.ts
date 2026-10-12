import { buildMesh, type MeshRequest } from './ballMesh';

self.onmessage = (e: MessageEvent<MeshRequest>) => {
  const out = buildMesh(e.data);
  // the index buffer is cached in the worker, so copy it rather than transfer it
  const index = out.index.slice();
  (self as unknown as Worker).postMessage({ ...out, index }, [out.positions.buffer, out.normals.buffer, out.colors.buffer, index.buffer]);
};
