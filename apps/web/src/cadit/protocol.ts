/** Public, unsigned CADit embed protocol. No application identity is passed to CADit. */
export const CADIT_ORIGIN = "https://app.cadit.app";
export const CADIT_URL = `${CADIT_ORIGIN}/new?embed=true&partnerName=Solution%20Velocity`;
export const CADIT_INIT = {
  type: "init",
  payload: { partnerName: "Solution Velocity", features: ["export"] },
};

type CaditMessage =
  | { type: "ready" }
  | { type: "export-stl"; blob: Blob; filename: string }
  | { type: "invalid-export" };

export function readCaditMessage(
  event: Pick<MessageEvent, "origin" | "source" | "data">,
  expectedWindow: Window | null,
): CaditMessage | null {
  if (
    !expectedWindow ||
    event.origin !== CADIT_ORIGIN ||
    event.source !== expectedWindow ||
    !event.data ||
    typeof event.data !== "object"
  )
    return null;
  if (event.data.type === "ready") return { type: "ready" };
  if (event.data.type !== "export-stl") return null;
  const payload = event.data.payload;
  if (
    !payload ||
    typeof payload !== "object" ||
    !(payload.blob instanceof Blob) ||
    payload.blob.size === 0 ||
    typeof payload.filename !== "string"
  )
    return { type: "invalid-export" };
  // Suggested filenames are untrusted; keep a simple local basename with an STL extension.
  const name =
    payload.filename
      .split(/[\\/]/)
      .pop()
      ?.replace(/[\x00-\x1f\x7f]/g, "")
      .trim()
      .slice(0, 180) || "design.stl";
  return {
    type: "export-stl",
    blob: payload.blob,
    filename: /\.stl$/i.test(name) ? name : `${name}.stl`,
  };
}
