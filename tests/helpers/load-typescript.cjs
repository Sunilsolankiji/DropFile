const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

// Compile only local TypeScript in memory; dependencies use Node's real loader.
function loadTypeScript(filename, cache = new Map()) {
  filename = path.resolve(filename);
  if (cache.has(filename)) return cache.get(filename).exports;
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
    },
  });
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  cache.set(filename, loaded);
  const nativeRequire = Module.createRequire(filename);
  loaded.require = specifier => {
    if (specifier.startsWith('.')) {
      const candidate = path.resolve(path.dirname(filename), specifier);
      const source = [candidate, `${candidate}.ts`, path.join(candidate, 'index.ts')]
        .find(file => file.endsWith('.ts') && fs.existsSync(file));
      if (source) return loadTypeScript(source, cache);
    }
    return nativeRequire(specifier);
  };
  loaded._compile(compiled.outputText, filename);
  loaded.loaded = true;
  return loaded.exports;
}

module.exports = { loadTypeScript };
