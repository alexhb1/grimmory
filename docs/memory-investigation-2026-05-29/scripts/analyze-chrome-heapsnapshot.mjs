#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const snapshotPath = process.argv[2] ?? process.env.HEAP_SNAPSHOT;
if (!snapshotPath) {
  console.error('Usage: analyze-chrome-heapsnapshot.mjs <heap.heapsnapshot> [output-dir]');
  process.exit(2);
}

const outputDir = process.argv[3] ?? path.dirname(snapshotPath);
fs.mkdirSync(outputDir, { recursive: true });

function sha256File(file) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(file));
  return hash.digest('hex');
}

const raw = fs.readFileSync(snapshotPath, 'utf8');
const snapshot = JSON.parse(raw);
const meta = snapshot.snapshot?.meta;
if (!meta?.node_fields || !meta?.node_types || !Array.isArray(snapshot.nodes) || !Array.isArray(snapshot.strings)) {
  console.error('Input does not look like a Chrome heap snapshot');
  process.exit(1);
}

const nodeFields = meta.node_fields;
const nodeTypes = meta.node_types[0];
const fieldCount = nodeFields.length;
const typeIndex = nodeFields.indexOf('type');
const nameIndex = nodeFields.indexOf('name');
const selfSizeIndex = nodeFields.indexOf('self_size');

if (typeIndex < 0 || nameIndex < 0 || selfSizeIndex < 0) {
  console.error(`Unsupported node fields: ${nodeFields.join(', ')}`);
  process.exit(1);
}

const byName = new Map();
const byType = new Map();
let totalSelfSize = 0;
let nodeCount = 0;

for (let offset = 0; offset < snapshot.nodes.length; offset += fieldCount) {
  nodeCount += 1;
  const typeName = nodeTypes[snapshot.nodes[offset + typeIndex]] ?? 'unknown';
  const name = snapshot.strings[snapshot.nodes[offset + nameIndex]] ?? '';
  const selfSize = snapshot.nodes[offset + selfSizeIndex] ?? 0;
  totalSelfSize += selfSize;

  const nameKey = `${typeName}\t${name}`;
  const nameEntry = byName.get(nameKey) ?? { type: typeName, name, count: 0, selfSize: 0 };
  nameEntry.count += 1;
  nameEntry.selfSize += selfSize;
  byName.set(nameKey, nameEntry);

  const typeEntry = byType.get(typeName) ?? { type: typeName, count: 0, selfSize: 0 };
  typeEntry.count += 1;
  typeEntry.selfSize += selfSize;
  byType.set(typeName, typeEntry);
}

function bySizeDesc(a, b) {
  return b.selfSize - a.selfSize || b.count - a.count;
}

function writeTsv(file, rows, header) {
  const lines = [header, ...rows];
  fs.writeFileSync(file, `${lines.join('\n')}\n`);
}

const topNames = [...byName.values()].sort(bySizeDesc).slice(0, 200);
const topTypes = [...byType.values()].sort(bySizeDesc);
const interesting = [...byName.values()]
  .filter(row => /book|metadata|author|category|shel|series|progress|array|object|string|map|set/i.test(row.name))
  .sort(bySizeDesc)
  .slice(0, 200);

writeTsv(
  path.join(outputDir, 'heap-top-names.tsv'),
  topNames.map(row => `${row.selfSize}\t${row.count}\t${row.type}\t${row.name}`),
  'self_size_bytes\tcount\ttype\tname',
);

writeTsv(
  path.join(outputDir, 'heap-top-types.tsv'),
  topTypes.map(row => `${row.selfSize}\t${row.count}\t${row.type}`),
  'self_size_bytes\tcount\ttype',
);

writeTsv(
  path.join(outputDir, 'heap-interesting-names.tsv'),
  interesting.map(row => `${row.selfSize}\t${row.count}\t${row.type}\t${row.name}`),
  'self_size_bytes\tcount\ttype\tname',
);

const summary = {
  snapshotPath,
  snapshotBytes: fs.statSync(snapshotPath).size,
  snapshotSha256: sha256File(snapshotPath),
  nodeCount,
  totalSelfSize,
  topTypes: topTypes.slice(0, 25),
  topNames: topNames.slice(0, 25),
  interesting: interesting.slice(0, 25),
};

fs.writeFileSync(path.join(outputDir, 'heap-summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log(path.join(outputDir, 'heap-summary.json'));
