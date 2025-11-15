# streaming-jpeg

A high-performance, universal, streaming JPEG encoder powered by Rust/WebAssembly. Designed for maximum quality and constant memory usage through horizontal strip processing.

## Features

- **Streaming Architecture**: Process images in 8-scanline strips for constant memory usage
- **Maximum Quality**: Optimized for 4:4:4 chroma subsampling and quality 100 (configurable)
- **Rust/WebAssembly Core**: High-performance DCT, quantization, and Huffman encoding
- **Universal (Isomorphic)**: Works seamlessly in both browser and Node.js environments
- **Worker Pool**: Multi-threaded encoding using Web Workers (browser) or worker_threads (Node.js)
- **TypeScript**: Full type safety with comprehensive type definitions
- **Multiple Distribution Formats**: ESM, CommonJS, and browser bundles

## Installation

```bash
npm install streaming-jpeg
```

## Prerequisites

To build from source, you'll need:
- **Node.js** 20+
- **Rust** 1.70+ with `wasm-pack` installed
- **wasm-pack**: `cargo install wasm-pack`

## Quick Start

### Browser Usage

```javascript
import { encode } from 'streaming-jpeg';

// From Canvas
const canvas = document.getElementById('myCanvas');
const jpegBlob = await encode(canvas, { quality: 95 });

// From ImageData
const ctx = canvas.getContext('2d');
const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
const jpegBlob = await encode(imageData, { quality: 100 });

// From raw RGBA buffer
const width = 640;
const height = 480;
const rgbaBuffer = new Uint8Array(width * height * 4);
const jpegBlob = await encode(rgbaBuffer, { width, height, quality: 100 });

// Download the result
const url = URL.createObjectURL(jpegBlob);
const a = document.createElement('a');
a.href = url;
a.download = 'image.jpg';
a.click();
```

### Node.js Usage

```javascript
import { encode } from 'streaming-jpeg';
import { writeFile } from 'fs/promises';

// From file
const jpegBuffer = await encode('input.raw', {
  width: 1920,
  height: 1080,
  quality: 100
});
await writeFile('output.jpg', jpegBuffer);

// From Buffer
const rgbaBuffer = Buffer.alloc(640 * 480 * 4);
const jpegBuffer = await encode(rgbaBuffer, {
  width: 640,
  height: 480,
  quality: 95
});

// From Stream
import { createReadStream } from 'fs';
const stream = createReadStream('input.raw');
const jpegBuffer = await encode(stream, {
  width: 1920,
  height: 1080,
  quality: 100
});
```

## Building from Source

```bash
# Install all dependencies
npm install

# Build WebAssembly engine
npm run build:wasm

# Build JavaScript orchestrator
npm run build:js

# Or build everything
npm run build

# Run tests
npm test

# Run all tests (unit + integration)
npm run test:all
```

## Project Structure

```
streaming-jpeg/
├── packages/
│   ├── wasm-engine/               # Rust/WebAssembly encoding core
│   │   ├── src/
│   │   │   └── lib.rs            # DCT, quantization, Huffman encoding
│   │   ├── Cargo.toml
│   │   └── package.json
│   └── js-orchestrator/          # JavaScript/TypeScript orchestrator
│       ├── src/
│       │   ├── core/             # Universal core logic
│       │   │   ├── encoder.ts    # Main encoder class
│       │   │   ├── jpeg-markers.ts # JPEG header/footer generation
│       │   │   └── constants.ts  # Quantization tables, constants
│       │   ├── browser/          # Browser-specific code
│       │   │   ├── index.ts      # Browser entry point
│       │   │   └── worker-pool.ts # Web Worker pool
│       │   └── node/             # Node.js-specific code
│       │       ├── index.ts      # Node.js entry point
│       │       └── worker-pool.ts # worker_threads pool
│       └── package.json
├── tests/
│   ├── unit/                     # Unit tests
│   │   ├── constants.test.ts
│   │   ├── jpeg-markers.test.ts
│   │   └── encoder.test.ts
│   └── integration/              # Integration tests
│       └── encoder-integration.test.ts
├── scripts/                      # Build scripts
├── package.json                  # Root package with workspaces
└── README.md
```

## Available Scripts

- `npm run clean` - Remove build artifacts
- `npm run build` - Build all formats (ESM, CJS, bundles)
- `npm run build:esm` - Build ESM only
- `npm run build:cjs` - Build CommonJS only
- `npm run build:bundles` - Build browser bundles
- `npm run build:docs` - Build documentation assets
- `npm test` - Run unit tests
- `npm run test:browser` - Run browser tests
- `npm run test:all` - Run all tests
- `npm run coverage` - Generate coverage report
- `npm run smoke` - Run smoke tests
- `npm run size` - Check bundle sizes
- `npm run prepublishOnly` - Pre-publish checks (runs automatically)

## GitHub Actions Setup

### Required Secrets

For automated releases and NPM publishing, configure these secrets in your GitHub repository:

1. **RELEASE_TOKEN**: A GitHub Personal Access Token with `repo` and `packages:write` permissions
   - Go to GitHub Settings → Developer settings → Personal access tokens
   - Create a token with appropriate permissions
   - Add it to your repository secrets as `RELEASE_TOKEN`

2. **NPM Publishing**: This template uses OIDC for npm publishing (no token storage required)
   - Configure your npm account for provenance: https://docs.npmjs.com/generating-provenance-statements
   - No additional secrets needed!

### Automated Version Bumping

Commits to `main` trigger automatic version bumping based on commit messages:

- **Patch** (0.0.x): Include `patch`, `fix`, or `fixes` in commit message
- **Minor** (0.x.0): Include `minor`, `feat`, or `feature` in commit message
- **Major** (x.0.0): Include `major` or `breaking` in commit message
- **Pre-release**: Include `rc`, `pre`, `beta`, or `alpha` in commit message

Example:
```bash
git commit -m "feat: add new feature"  # Bumps minor version
git commit -m "fix: resolve bug"       # Bumps patch version
```

### GitHub Pages

To enable GitHub Pages:
1. Go to repository Settings → Pages
2. Set Source to "GitHub Actions"
3. The workflow will deploy `docs-dist/` to GitHub Pages

Add your documentation HTML/assets to a `docs/` directory, and they'll be copied to the deployment.

## Distribution Formats

### ESM (ES Modules)
```javascript
import { hello, Greeter } from 'my-library';
```

### CommonJS
```javascript
const { hello, Greeter } = require('my-library');
```

### Browser (IIFE)
```html
<script src="https://unpkg.com/my-library/dist/browser/my-library.min.js"></script>
<script>
  const greeting = MyLibrary.hello('World');
</script>
```

### Browser (ESM)
```html
<script type="module">
  import { hello } from 'https://unpkg.com/my-library/dist/bundles/my-library.esm.js';
  console.log(hello('World'));
</script>
```

## Testing

This template uses Node.js built-in test framework (no Jest, Mocha, etc. required).

### Writing Tests

Create test files alongside your source code:

```typescript
// src/mymodule.test.ts
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { myFunction } from './mymodule.js';

describe('myFunction', () => {
  it('should work correctly', () => {
    assert.strictEqual(myFunction(), 'expected result');
  });
});
```

### Browser Testing

Browser tests validate that your bundles work in browser environments:

```typescript
// tests/browser.test.ts
import { test } from 'node:test';
import assert from 'node:assert';

test('bundle exports work', async () => {
  const mod = await import('./dist/bundles/my-library.esm.js');
  assert.strictEqual(typeof mod.myFunction, 'function');
});
```

## Dependencies

- **Development**:
  - `typescript` - TypeScript compiler
  - `@types/node` - Node.js type definitions
  - `c8` - Code coverage tool
  - `happy-dom` - Lightweight DOM for browser testing

- **Production**: Add your runtime dependencies to `package.json`

## Customization

### Change Bundle Size Limits

Edit `scripts/check-bundle-size.mjs`:

```javascript
const BUNDLE_LIMIT = 100 * 1024;  // 100KB
const GZIP_LIMIT = 50 * 1024;     // 50KB
const ESM_LIMIT = 200 * 1024;     // 200KB
```

### Add Linting

This template doesn't include ESLint/Prettier by default. To add them:

```bash
npm install -D eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin prettier
```

Then configure `.eslintrc.json` and `.prettierrc` to your preferences.

### Customize TypeScript

The template includes 5 TypeScript configurations:
- `tsconfig.base.json` - Shared base configuration
- `tsconfig.json` - Root config (type checking only)
- `tsconfig.esm.json` - ESM build
- `tsconfig.cjs.json` - CommonJS build
- `tsconfig.tests.json` - Test build

Modify these to match your needs (e.g., change target, add paths, etc.).

## Publishing

### Manual Publishing

```bash
npm run build
npm test
npm publish
```

### Automated Publishing

When you create a GitHub release (triggered automatically by version bump), the library is automatically published to npm via GitHub Actions.

## License

MIT (or update to your preferred license in `package.json`)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes with tests
4. Ensure all tests pass: `npm run test:all`
5. Submit a pull request

## Troubleshooting

### Tests fail with "Module not found"

Run `npm run build` before running tests. The tests import from the built output.

### Bundle size check fails

Either optimize your code or update the limits in `scripts/check-bundle-size.mjs`.

### GitHub Actions fail on release

Ensure `RELEASE_TOKEN` is configured in repository secrets with appropriate permissions.

### NPM publish fails

1. Check that your npm account has 2FA enabled
2. Verify OIDC is configured: https://docs.npmjs.com/generating-provenance-statements
3. Ensure package name is available on npm
