// Read-only source census; generated outputs stay inside this review directory.
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import ts from 'typescript';

const outputRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.resolve(outputRoot, '../../..');
const normalize = (value) => value.replaceAll('\\', '/');
const walk = (directory) => fs.readdirSync(directory, { withFileTypes: true })
  .sort((a, b) => a.name.localeCompare(b.name, 'en'))
  .flatMap((entry) => entry.isDirectory()
    ? walk(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
const roots = ['src', 'tests', 'extension', 'scripts'];
const extensions = /\.(?:ts|tsx|mjs|js|css|ps1|iss)$/u;
const files = roots.flatMap((directory) => walk(path.join(root, directory)))
  .filter((file) => extensions.test(file))
  .map((file) => {
    const content = fs.readFileSync(file, 'utf8');
    return { path: normalize(path.relative(root, file)), bytes: fs.statSync(file).size,
      lines: content.split(/\r?\n/u).length, sha256: createHash('sha256').update(content).digest('hex') };
  }).sort((a, b) => a.path.localeCompare(b.path, 'en'));
const sourceFiles = files.filter((file) => file.path.startsWith('src/') && /\.tsx?$/u.test(file.path));
const sourcePaths = new Set(sourceFiles.map((file) => file.path));
const options = ts.readConfigFile(path.join(root, 'tsconfig.json'), ts.sys.readFile).config;
const compilerOptions = ts.convertCompilerOptionsFromJson(options.compilerOptions, root).options;
const edges = [];
const unresolved = [];
const resolve = (from, specifier, typeOnly, kind, line) => {
  if (!specifier.startsWith('.')) return; // package/native/runtime IPC edges are documented separately
  const resolved = ts.resolveModuleName(specifier, path.join(root, from), compilerOptions, ts.sys)
    .resolvedModule?.resolvedFileName;
  const target = resolved ? normalize(path.relative(root, resolved)) : null;
  if (target && sourcePaths.has(target)) edges.push({ from, to: target, typeOnly, kind, line });
  else if (/\.(?:css|png|jpg|hdr|wasm|json)(?:\?|$)/u.test(specifier) || specifier.includes('?')) return;
  else unresolved.push({ from, specifier, line });
};
for (const file of sourceFiles) {
  const content = fs.readFileSync(path.join(root, file.path), 'utf8');
  const ast = ts.createSourceFile(file.path, content, ts.ScriptTarget.Latest, true);
  const lineAt = (node) => ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1;
  const visit = (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const bindings = node.importClause?.namedBindings;
      const allNamedType = bindings && ts.isNamedImports(bindings) && bindings.elements.length > 0
        && bindings.elements.every((element) => element.isTypeOnly) && !node.importClause?.name;
      resolve(file.path, node.moduleSpecifier.text, Boolean(node.importClause?.isTypeOnly || allNamedType),
        'import', lineAt(node));
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const allNamedType = node.exportClause && ts.isNamedExports(node.exportClause)
        && node.exportClause.elements.length > 0 && node.exportClause.elements.every((element) => element.isTypeOnly);
      resolve(file.path, node.moduleSpecifier.text, Boolean(node.isTypeOnly || allNamedType), 'export', lineAt(node));
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
      && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
      resolve(file.path, node.arguments[0].text, false, 'dynamic-import', lineAt(node));
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
}
const counts = new Map(sourceFiles.map((file) => [file.path, { imports: 0, importers: new Set() }]));
for (const edge of edges) {
  counts.get(edge.from).imports++;
  counts.get(edge.to).importers.add(edge.from);
}
for (const file of sourceFiles) {
  const count = counts.get(file.path);
  file.localImportDeclarations = count.imports;
  file.localImporters = count.importers.size;
}
const groups = Object.fromEntries(roots.map((directory) => {
  const entries = files.filter((file) => file.path.startsWith(`${directory}/`));
  return [directory, { files: entries.length, physicalLines: entries.reduce((sum, file) => sum + file.lines, 0),
    bytes: entries.reduce((sum, file) => sum + file.bytes, 0) }];
}));
const layer = (file) => file.split('/')[1];
const matrix = {};
for (const edge of edges) {
  const key = `${layer(edge.from)} -> ${layer(edge.to)}`;
  const item = matrix[key] ??= { typeOnly: 0, valueOrMixed: 0, dynamic: 0 };
  item[edge.typeOnly ? 'typeOnly' : edge.kind === 'dynamic-import' ? 'dynamic' : 'valueOrMixed']++;
}
const bundleDirectory = path.join(root, '.vite/renderer/main_window/assets');
const bundles = fs.existsSync(bundleDirectory)
  ? fs.readdirSync(bundleDirectory).filter((name) => /\.(?:js|mjs)$/u.test(name))
    .map((name) => ({ name, bytes: fs.statSync(path.join(bundleDirectory, name)).size }))
    .sort((a, b) => b.bytes - a.bytes) : [];
const git = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const inventory = {
  schema: 1, version: JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version,
  sourceCommit: git(['rev-parse', 'HEAD']), generatedAt: new Date().toISOString(),
  method: 'Physical lines include blanks/comments/declarations/CSS. TypeScript AST relative import/export and literal dynamic imports; package imports, require, generated/runtime/IPC/SQL edges excluded. Value/mixed imports are not proof of emitted runtime code. Built bundles are existing local artifacts, not a new build or cold-start measurement.',
  groups, sourceModuleCount: sourceFiles.length, localDependencyDeclarations: edges.length,
  layerDependencyMatrix: matrix, unresolvedRelativeImports: unresolved,
  largestSourceModules: [...sourceFiles].sort((a, b) => b.lines - a.lines).slice(0, 20),
  mostImportedModules: [...sourceFiles].sort((a, b) => b.localImporters - a.localImporters).slice(0, 20),
  existingRendererBundles: bundles, files, dependencies: edges,
};
fs.writeFileSync(path.join(outputRoot, 'inventory.json'), `${JSON.stringify(inventory, null, 2)}\n`);
const graph = ['flowchart LR', '  %% Static relative dependency declarations, NOT runtime IPC.'];
const layers = [...new Set(sourceFiles.map((file) => layer(file.path)))].sort();
for (const name of layers) graph.push(`  ${name}["${name}"]`);
for (const [key, count] of Object.entries(matrix).sort(([a], [b]) => a.localeCompare(b))) {
  const [from, to] = key.split(' -> ');
  if (from === to) continue;
  graph.push(`  ${from} -->|"${count.valueOrMixed + count.dynamic} value/dynamic; ${count.typeOnly} type"| ${to}`);
}
fs.writeFileSync(path.join(outputRoot, 'diagrams', 'static-dependencies.mmd'), `${graph.join('\n')}\n`);
process.stdout.write(`${JSON.stringify({ groups, sourceModuleCount: sourceFiles.length,
  localDependencyDeclarations: edges.length, unresolvedRelativeImports: unresolved,
  largest: inventory.largestSourceModules.slice(0, 5), layerDependencyMatrix: matrix }, null, 2)}\n`);
