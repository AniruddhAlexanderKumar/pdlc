import { useEffect, useRef, useState, useCallback } from 'react';
import { Box, Maximize2, RefreshCw, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import { Button, Spinner } from '../components/ui';

interface StlViewerProps {
  url: string;
  className?: string;
  height?: number;
  autoRotate?: boolean;
}

interface ParsedMesh {
  positions: Float32Array;
  normals: Float32Array;
  triangleCount: number;
  bounds: {
    min: [number, number, number];
    max: [number, number, number];
    size: [number, number, number];
  };
}

// Parse binary or ASCII STL from ArrayBuffer
export function parseStl(buffer: ArrayBuffer): ParsedMesh {
  const isBinaryLikely = buffer.byteLength >= 84;
  let isBinary = false;

  if (isBinaryLikely) {
    const view = new DataView(buffer);
    const expectedTriangles = view.getUint32(80, true);
    if (84 + expectedTriangles * 50 === buffer.byteLength) {
      isBinary = true;
    }
  }

  if (isBinary) {
    const view = new DataView(buffer);
    const triangleCount = view.getUint32(80, true);
    const positions = new Float32Array(triangleCount * 9);
    const normals = new Float32Array(triangleCount * 9);

    let offset = 84;
    let posIdx = 0;
    let normIdx = 0;

    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    for (let i = 0; i < triangleCount; i++) {
      const nx = view.getFloat32(offset, true);
      const ny = view.getFloat32(offset + 4, true);
      const nz = view.getFloat32(offset + 8, true);
      offset += 12;

      for (let v = 0; v < 3; v++) {
        const vx = view.getFloat32(offset, true);
        const vy = view.getFloat32(offset + 4, true);
        const vz = view.getFloat32(offset + 8, true);
        offset += 12;

        positions[posIdx++] = vx;
        positions[posIdx++] = vy;
        positions[posIdx++] = vz;

        normals[normIdx++] = nx;
        normals[normIdx++] = ny;
        normals[normIdx++] = nz;

        if (vx < minX) minX = vx;
        if (vy < minY) minY = vy;
        if (vz < minZ) minZ = vz;
        if (vx > maxX) maxX = vx;
        if (vy > maxY) maxY = vy;
        if (vz > maxZ) maxZ = vz;
      }
      offset += 2; // skip 2-byte attribute
    }

    return {
      positions,
      normals,
      triangleCount,
      bounds: {
        min: [minX, minY, minZ],
        max: [maxX, maxY, maxZ],
        size: [maxX - minX, maxY - minY, maxZ - minZ]
      }
    };
  } else {
    // ASCII STL parser
    const text = new TextDecoder().decode(buffer);
    const lines = text.split('\n');
    const positionsList: number[] = [];
    const normalsList: number[] = [];

    let currentNormal = [0, 0, 1];
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    for (let line of lines) {
      line = line.trim();
      if (line.startsWith('facet normal')) {
        const parts = line.split(/\s+/).slice(2).map(Number);
        if (parts.length === 3 && parts.every((n) => !isNaN(n))) {
          currentNormal = parts;
        }
      } else if (line.startsWith('vertex')) {
        const parts = line.split(/\s+/).slice(1).map(Number);
        if (parts.length === 3 && parts.every((n) => !isNaN(n))) {
          positionsList.push(parts[0], parts[1], parts[2]);
          normalsList.push(currentNormal[0], currentNormal[1], currentNormal[2]);

          if (parts[0] < minX) minX = parts[0];
          if (parts[1] < minY) minY = parts[1];
          if (parts[2] < minZ) minZ = parts[2];
          if (parts[0] > maxX) maxX = parts[0];
          if (parts[1] > maxY) maxY = parts[1];
          if (parts[2] > maxZ) maxZ = parts[2];
        }
      }
    }

    const triangleCount = Math.floor(positionsList.length / 9);
    return {
      positions: new Float32Array(positionsList),
      normals: new Float32Array(normalsList),
      triangleCount,
      bounds: {
        min: [minX, minY, minZ],
        max: [maxX, maxY, maxZ],
        size: [maxX - minX, maxY - minY, maxZ - minZ]
      }
    };
  }
}

// 4x4 matrix utilities
function mat4Identity(): number[] {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

function mat4Perspective(fovyRad: number, aspect: number, near: number, far: number): number[] {
  const f = 1.0 / Math.tan(fovyRad / 2);
  const nf = 1 / (near - far);
  return [
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, (2 * far * near) * nf, 0
  ];
}

function mat4Multiply(a: number[], b: number[]): number[] {
  const out = new Array(16);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      out[i * 4 + j] =
        a[i * 4 + 0] * b[0 * 4 + j] +
        a[i * 4 + 1] * b[1 * 4 + j] +
        a[i * 4 + 2] * b[2 * 4 + j] +
        a[i * 4 + 3] * b[3 * 4 + j];
    }
  }
  return out;
}

function mat4RotateX(m: number[], angleRad: number): number[] {
  const c = Math.cos(angleRad);
  const s = Math.sin(angleRad);
  const rot = [
    1, 0, 0, 0,
    0, c, -s, 0,
    0, s, c, 0,
    0, 0, 0, 1
  ];
  return mat4Multiply(m, rot);
}

function mat4RotateY(m: number[], angleRad: number): number[] {
  const c = Math.cos(angleRad);
  const s = Math.sin(angleRad);
  const rot = [
    c, 0, s, 0,
    0, 1, 0, 0,
    -s, 0, c, 0,
    0, 0, 0, 1
  ];
  return mat4Multiply(m, rot);
}

function mat4Translate(m: number[], x: number, y: number, z: number): number[] {
  const t = [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    x, y, z, 1
  ];
  return mat4Multiply(m, t);
}

export function StlViewer({
  url,
  className = '',
  height = 360,
  autoRotate = true
}: StlViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mesh, setMesh] = useState<ParsedMesh | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Rotation and Zoom state
  const rotRef = useRef<{ x: number; y: number; zoom: number; isDragging: boolean; lastX: number; lastY: number }>({
    x: 0.5,
    y: -0.6,
    zoom: 2.5,
    isDragging: false,
    lastX: 0,
    lastY: 0
  });

  const animFrameRef = useRef<number | null>(null);

  // 1. Fetch & parse STL model
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status} fetching CAD artifact`);
        return res.arrayBuffer();
      })
      .then((buf) => {
        if (!active) return;
        const parsed = parseStl(buf);
        if (parsed.triangleCount === 0) {
          throw new Error('No triangles found in STL mesh');
        }
        setMesh(parsed);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setError(err.message || 'Failed to load STL model');
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [url]);

  // 2. WebGL Rendering pipeline
  useEffect(() => {
    if (!mesh || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const gl = canvas.getContext('webgl');
    if (!gl) {
      setError('WebGL is not supported in this browser.');
      return;
    }

    // Normalized coordinates: center mesh at (0,0,0) and scale into [-1, 1]
    const [minX, minY, minZ] = mesh.bounds.min;
    const [maxX, maxY, maxZ] = mesh.bounds.max;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const cz = (minZ + maxZ) / 2;
    const maxSpan = Math.max(maxX - minX, maxY - minY, maxZ - minZ) || 1;
    const scaleFactor = 2.0 / maxSpan;

    const normPositions = new Float32Array(mesh.positions.length);
    for (let i = 0; i < mesh.positions.length; i += 3) {
      normPositions[i] = (mesh.positions[i] - cx) * scaleFactor;
      normPositions[i + 1] = (mesh.positions[i + 1] - cy) * scaleFactor;
      normPositions[i + 2] = (mesh.positions[i + 2] - cz) * scaleFactor;
    }

    // Shaders
    const vsSource = `
      attribute vec3 a_pos;
      attribute vec3 a_norm;
      uniform mat4 u_mvp;
      uniform mat4 u_model;
      varying vec3 v_norm;
      void main() {
        gl_Position = u_mvp * vec4(a_pos, 1.0);
        v_norm = (u_model * vec4(a_norm, 0.0)).xyz;
      }
    `;

    const fsSource = `
      precision mediump float;
      varying vec3 v_norm;
      void main() {
        vec3 n = normalize(v_norm);
        vec3 light1 = normalize(vec3(0.5, 0.8, 1.0));
        vec3 light2 = normalize(vec3(-0.5, -0.6, -0.8));
        float diff1 = max(dot(n, light1), 0.0);
        float diff2 = max(dot(n, light2), 0.0) * 0.35;
        vec3 baseColor = vec3(0.24, 0.51, 0.96); // Clean CAD Cobalt Blue
        vec3 ambient = baseColor * 0.28;
        vec3 lit = baseColor * (diff1 * 0.75 + diff2);
        gl_FragColor = vec4(ambient + lit, 1.0);
      }
    `;

    function createShader(gl: WebGLRenderingContext, type: number, source: string) {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      return shader;
    }

    const vs = createShader(gl, gl.VERTEX_SHADER, vsSource);
    const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.useProgram(program);

    // Buffers
    const posBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, normPositions, gl.STATIC_DRAW);

    const aPosLoc = gl.getAttribLocation(program, 'a_pos');
    gl.enableVertexAttribArray(aPosLoc);
    gl.vertexAttribPointer(aPosLoc, 3, gl.FLOAT, false, 0, 0);

    const normBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, normBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.normals, gl.STATIC_DRAW);

    const aNormLoc = gl.getAttribLocation(program, 'a_norm');
    gl.enableVertexAttribArray(aNormLoc);
    gl.vertexAttribPointer(aNormLoc, 3, gl.FLOAT, false, 0, 0);

    const uMvpLoc = gl.getUniformLocation(program, 'u_mvp');
    const uModelLoc = gl.getUniformLocation(program, 'u_model');

    gl.enable(gl.DEPTH_TEST);
    gl.clearColor(0.09, 0.11, 0.14, 1.0); // Slate 900 background

    const triangleCount = mesh.triangleCount;
    let isRunning = true;

    function render() {
      if (!isRunning || !canvas || !gl) return;

      const displayWidth = canvas.clientWidth * window.devicePixelRatio;
      const displayHeight = canvas.clientHeight * window.devicePixelRatio;
      if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
        canvas.width = displayWidth;
        canvas.height = displayHeight;
        gl.viewport(0, 0, displayWidth, displayHeight);
      }

      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      // Auto-turntable spin when not user dragging
      if (autoRotate && !rotRef.current.isDragging) {
        rotRef.current.y += 0.007;
      }

      const aspect = canvas.width / canvas.height;
      const proj = mat4Perspective((45 * Math.PI) / 180, aspect, 0.1, 100);

      // Model-View Matrix
      let model = mat4Identity();
      model = mat4RotateX(model, rotRef.current.x);
      model = mat4RotateY(model, rotRef.current.y);

      let view = mat4Identity();
      view = mat4Translate(view, 0, 0, -rotRef.current.zoom);

      const mvp = mat4Multiply(proj, mat4Multiply(view, model));

      gl.uniformMatrix4fv(uMvpLoc, false, new Float32Array(mvp));
      gl.uniformMatrix4fv(uModelLoc, false, new Float32Array(model));

      gl.drawArrays(gl.TRIANGLES, 0, triangleCount * 3);

      animFrameRef.current = requestAnimationFrame(render);
    }

    animFrameRef.current = requestAnimationFrame(render);

    return () => {
      isRunning = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      gl.deleteBuffer(posBuffer);
      gl.deleteBuffer(normBuffer);
      gl.deleteProgram(program);
    };
  }, [mesh, autoRotate]);

  // Mouse & Touch interaction handlers
  const handlePointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    rotRef.current.isDragging = true;
    rotRef.current.lastX = e.clientX;
    rotRef.current.lastY = e.clientY;
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!rotRef.current.isDragging) return;
    const dx = e.clientX - rotRef.current.lastX;
    const dy = e.clientY - rotRef.current.lastY;
    rotRef.current.lastX = e.clientX;
    rotRef.current.lastY = e.clientY;

    rotRef.current.y += dx * 0.01;
    rotRef.current.x += dy * 0.01;
    // Clamp pitch
    rotRef.current.x = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, rotRef.current.x));
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    rotRef.current.isDragging = false;
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    rotRef.current.zoom = Math.max(1.2, Math.min(8.0, rotRef.current.zoom + e.deltaY * 0.003));
  };

  const resetView = () => {
    rotRef.current.x = 0.5;
    rotRef.current.y = -0.6;
    rotRef.current.zoom = 2.5;
  };

  return (
    <div
      className={`relative overflow-hidden rounded-xl bg-slate-900 border border-slate-800 shadow-inner select-none ${className}`}
      style={{ height }}
    >
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-900/90 text-white z-20">
          <Spinner label="Loading 3D Mesh" />
          <span className="text-xs font-medium text-slate-300">Rendering 3D model…</span>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-rose-400 z-20">
          <Box className="h-8 w-8 mb-2 opacity-50" />
          <p className="text-xs font-semibold">{error}</p>
        </div>
      )}

      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
        className="h-full w-full cursor-grab active:cursor-grabbing touch-none block"
      />

      {/* Floating HUD controls & metrics */}
      {mesh && !loading && (
        <>
          <div className="absolute top-3 left-3 flex flex-col gap-1 text-[11px] text-slate-400 pointer-events-none">
            <span className="font-semibold text-slate-200">Interactive 3D Preview</span>
            <span className="font-mono text-[10px]">
              {mesh.triangleCount.toLocaleString()} facets · Drag to orbit · Scroll to zoom
            </span>
          </div>

          <div className="absolute top-3 right-3 flex items-center gap-1.5 z-10">
            <button
              type="button"
              onClick={resetView}
              title="Reset View"
              className="rounded bg-slate-800/80 p-1.5 text-slate-300 backdrop-blur hover:bg-slate-700 hover:text-white transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="absolute bottom-3 left-3 text-[10px] text-slate-400 font-mono bg-slate-950/60 backdrop-blur px-2.5 py-1 rounded border border-slate-800 pointer-events-none">
            Dimensions: {mesh.bounds.size[0].toFixed(1)} × {mesh.bounds.size[1].toFixed(1)} × {mesh.bounds.size[2].toFixed(1)} mm
          </div>
        </>
      )}
    </div>
  );
}
