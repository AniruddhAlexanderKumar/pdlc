# Standalone Product Designer

The standalone frontend is built at `/product-designer.html`. It runs independently of the authenticated application, does not call an API, and stores no designs in a database or browser storage. It can be embedded as an iframe on a website that serves this build:

```html
<iframe
  title="Product designer"
  src="/product-designer.html?projectId=example-reference&projectName=My%20project"
  style="width:100%; min-height:900px; border:0"
  loading="lazy">
</iframe>
```

For another origin, use the full deployed URL instead of the relative path. The optional query parameters initialise editable project metadata and are included in the JSON export. They are **references only**, not authentication, validated links to existing workspace projects, or permission boundaries. Do not put secrets or personal information in the URL. Each iframe has an independent in-memory design; integration with the existing project database would require separately designed authentication and server-side authorization. There is no parent-window messaging or automatic saving.

## Capabilities and limitations

- Front-view **2D illustration**, not 3D, photorealism, a CAD model or a production-ready print proof. T-shirt, mug and box shapes and colors are visual approximations; material is a chosen label, not a simulated surface or verified availability.
- Add/edit text, supported stickers and PNG/JPEG/WebP images; drag/resize within the rectangular print area, edit numeric canvas bounds, reorder or delete layers. Maximum 12 layers. Each uploaded raster image is limited to 1.5 MB and 2048 × 2048 pixels. Uploaded SVGs and remote image URLs are not accepted.
- Download a versioned JSON file and reopen it locally. It includes uploaded image data, names, project metadata and design settings; it is not encrypted. Unsupported/invalid project files are rejected. Download a 1200 × 1200 PNG preview. JSON and PNG downloads depend on browser and embedding policies; keep a copy before leaving. Browser termination can lose in-memory work.
- The specs modal reports exact selected settings and layer bounding boxes in the **600 × 600 canvas coordinate system**, not millimetres or real-world production measurements. An image fits within its layer box while preserving aspect ratio; a long text layer can be clipped. Colors can differ by screen, material and manufacturing process. Confirm materials, printable area, physical dimensions and output with the manufacturer. Font rendering can vary by system; fonts are not embedded.
- Reset asks for confirmation, clears the design and retains the project name/reference. Import asks before replacing the current design.

## Embedding and security

The Express static server permits framing only for the exact standalone HTML document; normal application pages retain their frame-denial policy. The Cloudflare Pages `_headers` file supplies a separate CSP for the designer. This deliberately makes this **public, unauthenticated, client-only** page frameable by any origin; it must not be extended with authenticated or sensitive operations without revisiting that policy. A host's own CSP, sandbox flags, download policies, proxy headers or additional Cloudflare rules can still block scripts, framing, confirmation dialogs or downloads. Deployment-specific headers must be verified in the actual hosting environment; a local test cannot verify Cloudflare configuration.

## Verification

The model tests cover bounds, malformed/hostile imports and image signatures. The standalone browser smoke runs against a local Express static build and a different-origin local iframe host, with no API or database: product and text changes, direct pointer dragging/resizing, stickers, image upload, specs, project JSON download/reopen, PNG content and dimensions, ordering/deletion, invalid image rejection, responsive widths and preservation of frame denial on normal app pages. This does not prove behavior in every browser, production hosting, physical-print accuracy, accessibility in every assistive technology or project-level access control.
