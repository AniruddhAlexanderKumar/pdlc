import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent,
} from "react";
import {
  ArrowDown,
  ArrowUp,
  Box,
  Check,
  Circle,
  Download,
  ImagePlus,
  Layers,
  MousePointer2,
  Package,
  Plus,
  RotateCcw,
  Shirt,
  Sparkles,
  Trash2,
  Type,
  X,
} from "lucide-react";
import {
  FONTS,
  MAX_IMAGE_BYTES,
  MAX_LAYERS,
  MAX_PROJECT_BYTES,
  PRINT_AREA,
  PRODUCTS,
  STICKERS,
  fitBounds,
  initialProject,
  parseProject,
  sniffImage,
  startBounds,
  type Font,
  type Layer,
  type Product,
  type Project,
  type Sticker,
} from "./model";
import "./designer.css";

type Tab = "base" | "text" | "graphics";
const SHAPES: Record<Sticker, string> = {
  star: "50,4 61,37 96,37 68,58 79,94 50,73 21,94 32,58 4,37 39,37",
  heart:
    "M50 88 C38 77 8 57 8 32 C8 9 34 5 50 24 C66 5 92 9 92 32 C92 57 62 77 50 88Z",
  circle: "",
  bolt: "56,4 18,57 44,57 36,96 82,40 57,40",
};
const uid = () => crypto.randomUUID();
function fileName(name: string, extension: string) {
  return `${
    name
      .trim()
      .replace(/[^\p{L}\p{N} _-]/gu, "")
      .trim()
      .slice(0, 80) || "product-design"
  }.${extension}`;
}
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function imageData(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Unable to read this image."));
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("Unable to read this image."));
    reader.readAsDataURL(file);
  });
}
async function validateImage(url: string) {
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
  } catch {
    throw new Error("This image could not be decoded.");
  }
  if (
    !img.naturalWidth ||
    !img.naturalHeight ||
    img.naturalWidth > 2048 ||
    img.naturalHeight > 2048 ||
    img.naturalWidth * img.naturalHeight > 4_194_304
  )
    throw new Error("Images must be at most 2048 × 2048 pixels.");
}

function ProductBase({ product, color }: { product: Product; color: string }) {
  if (product === "shirt")
    return (
      <g>
        <path
          d="M219 104 L267 85 Q300 112 333 85 L381 104 L438 153 L408 203 L375 187 L378 461 Q300 475 222 461 L225 187 L192 203 L162 153 Z"
          fill={color}
          stroke="#7d8580"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path
          d="M267 85 Q300 122 333 85 Q322 132 300 133 Q278 132 267 85Z"
          fill="#000"
          opacity=".12"
        />
        <path
          d="M225 187 L222 461 Q300 475 378 461 L375 187"
          fill="none"
          stroke="#fff"
          strokeOpacity=".48"
          strokeWidth="3"
        />
        <path
          d="M169 153 L191 193 M431 153 L409 193 M230 449 Q300 459 370 449"
          fill="none"
          stroke="#000"
          strokeOpacity=".12"
          strokeWidth="2"
        />
      </g>
    );
  if (product === "mug")
    return (
      <g>
        <path
          d="M383 171 C476 155 476 354 382 353 L382 315 C431 319 434 200 383 207 Z"
          fill={color}
          stroke="#8b928d"
          strokeWidth="3"
        />
        <path
          d="M193 145 Q300 131 407 145 L396 427 Q300 452 204 427 Z"
          fill={color}
          stroke="#8b928d"
          strokeWidth="3"
        />
        <ellipse
          cx="300"
          cy="146"
          rx="107"
          ry="20"
          fill={color}
          stroke="#8b928d"
          strokeWidth="3"
        />
        <ellipse cx="300" cy="146" rx="87" ry="12" fill="#000" opacity=".10" />
        <path
          d="M205 179 L214 418 Q230 426 242 428"
          stroke="#fff"
          strokeOpacity=".35"
          strokeWidth="8"
          fill="none"
        />
      </g>
    );
  return (
    <g>
      <path
        d="M183 154 L300 104 L417 154 L300 207 Z"
        fill={color}
        stroke="#858d87"
        strokeWidth="2"
      />
      <path
        d="M300 207 L417 154 L417 385 L392 402 L392 198 Z"
        fill={color}
        stroke="#858d87"
        strokeWidth="2"
      />
      <path
        d="M183 154 L300 207 L392 168 L392 422 L300 463 L183 415 Z"
        fill={color}
        stroke="#858d87"
        strokeWidth="2"
      />
      <path
        d="M183 154 L300 207 L392 168 L392 422 L300 463 L183 415 Z"
        fill="#fff"
        opacity=".14"
      />
      <path
        d="M300 207 L300 463 M183 154 L300 207 L392 168"
        fill="none"
        stroke="#000"
        strokeOpacity=".12"
        strokeWidth="2"
      />
    </g>
  );
}
function StickerArt({ shape, color }: { shape: Sticker; color: string }) {
  return shape === "circle" ? (
    <circle cx="50" cy="50" r="42" fill={color} />
  ) : shape === "heart" ? (
    <path d={SHAPES.heart} fill={color} />
  ) : (
    <polygon points={SHAPES[shape]} fill={color} />
  );
}

export function Designer() {
  const [project, setProject] = useState<Project>(() => {
      const p = initialProject();
      const params = new URLSearchParams(window.location.search);
      return {
        ...p,
        projectId: (params.get("projectId") ?? "").slice(0, 100),
        projectName: (params.get("projectName") ?? p.projectName).slice(0, 100),
      };
    }),
    [tab, setTab] = useState<Tab>("base"),
    [selectedId, setSelectedId] = useState<string | null>(null),
    [modal, setModal] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [uploading, setUploading] = useState(false);
  const projectRef = useRef(project);
  projectRef.current = project;
  const svg = useRef<SVGSVGElement>(null),
    dialog = useRef<HTMLDialogElement>(null),
    generation = useRef(0),
    drag = useRef<{
      id: string;
      mode: "move" | "resize";
      startX: number;
      startY: number;
      layer: Layer;
    } | null>(null);
  const selected = project.layers.find((l) => l.id === selectedId);
  useEffect(() => {
    if (modal) dialog.current?.showModal();
    else if (dialog.current?.open) dialog.current.close();
  }, [modal]);
  useEffect(() => {
    const onUnload = (event: BeforeUnloadEvent) => {
      if (
        project.layers.length ||
        project.baseColor !== initialProject().baseColor ||
        project.product !== "shirt" ||
        project.projectName !== "Untitled project" ||
        project.projectId
      ) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [project]);
  const patch = (id: string, update: Partial<Layer>) =>
    setProject((p) => ({
      ...p,
      layers: p.layers.map((l) =>
        l.id === id ? fitBounds({ ...l, ...update } as Layer) : l,
      ),
    }));
  const add = (layer: Layer) => {
    if (projectRef.current.layers.length >= MAX_LAYERS) {
      setError(`A project can contain up to ${MAX_LAYERS} layers.`);
      return;
    }
    setProject((p) => ({ ...p, layers: [...p.layers, layer] }));
    setSelectedId(layer.id);
    setError("");
    setNotice("");
  };
  const addText = () => {
    const layer = {
      ...startBounds(),
      type: "text" as const,
      text: "Your text",
      font: "Arial" as Font,
      fontSize: 26,
      bold: true,
      italic: false,
      color: "#182a27",
    };
    add(layer);
    setTab("text");
  };
  const addSticker = (shape: Sticker) =>
    add({
      ...startBounds(),
      width: 74,
      height: 74,
      type: "sticker",
      shape,
      color: "#43675a",
    });
  const erase = () => {
    if (!selectedId) return;
    setProject((p) => ({
      ...p,
      layers: p.layers.filter((l) => l.id !== selectedId),
    }));
    setSelectedId(null);
  };
  const order = (direction: -1 | 1) => {
    if (!selectedId) return;
    setProject((p) => {
      const arr = [...p.layers],
        i = arr.findIndex((l) => l.id === selectedId),
        j = i + direction;
      if (i < 0 || j < 0 || j >= arr.length) return p;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return { ...p, layers: arr };
    });
  };
  const point = (e: PointerEvent<SVGElement>) => {
    const ctm = svg.current?.getScreenCTM();
    if (!ctm) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  };
  const pointerDown = (
    e: PointerEvent<SVGElement>,
    layer: Layer,
    mode: "move" | "resize",
  ) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const p = point(e);
    if (!p) return;
    setSelectedId(layer.id);
    if (layer.type === "text") setTab("text");
    else setTab("graphics");
    drag.current = { id: layer.id, mode, startX: p.x, startY: p.y, layer };
    svg.current?.setPointerCapture(e.pointerId);
  };
  const pointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const p = point(e),
      d = drag.current;
    if (!p || !d) return;
    const dx = p.x - d.startX,
      dy = p.y - d.startY;
    patch(
      d.id,
      d.mode === "move"
        ? { x: Math.round(d.layer.x + dx), y: Math.round(d.layer.y + dy) }
        : {
            width: Math.round(d.layer.width + dx),
            height: Math.round(d.layer.height + dy),
          },
    );
  };
  const onImage = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const current = ++generation.current;
    setUploading(true);
    setError("");
    try {
      if (file.size > MAX_IMAGE_BYTES)
        throw new Error("Choose an image smaller than 1.5 MB.");
      const bytes = new Uint8Array(await file.arrayBuffer()),
        kind = sniffImage(bytes);
      if (!kind) throw new Error("Choose a PNG, JPEG or WebP image.");
      const dataUrl = await imageData(new Blob([bytes], { type: kind }));
      await validateImage(dataUrl);
      if (current !== generation.current) return;
      add({
        ...startBounds(),
        width: 100,
        height: 100,
        type: "image",
        dataUrl,
        fileName: file.name.slice(0, 120),
      });
    } catch (err) {
      if (current === generation.current)
        setError(err instanceof Error ? err.message : "Could not load image.");
    } finally {
      if (current === generation.current) setUploading(false);
    }
  };
  const onImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const current = ++generation.current;
    setUploading(true);
    setError("");
    try {
      if (file.size > MAX_PROJECT_BYTES)
        throw new Error("Project file is too large.");
      const imported = parseProject(JSON.parse(await file.text()));
      for (const layer of imported.layers)
        if (layer.type === "image") await validateImage(layer.dataUrl);
      if (current !== generation.current) return;
      if (
        !window.confirm(
          "Replace the current design with this project? Save your current work first.",
        )
      )
        return;
      setProject(imported);
      setSelectedId(null);
      setNotice("Project opened on this device.");
    } catch (err) {
      if (current === generation.current)
        setError(
          err instanceof Error ? err.message : "Could not open project.",
        );
    } finally {
      if (current === generation.current) setUploading(false);
    }
  };
  const reset = () => {
    if (
      !window.confirm(
        "Reset the product and remove all layers? Save your work first.",
      )
    )
      return;
    generation.current++;
    setUploading(false);
    setProject((p) => ({
      ...initialProject(),
      projectName: p.projectName,
      projectId: p.projectId,
    }));
    setSelectedId(null);
    setError("");
    setNotice("Canvas reset.");
  };
  const png = async () => {
    setError("");
    if (!svg.current) return;
    const clone = svg.current.cloneNode(true) as SVGSVGElement;
    clone
      .querySelectorAll("[data-editor-only]")
      .forEach((node) => node.remove());
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", "600");
    clone.setAttribute("height", "600");
    try {
      const img = new Image();
      img.src = await imageData(
        new Blob([new XMLSerializer().serializeToString(clone)], {
          type: "image/svg+xml;charset=utf-8",
        }),
      );
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = 1200;
      canvas.height = 1200;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("PNG export is not available in this browser.");
      ctx.drawImage(img, 0, 0, 1200, 1200);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      );
      if (!blob) throw new Error("Could not create the PNG.");
      download(blob, fileName(project.projectName, "png"));
      setNotice("PNG downloaded.");
    } catch {
      setError(
        "Could not export PNG in this browser. Your design is still here.",
      );
    }
  };
  const saveJson = () => {
    download(
      new Blob([JSON.stringify(project, null, 2)], {
        type: "application/json",
      }),
      fileName(project.projectName, "json"),
    );
    setNotice("Project JSON downloaded. Keep the file to reopen this design.");
  };
  const selectProduct = (product: Product) =>
    setProject((p) => ({
      ...p,
      product,
      material: PRODUCTS[product].materials[0],
    }));
  const label = (layer: Layer) =>
    layer.type === "text"
      ? layer.text || "Empty text"
      : layer.type === "sticker"
        ? `${layer.shape} sticker`
        : layer.fileName;
  return (
    <div className="pd-app">
      <header className="pd-top">
        <div className="pd-brand">
          <span className="pd-mark">
            <Layers size={19} />
          </span>
          <div>
            <strong>Product Designer</strong>
            <span>Make it yours, visually.</span>
          </div>
        </div>
        <div className="pd-top-actions">
          <label className="pd-button pd-secondary pd-file">
            Open project
            <input
              type="file"
              accept="application/json,.json"
              onChange={onImport}
              disabled={uploading}
            />
          </label>
          <button className="pd-button pd-secondary" onClick={reset}>
            <RotateCcw size={15} /> Reset canvas
          </button>
          <button
            className="pd-button pd-secondary"
            onClick={() => setModal(true)}
          >
            Export specs
          </button>
          <button className="pd-button pd-primary" onClick={saveJson}>
            <Download size={15} /> Save project
          </button>
        </div>
      </header>
      <div className="pd-workspace">
        <aside className="pd-sidebar">
          <div className="pd-side-heading">
            <span className="pd-kicker">DESIGN CONTROLS</span>
            <h1>Make your mark.</h1>
            <p>Choose a base, add a little personality, and make it yours.</p>
          </div>
          <div className="pd-tabs" role="tablist" aria-label="Design controls">
            {(
              [
                ["base", "Base", Box],
                ["text", "Text", Type],
                ["graphics", "Graphics", Sparkles],
              ] as const
            ).map(([key, title, Icon]) => (
              <button
                key={key}
                type="button"
                role="tab"
                id={`tab-${key}`}
                aria-controls="designer-panel"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                onKeyDown={(event) => {
                  if (event.key !== "ArrowRight" && event.key !== "ArrowLeft")
                    return;
                  event.preventDefault();
                  const all: Tab[] = ["base", "text", "graphics"];
                  const next =
                    all[
                      (all.indexOf(key) +
                        (event.key === "ArrowRight" ? 1 : 2)) %
                        all.length
                    ];
                  setTab(next);
                  window.document.getElementById(`tab-${next}`)?.focus();
                }}
              >
                <Icon size={16} />
                {title}
              </button>
            ))}
          </div>
          <div
            className="pd-panel"
            id="designer-panel"
            role="tabpanel"
            aria-labelledby={`tab-${tab}`}
          >
            {tab === "base" && (
              <>
                <div className="pd-section-head">
                  <div>
                    <h2>Choose your base</h2>
                    <p>Start with the product you want to personalize.</p>
                  </div>
                  <span>01</span>
                </div>
                <div className="pd-product-list">
                  {(
                    [
                      ["shirt", Shirt],
                      ["mug", Circle],
                      ["box", Package],
                    ] as const
                  ).map(([kind, Icon]) => (
                    <button
                      key={kind}
                      className={`pd-product ${project.product === kind ? "is-active" : ""}`}
                      onClick={() => selectProduct(kind)}
                      aria-pressed={project.product === kind}
                    >
                      <Icon size={19} />
                      <span>
                        {PRODUCTS[kind].label}
                        <small>Front view</small>
                      </span>
                      {project.product === kind && <Check size={16} />}
                    </button>
                  ))}
                </div>
                <label className="pd-field">
                  Material
                  <select
                    value={project.material}
                    onChange={(e) =>
                      setProject((p) => ({ ...p, material: e.target.value }))
                    }
                  >
                    {PRODUCTS[project.product].materials.map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </select>
                </label>
                <div className="pd-field">
                  <span>Base color</span>
                  <div className="pd-colors">
                    {[
                      "#e9e6de",
                      "#ffffff",
                      "#202b29",
                      "#9bb4a6",
                      "#c18e78",
                      "#d6b769",
                    ].map((color) => (
                      <button
                        key={color}
                        type="button"
                        aria-label={`Base color ${color}`}
                        aria-pressed={project.baseColor.toLowerCase() === color}
                        onClick={() =>
                          setProject((p) => ({ ...p, baseColor: color }))
                        }
                        style={{ background: color }}
                      />
                    ))}
                    <label
                      className="pd-color-custom"
                      title="Choose custom base color"
                    >
                      <input
                        type="color"
                        aria-label="Custom base color"
                        value={project.baseColor}
                        onChange={(e) =>
                          setProject((p) => ({
                            ...p,
                            baseColor: e.target.value,
                          }))
                        }
                      />
                      <Plus size={15} />
                    </label>
                  </div>
                  <span className="pd-hex">
                    {project.baseColor.toUpperCase()}
                  </span>
                </div>
              </>
            )}
            {tab === "text" && (
              <>
                <div className="pd-section-head">
                  <div>
                    <h2>Say it your way</h2>
                    <p>Add a message and refine the details.</p>
                  </div>
                  <span>02</span>
                </div>
                <button
                  className="pd-add"
                  onClick={addText}
                  disabled={project.layers.length >= MAX_LAYERS}
                >
                  <Plus size={16} /> Add text layer
                </button>
                {selected?.type === "text" ? (
                  <div className="pd-fields">
                    <label className="pd-field">
                      Your text
                      <input
                        maxLength={80}
                        value={selected.text}
                        onChange={(e) =>
                          patch(selected.id, { text: e.target.value })
                        }
                      />
                    </label>
                    <label className="pd-field">
                      Font family
                      <select
                        value={selected.font}
                        onChange={(e) =>
                          patch(selected.id, { font: e.target.value as Font })
                        }
                      >
                        {FONTS.map((f) => (
                          <option key={f}>{f}</option>
                        ))}
                      </select>
                    </label>
                    <label className="pd-field">
                      Text size{" "}
                      <span className="pd-value">{selected.fontSize} px</span>
                      <input
                        type="range"
                        min="10"
                        max="64"
                        value={selected.fontSize}
                        onChange={(e) =>
                          patch(selected.id, {
                            fontSize: Number(e.target.value),
                          })
                        }
                      />
                    </label>
                    <div className="pd-field">
                      <span>Style</span>
                      <div className="pd-inline">
                        <button
                          className="pd-toggle"
                          aria-pressed={selected.bold}
                          onClick={() =>
                            patch(selected.id, { bold: !selected.bold })
                          }
                        >
                          <b>Bold</b>
                        </button>
                        <button
                          className="pd-toggle"
                          aria-pressed={selected.italic}
                          onClick={() =>
                            patch(selected.id, { italic: !selected.italic })
                          }
                        >
                          <i>Italic</i>
                        </button>
                        <label className="pd-color-label">
                          Color{" "}
                          <input
                            type="color"
                            aria-label="Text color"
                            value={selected.color}
                            onChange={(e) =>
                              patch(selected.id, { color: e.target.value })
                            }
                          />
                        </label>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="pd-hint">
                    Add a text layer or select one on the canvas to edit it.
                  </p>
                )}
              </>
            )}
            {tab === "graphics" && (
              <>
                <div className="pd-section-head">
                  <div>
                    <h2>Make it visual</h2>
                    <p>Use a simple shape or bring your own artwork.</p>
                  </div>
                  <span>03</span>
                </div>
                <label
                  className={`pd-upload ${uploading || project.layers.length >= MAX_LAYERS ? "is-disabled" : ""}`}
                >
                  <ImagePlus size={22} />
                  <strong>{uploading ? "Loading…" : "Upload an image"}</strong>
                  <span>PNG, JPEG or WebP · max 1.5 MB / 2048 px</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={onImage}
                    disabled={uploading || project.layers.length >= MAX_LAYERS}
                  />
                </label>
                <h3 className="pd-small-heading">Simple shapes</h3>
                <div className="pd-stickers">
                  {STICKERS.map((shape) => (
                    <button
                      key={shape}
                      type="button"
                      aria-label={`Add ${shape} sticker`}
                      disabled={project.layers.length >= MAX_LAYERS}
                      onClick={() => addSticker(shape)}
                    >
                      <svg viewBox="0 0 100 100" aria-hidden="true">
                        <StickerArt shape={shape} color="#43675a" />
                      </svg>
                      <span>{shape}</span>
                    </button>
                  ))}
                </div>
                {selected?.type === "sticker" && (
                  <label className="pd-field pd-color-label">
                    Sticker color{" "}
                    <input
                      type="color"
                      value={selected.color}
                      onChange={(e) =>
                        patch(selected.id, { color: e.target.value })
                      }
                    />
                  </label>
                )}
              </>
            )}
            {selected && (
              <div className="pd-bounds">
                <h3>Selected layer</h3>
                <p>Position and size in canvas units.</p>
                <div className="pd-bound-grid">
                  {(["x", "y", "width", "height"] as const).map((key) => (
                    <label key={key}>
                      {key === "x"
                        ? "X"
                        : key === "y"
                          ? "Y"
                          : key === "width"
                            ? "Width"
                            : "Height"}
                      <input
                        type="number"
                        value={Math.round(selected[key])}
                        onChange={(e) => {
                          if (
                            e.target.value !== "" &&
                            Number.isFinite(e.target.valueAsNumber)
                          )
                            patch(selected.id, {
                              [key]: e.target.valueAsNumber,
                            });
                        }}
                      />
                    </label>
                  ))}
                </div>
                <button className="pd-delete" onClick={erase}>
                  <Trash2 size={15} /> Delete selected
                </button>
              </div>
            )}
          </div>
          <div className="pd-side-footer">
            <span>YOUR PROJECT</span>
            <label>
              Project name
              <input
                value={project.projectName}
                maxLength={100}
                onChange={(e) =>
                  setProject((p) => ({ ...p, projectName: e.target.value }))
                }
              />
            </label>
            <label>
              Project reference <small>(optional)</small>
              <input
                value={project.projectId}
                maxLength={100}
                placeholder="e.g. order or project ID"
                onChange={(e) =>
                  setProject((p) => ({ ...p, projectId: e.target.value }))
                }
              />
            </label>
            <p>
              Kept in this browser until you download it. No account or server
              save.
            </p>
          </div>
        </aside>
        <main className="pd-main">
          <div className="pd-canvas-heading">
            <div>
              <span className="pd-kicker">YOUR CANVAS</span>
              <h2>
                {PRODUCTS[project.product].label} <span>/ Front</span>
              </h2>
            </div>
            <div className="pd-live">
              <span /> LIVE PREVIEW
            </div>
          </div>
          <div className="pd-stage">
            <div className="pd-stage-label">
              <MousePointer2 size={14} /> Select, drag and resize inside the
              print area
            </div>
            <svg
              ref={svg}
              className="pd-canvas"
              viewBox="0 0 600 600"
              aria-label="Product design canvas"
              onPointerMove={pointerMove}
              onPointerUp={() => {
                drag.current = null;
              }}
              onPointerCancel={() => {
                drag.current = null;
              }}
              onPointerDown={(e) => {
                if (e.target === e.currentTarget) setSelectedId(null);
              }}
            >
              <rect width="600" height="600" fill="#f1f3ee" />
              <ellipse
                cx="300"
                cy="500"
                rx="151"
                ry="18"
                fill="#293a32"
                opacity=".08"
              />
              <ProductBase
                product={project.product}
                color={project.baseColor}
              />
              <defs>
                <clipPath id="pd-print-area">
                  <rect {...PRINT_AREA} />
                </clipPath>
                {project.layers
                  .filter((l) => l.type === "text")
                  .map((l) => (
                    <clipPath id={`pd-text-${l.id}`} key={l.id}>
                      <rect x={l.x} y={l.y} width={l.width} height={l.height} />
                    </clipPath>
                  ))}
              </defs>
              <rect
                {...PRINT_AREA}
                fill="none"
                stroke="#48685e"
                strokeDasharray="5 5"
                strokeWidth="1.5"
                opacity=".65"
                data-editor-only="true"
                pointerEvents="none"
              />
              <g clipPath="url(#pd-print-area)">
                {project.layers.map((layer) => (
                  <g
                    key={layer.id}
                    onPointerDown={(e) => pointerDown(e, layer, "move")}
                    style={{ cursor: "move" }}
                    aria-label={label(layer)}
                  >
                    {layer.type === "text" ? (
                      <text
                        x={layer.x + layer.width / 2}
                        y={layer.y + layer.height / 2}
                        textAnchor="middle"
                        dominantBaseline="central"
                        clipPath={`url(#pd-text-${layer.id})`}
                        fontFamily={layer.font}
                        fontSize={layer.fontSize}
                        fontWeight={layer.bold ? "bold" : "normal"}
                        fontStyle={layer.italic ? "italic" : "normal"}
                        fill={layer.color}
                      >
                        {layer.text}
                      </text>
                    ) : layer.type === "sticker" ? (
                      <svg
                        x={layer.x}
                        y={layer.y}
                        width={layer.width}
                        height={layer.height}
                        viewBox="0 0 100 100"
                        preserveAspectRatio="none"
                      >
                        <StickerArt shape={layer.shape} color={layer.color} />
                      </svg>
                    ) : (
                      <image
                        href={layer.dataUrl}
                        x={layer.x}
                        y={layer.y}
                        width={layer.width}
                        height={layer.height}
                        preserveAspectRatio="xMidYMid meet"
                      />
                    )}
                    <rect
                      x={layer.x}
                      y={layer.y}
                      width={layer.width}
                      height={layer.height}
                      fill="transparent"
                      data-editor-only="true"
                    />
                  </g>
                ))}
              </g>
              {selected && (
                <g data-editor-only="true">
                  <rect
                    x={selected.x}
                    y={selected.y}
                    width={selected.width}
                    height={selected.height}
                    fill="none"
                    stroke="#1b7160"
                    strokeWidth="2"
                    pointerEvents="none"
                  />
                  <rect
                    x={selected.x + selected.width - 6}
                    y={selected.y + selected.height - 6}
                    width="12"
                    height="12"
                    rx="2"
                    fill="white"
                    stroke="#1b7160"
                    strokeWidth="2"
                    style={{ cursor: "nwse-resize" }}
                    onPointerDown={(e) => pointerDown(e, selected, "resize")}
                  />
                </g>
              )}
            </svg>
            <div className="pd-stage-foot">
              <span>FRONT VIEW</span>
              <span>Printable area shown with dotted line</span>
            </div>
          </div>
          <div className="pd-bottom">
            <div>
              <strong>Ready to share?</strong>
              <span>
                Download a PNG preview or save the editable project file.
              </span>
            </div>
            <button
              className="pd-button pd-secondary"
              onClick={() => void png()}
            >
              <Download size={15} /> Download PNG
            </button>
          </div>
          {(error || notice) && (
            <div
              role={error ? "alert" : "status"}
              className={error ? "pd-message pd-error" : "pd-message"}
            >
              {error || notice}
            </div>
          )}
        </main>
        <aside className="pd-layers">
          <div className="pd-layer-title">
            <div>
              <span className="pd-kicker">YOUR DESIGN</span>
              <h2>
                Layers <span>{project.layers.length}</span>
              </h2>
            </div>
            <Layers size={18} />
          </div>
          <p>Top layers appear in front. Select a layer to edit.</p>
          {project.layers.length === 0 ? (
            <div className="pd-layer-empty">
              <span>
                <Layers size={20} />
              </span>
              <strong>A fresh canvas</strong>
              <p>Add text or graphics to see your layers here.</p>
            </div>
          ) : (
            <ol className="pd-layer-list">
              {[...project.layers].reverse().map((layer) => (
                <li key={layer.id}>
                  <button
                    className={selectedId === layer.id ? "is-active" : ""}
                    onClick={() => {
                      setSelectedId(layer.id);
                      setTab(layer.type === "text" ? "text" : "graphics");
                    }}
                  >
                    <span className="pd-layer-icon">
                      {layer.type === "text" ? (
                        <Type size={16} />
                      ) : (
                        <Sparkles size={16} />
                      )}
                    </span>
                    <span className="pd-layer-name">
                      {label(layer)}
                      <small>
                        {layer.type === "image"
                          ? "Image"
                          : layer.type === "sticker"
                            ? "Shape"
                            : "Text"}
                      </small>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          )}
          {selected && (
            <div className="pd-layer-actions">
              <button
                onClick={() => order(1)}
                disabled={project.layers.at(-1)?.id === selected.id}
                aria-label="Move layer forward"
              >
                <ArrowUp size={15} /> Forward
              </button>
              <button
                onClick={() => order(-1)}
                disabled={project.layers[0]?.id === selected.id}
                aria-label="Move layer backward"
              >
                <ArrowDown size={15} /> Backward
              </button>
              <button onClick={erase} aria-label="Delete selected layer">
                <Trash2 size={15} />
              </button>
            </div>
          )}
          <div className="pd-note">
            <strong>Made for exploration</strong>
            <p>
              This is a 2D visual mockup. Confirm physical dimensions and
              material availability with your manufacturer.
            </p>
          </div>
        </aside>
      </div>
      <dialog
        ref={dialog}
        onClose={() => setModal(false)}
        className="pd-dialog"
      >
        <div className="pd-dialog-head">
          <div>
            <span className="pd-kicker">DESIGN SUMMARY</span>
            <h2>Export specs</h2>
          </div>
          <button aria-label="Close specs" onClick={() => setModal(false)}>
            <X size={20} />
          </button>
        </div>
        <p>
          Exact settings from this mockup. Canvas units are not physical
          measurements; confirm production dimensions separately. Image
          dimensions describe its layer box; the image is fitted inside it.
        </p>
        <dl className="pd-spec-grid">
          <dt>Project</dt>
          <dd>{project.projectName || "Untitled project"}</dd>
          <dt>Reference</dt>
          <dd>{project.projectId || "Not provided"}</dd>
          <dt>Product / view</dt>
          <dd>{PRODUCTS[project.product].label} / front</dd>
          <dt>Material selection</dt>
          <dd>{project.material}</dd>
          <dt>Base color</dt>
          <dd>{project.baseColor.toUpperCase()}</dd>
          <dt>Canvas</dt>
          <dd>600 × 600 units</dd>
          <dt>Print area</dt>
          <dd>
            {PRINT_AREA.width} × {PRINT_AREA.height} units, at X {PRINT_AREA.x},
            Y {PRINT_AREA.y}
          </dd>
        </dl>
        <h3>Layers, back to front</h3>
        {project.layers.length ? (
          <ol className="pd-spec-layers">
            {project.layers.map((l, i) => (
              <li key={l.id}>
                <strong>
                  {i + 1}. {label(l)}
                </strong>
                <span>
                  {l.type} · X {l.x}, Y {l.y} · {l.width} × {l.height} units
                </span>
                {l.type === "text" && (
                  <span>
                    {l.font} · {l.fontSize} px · {l.bold ? "bold" : "regular"}
                    {l.italic ? " · italic" : ""} · {l.color.toUpperCase()}
                  </span>
                )}
                {l.type === "sticker" && (
                  <span>Color {l.color.toUpperCase()}</span>
                )}
              </li>
            ))}
          </ol>
        ) : (
          <p>No layers added.</p>
        )}
        <div className="pd-dialog-actions">
          <button
            className="pd-button pd-secondary"
            onClick={() => setModal(false)}
          >
            Close
          </button>
          <button className="pd-button pd-primary" onClick={saveJson}>
            <Download size={15} /> Download project JSON
          </button>
        </div>
      </dialog>
    </div>
  );
}
