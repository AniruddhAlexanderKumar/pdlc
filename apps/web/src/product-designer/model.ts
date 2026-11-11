export const PRINT_AREA = { x: 208, y: 218, width: 184, height: 190 } as const;
export const MAX_LAYERS = 12;
export const MAX_IMAGE_BYTES = 1_500_000;
export const MAX_PROJECT_BYTES = 26_000_000;
export const PRODUCTS = {
  shirt: { label: "T-shirt", materials: ["Cotton", "Cotton blend"] },
  mug: { label: "Mug", materials: ["Ceramic", "Enamel"] },
  box: { label: "Packaging box", materials: ["Cardboard", "Kraft board"] },
} as const;
export const FONTS = ["Arial", "Georgia", "Verdana", "Courier New"] as const;
export const STICKERS = ["star", "heart", "circle", "bolt"] as const;
export type Product = keyof typeof PRODUCTS;
export type Font = (typeof FONTS)[number];
export type Sticker = (typeof STICKERS)[number];
type Bounds = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};
export type TextLayer = Bounds & {
  type: "text";
  text: string;
  font: Font;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  color: string;
};
export type StickerLayer = Bounds & {
  type: "sticker";
  shape: Sticker;
  color: string;
};
export type ImageLayer = Bounds & {
  type: "image";
  dataUrl: string;
  fileName: string;
};
export type Layer = TextLayer | StickerLayer | ImageLayer;
export type Project = {
  schemaVersion: 1;
  projectName: string;
  projectId: string;
  product: Product;
  material: string;
  baseColor: string;
  layers: Layer[];
};
export const initialProject = (): Project => ({
  schemaVersion: 1,
  projectName: "Untitled project",
  projectId: "",
  product: "shirt",
  material: "Cotton",
  baseColor: "#e9e6de",
  layers: [],
});
export function fitBounds<T extends Bounds>(layer: T): T {
  const width = Math.max(24, Math.min(PRINT_AREA.width, layer.width));
  const height = Math.max(24, Math.min(PRINT_AREA.height, layer.height));
  return {
    ...layer,
    width,
    height,
    x: Math.max(
      PRINT_AREA.x,
      Math.min(PRINT_AREA.x + PRINT_AREA.width - width, layer.x),
    ),
    y: Math.max(
      PRINT_AREA.y,
      Math.min(PRINT_AREA.y + PRINT_AREA.height - height, layer.y),
    ),
  };
}
export const startBounds = () => ({
  id: crypto.randomUUID(),
  x: 237,
  y: 273,
  width: 126,
  height: 66,
});
export function hex(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}
export function sniffImage(
  bytes: Uint8Array,
): "image/png" | "image/jpeg" | "image/webp" | null {
  if (
    bytes.length >= 8 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)
  )
    return "image/png";
  if (
    bytes.length >= 3 &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[2] === 255
  )
    return "image/jpeg";
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  )
    return "image/webp";
  return null;
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function hasOnly(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}
function imageUrlValid(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 30
  )
    return false;
  const m =
    /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(
      value,
    );
  if (!m || m[2].length % 4 !== 0) return false;
  try {
    const raw = atob(m[2]);
    return (
      raw.length <= MAX_IMAGE_BYTES &&
      sniffImage(Uint8Array.from(raw.slice(0, 12), (c) => c.charCodeAt(0))) ===
        m[1]
    );
  } catch {
    return false;
  }
}
/** Reject untrusted imports rather than silently dropping, moving or changing content. */
export function parseProject(value: unknown): Project {
  if (
    !record(value) ||
    !hasOnly(value, [
      "schemaVersion",
      "projectName",
      "projectId",
      "product",
      "material",
      "baseColor",
      "layers",
    ]) ||
    value.schemaVersion !== 1 ||
    typeof value.projectName !== "string" ||
    value.projectName.length > 100 ||
    typeof value.projectId !== "string" ||
    value.projectId.length > 100 ||
    typeof value.product !== "string" ||
    !Object.hasOwn(PRODUCTS, value.product) ||
    !hex(value.baseColor) ||
    !Array.isArray(value.layers) ||
    value.layers.length > MAX_LAYERS
  )
    throw new Error("This is not a supported product designer project.");
  const product = value.product as Product;
  if (
    typeof value.material !== "string" ||
    !(PRODUCTS[product].materials as readonly string[]).includes(value.material)
  )
    throw new Error("The project contains an unsupported material.");
  const ids = new Set<string>();
  const layers: Layer[] = value.layers.map((raw) => {
    if (
      !record(raw) ||
      typeof raw.id !== "string" ||
      !/^[a-zA-Z0-9-]{1,80}$/.test(raw.id) ||
      ids.has(raw.id)
    )
      throw new Error("The project has invalid layer IDs.");
    ids.add(raw.id);
    const { x, y, width, height } = raw;
    if (
      ![x, y, width, height].every(
        (n) => typeof n === "number" && Number.isFinite(n),
      ) ||
      (width as number) < 24 ||
      (height as number) < 24 ||
      (x as number) < PRINT_AREA.x ||
      (y as number) < PRINT_AREA.y ||
      (x as number) + (width as number) > PRINT_AREA.x + PRINT_AREA.width ||
      (y as number) + (height as number) > PRINT_AREA.y + PRINT_AREA.height
    )
      throw new Error("The project has invalid layer bounds.");
    const bounds = {
      id: raw.id,
      x: x as number,
      y: y as number,
      width: width as number,
      height: height as number,
    };
    if (
      raw.type === "text" &&
      hasOnly(raw, [
        "id",
        "type",
        "x",
        "y",
        "width",
        "height",
        "text",
        "font",
        "fontSize",
        "bold",
        "italic",
        "color",
      ]) &&
      typeof raw.text === "string" &&
      raw.text.length <= 80 &&
      typeof raw.font === "string" &&
      (FONTS as readonly string[]).includes(raw.font) &&
      typeof raw.fontSize === "number" &&
      Number.isFinite(raw.fontSize) &&
      raw.fontSize >= 10 &&
      raw.fontSize <= 64 &&
      typeof raw.bold === "boolean" &&
      typeof raw.italic === "boolean" &&
      hex(raw.color)
    )
      return {
        ...bounds,
        type: "text",
        text: raw.text,
        font: raw.font as Font,
        fontSize: raw.fontSize,
        bold: raw.bold,
        italic: raw.italic,
        color: raw.color,
      };
    if (
      raw.type === "sticker" &&
      hasOnly(raw, [
        "id",
        "type",
        "x",
        "y",
        "width",
        "height",
        "shape",
        "color",
      ]) &&
      typeof raw.shape === "string" &&
      (STICKERS as readonly string[]).includes(raw.shape) &&
      hex(raw.color)
    )
      return {
        ...bounds,
        type: "sticker",
        shape: raw.shape as Sticker,
        color: raw.color,
      };
    if (
      raw.type === "image" &&
      hasOnly(raw, [
        "id",
        "type",
        "x",
        "y",
        "width",
        "height",
        "fileName",
        "dataUrl",
      ]) &&
      typeof raw.fileName === "string" &&
      raw.fileName.length <= 120 &&
      imageUrlValid(raw.dataUrl)
    )
      return {
        ...bounds,
        type: "image",
        fileName: raw.fileName,
        dataUrl: raw.dataUrl,
      };
    throw new Error("The project contains an unsupported layer.");
  });
  return {
    schemaVersion: 1,
    projectName: value.projectName,
    projectId: value.projectId,
    product,
    material: value.material,
    baseColor: value.baseColor,
    layers,
  };
}
