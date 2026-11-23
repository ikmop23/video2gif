# GIF Maker — no external runtime libraries

A static, browser-only video-to-GIF converter. It uses the browser's native video decoder and Canvas, plus a small GIF89a/LZW encoder written in `app.js`.

## Privacy and runtime behavior

- The selected video is read through a local `blob:` URL and is never uploaded by this app.
- No FFmpeg, WebAssembly, npm, CDN, third-party library, cookie, localStorage, or IndexedDB is used.
- The generated GIF stays in the current page's memory until the page is closed or reloaded.
- The app does not save anything to Photos or Files automatically. The user must press **GIFを保存**.
- Browser cache may retain the static HTML/CSS/JS site files, as with a normal website. It does not store the selected video or generated GIF.

## Deploy directly with GitHub Pages

No Node.js or npm is required.

1. Create a GitHub repository.
2. Put `index.html`, `style.css`, `app.js`, and the `.github` folder at the repository root.
3. In the repository, open **Settings → Pages**.
4. Under **Build and deployment**, select **GitHub Actions** as the source.
5. Push to the `main` branch. The included workflow publishes the site.
6. Open the Pages URL shown by GitHub.

Alternatively, choose **Deploy from a branch → main → /(root)** in Pages settings and publish the static files directly.

## Browser notes

Video decoding is provided by the browser, not by a bundled codec. The input must be playable in the browser (for example, H.264 MP4 is broadly supported). Other codecs depend on the browser and OS. iPhone Safari can process locally selected videos, but very long/high-resolution clips may exceed mobile memory or processing limits. The app limits work to 300 frames and 36 million output pixels per conversion.

On iPhone, the save action may open a GIF preview instead of immediately placing a file in Photos. Use Safari's Share menu and **Save to Photos** when that option is shown.

## Included controls

- Trim start/end time
- Maximum output edge (320 / 480 / 640 / 800 px)
- Frame rate (6 / 8 / 10 / 12 / 15 / 20 FPS)
- Palette size (64 / 128 / 256 colors)
- Infinite loop or play once
- Preview, progress, and input-vs-output file-size comparison

## Limitations

- It converts only formats the browser can decode; there is no server-side or software codec fallback.
- GIF supports up to 256 colors per frame. This implementation creates one shared palette for the animation to keep colors consistent.
- The generated GIF is opaque; video alpha/transparency is not preserved.
- The file size may be larger than the source video. GIF and video use very different compression methods.
