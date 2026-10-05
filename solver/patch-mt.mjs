// The multithreaded build is served as plain static files from public/solver-mt (bundling it
// pulls app code into the thread workers). Without a bundler, wasm-bindgen-rayon's helper can't
// import the package directory, so point it at the actual module file.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const snippets = new URL('../public/solver-mt/snippets/', import.meta.url);
for (const dir of readdirSync(snippets)) {
  const file = new URL(`${dir}/src/workerHelpers.js`, snippets);
  const code = readFileSync(file, 'utf8');
  const patched = code.replace("import('../../..')", "import('../../../poker_royale_solver.js')");
  if (patched === code && !code.includes('poker_royale_solver.js')) {
    throw new Error(`Could not patch ${file.pathname}`);
  }
  writeFileSync(file, patched);
}
console.log('patched wasm-bindgen-rayon worker helper');
