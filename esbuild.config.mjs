import esbuild from "esbuild";
import process from "process";
import fs from "fs";
import path from "path";

const prod = process.argv[2] === "production";

// Read xterm assets at build time and embed as strings
const readAsset = (relPath) => {
  // Try local node_modules first, then build dir node_modules
  const candidates = [
    path.join("node_modules", relPath),
    path.join("../rackbase/node_modules", relPath),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return fs.readFileSync(p, "utf8");
  }
  throw new Error(`Asset not found: ${relPath}`);
};

const xtermJs  = readAsset("xterm/lib/xterm.js");
const xtermCss = readAsset("xterm/css/xterm.css");
const fitJs    = readAsset("xterm-addon-fit/lib/xterm-addon-fit.js");

// Inject these as virtual modules importable from TS
const assetPlugin = {
  name: "asset-inline",
  setup(build) {
    build.onLoad({ filter: /\.html$/ }, (args) => {
      const contents = fs.readFileSync(args.path, "utf8");
      return { contents: `export default ${JSON.stringify(contents)};`, loader: "js" };
    });
    build.onResolve({ filter: /^xterm-inline$/ }, () => ({ path: "xterm-inline", namespace: "asset" }));
    build.onLoad({ filter: /^xterm-inline$/, namespace: "asset" }, () => ({
      contents: `export const xtermJs=${JSON.stringify(xtermJs)};export const xtermCss=${JSON.stringify(xtermCss)};export const fitJs=${JSON.stringify(fitJs)};`,
      loader: "js",
    }));
  },
};

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  platform: "node",
  external: [
    "obsidian", "electron",
    "crypto", "fs", "net", "tls", "http", "https", "stream",
    "events", "path", "dns", "util", "buffer", "zlib",
    "child_process", "os", "assert",
    // ssh2 optional native deps — not needed for basic SSH
    "cpu-features", "nan",
    "@codemirror/autocomplete", "@codemirror/collab", "@codemirror/commands",
    "@codemirror/language", "@codemirror/lint", "@codemirror/search",
    "@codemirror/state", "@codemirror/view",
    "@lezer/common", "@lezer/highlight", "@lezer/lr",
  ],
  format: "cjs",
  target: "es2020",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
  plugins: [assetPlugin],
});

if (prod) {
  await context.rebuild();
  process.exit(0);
} else {
  await context.watch();
}
