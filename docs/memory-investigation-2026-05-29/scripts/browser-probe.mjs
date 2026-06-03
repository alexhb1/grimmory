#!/usr/bin/env node
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const artifactDir = process.env.ARTIFACT_DIR;
if (!artifactDir) {
  console.error('ARTIFACT_DIR is required');
  process.exit(2);
}

const appUrl = process.env.APP_URL ?? 'http://127.0.0.1:6060';
const username = process.env.ADMIN_USER ?? 'admin';
const password = process.env.ADMIN_PASSWORD ?? 'admin123';
const route = process.env.ROUTE ?? '/';
const durationMs = Number.parseInt(process.env.DURATION_MS ?? '15000', 10);
const memorySampleIntervalMs = Number.parseInt(process.env.MEMORY_SAMPLE_INTERVAL_MS ?? '5000', 10);
const takeHeapSnapshot = ['1', 'true', 'yes'].includes((process.env.TAKE_HEAP_SNAPSHOT ?? '').toLowerCase());
const accessTokenFile = process.env.ACCESS_TOKEN_FILE;
const refreshTokenFile = process.env.REFRESH_TOKEN_FILE;

const dirs = [
  'commands',
  'logs',
  'samples',
  'samples/browser',
  'summaries',
];
for (const dir of dirs) {
  fs.mkdirSync(path.join(artifactDir, dir), { recursive: true });
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function appendJsonl(file, value) {
  fs.appendFileSync(file, `${JSON.stringify(value)}\n`);
}

function sha256File(file) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(file));
  return hash.digest('hex');
}

const startedAt = new Date().toISOString();

let accessToken = accessTokenFile ? fs.readFileSync(accessTokenFile, 'utf8').trim() : '';
let refreshToken = refreshTokenFile ? fs.readFileSync(refreshTokenFile, 'utf8').trim() : '';
let expires = Number.parseInt(process.env.TOKEN_EXPIRY_SECONDS ?? '7200', 10);

if (!accessToken || !refreshToken) {
  const loginResponse = await fetch(`${appUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!loginResponse.ok) {
    console.error(`login failed: ${loginResponse.status}`);
    console.error(await loginResponse.text());
    process.exit(1);
  }
  const tokenPayload = await loginResponse.json();
  accessToken = tokenPayload.accessToken;
  refreshToken = tokenPayload.refreshToken;
  expires = tokenPayload.expires ?? expires;
}

const networkFile = path.join(artifactDir, 'samples/browser/network.jsonl');
const websocketFile = path.join(artifactDir, 'samples/browser/websocket.jsonl');
const browserMemoryFile = path.join(artifactDir, 'samples/browser/memory-samples.jsonl');
const consoleFile = path.join(artifactDir, 'logs/browser-console.jsonl');
const metricsFile = path.join(artifactDir, 'samples/browser/metrics.json');
const summaryFile = path.join(artifactDir, 'summaries/browser-summary.json');
const traceFile = path.join(artifactDir, 'samples/browser/trace.zip');
const screenshotFile = path.join(artifactDir, 'samples/browser/startup.png');
const heapSnapshotFile = path.join(artifactDir, 'samples/browser/heap.heapsnapshot');
const heapSnapshotMetaFile = path.join(artifactDir, 'samples/browser/heap-snapshot-meta.json');
const hashFile = path.join(artifactDir, 'samples/sha256sums.txt');

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});

await context.addInitScript(({ accessToken, refreshToken, expires }) => {
  localStorage.setItem('accessToken_Internal', accessToken);
  localStorage.setItem('refreshToken_Internal', refreshToken);
  localStorage.setItem('accessToken_Internal_Expiry', String(Date.now() + expires * 1000));
  localStorage.setItem('authenticationIsDefaultPassword_Internal', 'false');
}, { accessToken, refreshToken, expires });

await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
const page = await context.newPage();

const requests = [];
const responses = [];
const websocketEvents = [];
const browserMemorySamples = [];

page.on('request', request => {
  const entry = {
    type: 'request',
    timestamp: new Date().toISOString(),
    method: request.method(),
    url: request.url(),
    resourceType: request.resourceType(),
  };
  requests.push(entry);
  appendJsonl(networkFile, entry);
});

page.on('response', response => {
  const entry = {
    type: 'response',
    timestamp: new Date().toISOString(),
    status: response.status(),
    url: response.url(),
    contentLength: response.headers()['content-length'] ?? null,
  };
  responses.push(entry);
  appendJsonl(networkFile, entry);
});

page.on('console', message => {
  appendJsonl(consoleFile, {
    timestamp: new Date().toISOString(),
    type: message.type(),
    text: message.text(),
  });
});

page.on('websocket', ws => {
  const openEntry = {
    type: 'websocket-open',
    timestamp: new Date().toISOString(),
    url: ws.url(),
  };
  websocketEvents.push(openEntry);
  appendJsonl(websocketFile, openEntry);

  ws.on('framesent', event => {
    const payload = event.payload ?? '';
    const entry = {
      type: 'websocket-frame-sent',
      timestamp: new Date().toISOString(),
      url: ws.url(),
      bytes: Buffer.byteLength(String(payload)),
    };
    websocketEvents.push(entry);
    appendJsonl(websocketFile, entry);
  });

  ws.on('framereceived', event => {
    const payload = event.payload ?? '';
    const entry = {
      type: 'websocket-frame-received',
      timestamp: new Date().toISOString(),
      url: ws.url(),
      bytes: Buffer.byteLength(String(payload)),
    };
    websocketEvents.push(entry);
    appendJsonl(websocketFile, entry);
  });

  ws.on('close', () => {
    const entry = {
      type: 'websocket-close',
      timestamp: new Date().toISOString(),
      url: ws.url(),
    };
    websocketEvents.push(entry);
    appendJsonl(websocketFile, entry);
  });
});

async function sampleBrowserMemory(note) {
  const sample = await page.evaluate(noteArg => {
    const memory = performance.memory ? {
      jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
      totalJSHeapSize: performance.memory.totalJSHeapSize,
      usedJSHeapSize: performance.memory.usedJSHeapSize,
    } : null;
    return {
      timestamp: new Date().toISOString(),
      url: location.href,
      note: noteArg,
      memory,
    };
  }, note).catch(error => ({
    timestamp: new Date().toISOString(),
    note,
    error: String(error),
  }));
  browserMemorySamples.push(sample);
  appendJsonl(browserMemoryFile, sample);
}

async function captureHeapSnapshot() {
  const client = await context.newCDPSession(page);
  await client.send('HeapProfiler.enable');
  await client.send('HeapProfiler.collectGarbage');

  const stream = fs.createWriteStream(heapSnapshotFile, { encoding: 'utf8' });
  const streamFinished = new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });

  client.on('HeapProfiler.addHeapSnapshotChunk', ({ chunk }) => {
    stream.write(chunk);
  });

  await client.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
  stream.end();
  await streamFinished;
  await client.send('HeapProfiler.disable');

  const stat = fs.statSync(heapSnapshotFile);
  const meta = {
    timestamp: new Date().toISOString(),
    file: heapSnapshotFile,
    bytes: stat.size,
    sha256: sha256File(heapSnapshotFile),
    note: 'Captured after HeapProfiler.collectGarbage so the snapshot emphasizes retained browser heap.',
  };
  writeJson(heapSnapshotMetaFile, meta);
  return meta;
}

const target = new URL(route, appUrl).toString();
await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 60000 });
await sampleBrowserMemory('after-goto');

const waitStarted = Date.now();
while (Date.now() - waitStarted < durationMs) {
  const remaining = durationMs - (Date.now() - waitStarted);
  await page.waitForTimeout(Math.min(memorySampleIntervalMs, remaining));
  await sampleBrowserMemory('interval');
}

const metrics = await page.evaluate(() => {
  const nav = performance.getEntriesByType('navigation')[0];
  const memory = performance.memory ? {
    jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
    totalJSHeapSize: performance.memory.totalJSHeapSize,
    usedJSHeapSize: performance.memory.usedJSHeapSize,
  } : null;
  return {
    url: location.href,
    title: document.title,
    navigation: nav ? nav.toJSON() : null,
    memory,
  };
});

let heapSnapshotMeta = null;
if (takeHeapSnapshot) {
  await sampleBrowserMemory('before-heap-snapshot');
  heapSnapshotMeta = await captureHeapSnapshot();
  await sampleBrowserMemory('after-heap-snapshot');
}

await page.screenshot({ path: screenshotFile, fullPage: true });
await context.tracing.stop({ path: traceFile });
await browser.close();

writeJson(metricsFile, metrics);

const isBooksEndpointUrl = url => url.includes('/api/v1/books?') || url.endsWith('/api/v1/books');
const booksRequests = requests.filter(entry => entry.url.includes('/api/v1/books'));
const booksEndpointRequests = requests.filter(entry => isBooksEndpointUrl(entry.url));
const booksEndpointResponses = responses.filter(entry => isBooksEndpointUrl(entry.url));
const appBooksRequests = requests.filter(entry => entry.url.includes('/api/v1/app/books'));
const filterOptionRequests = requests.filter(entry => entry.url.includes('/api/v1/app/filter-options'));
const websocketFramesReceived = websocketEvents.filter(entry => entry.type === 'websocket-frame-received');
const websocketFramesSent = websocketEvents.filter(entry => entry.type === 'websocket-frame-sent');
const websocketBytesReceived = websocketFramesReceived.reduce((sum, entry) => sum + (entry.bytes ?? 0), 0);
const websocketBytesSent = websocketFramesSent.reduce((sum, entry) => sum + (entry.bytes ?? 0), 0);
const firstBooksEndpointRequestAt = booksEndpointRequests[0]?.timestamp ?? null;
const firstBooksEndpointResponseAt = booksEndpointResponses[0]?.timestamp ?? null;
const firstBooksEndpointElapsedMs = firstBooksEndpointRequestAt && firstBooksEndpointResponseAt
  ? Date.parse(firstBooksEndpointResponseAt) - Date.parse(firstBooksEndpointRequestAt)
  : null;

const summary = {
  startedAt,
  endedAt: new Date().toISOString(),
  appUrl,
  route,
  durationMs,
  requestCount: requests.length,
  responseCount: responses.length,
  booksRequestCount: booksRequests.length,
  booksEndpointRequestCount: booksEndpointRequests.length,
  booksEndpointResponseCount: booksEndpointResponses.length,
  firstBooksEndpointRequestAt,
  firstBooksEndpointResponseAt,
  firstBooksEndpointElapsedMs,
  appBooksRequestCount: appBooksRequests.length,
  filterOptionRequestCount: filterOptionRequests.length,
  websocketEventCount: websocketEvents.length,
  websocketFrameReceivedCount: websocketFramesReceived.length,
  websocketFrameSentCount: websocketFramesSent.length,
  websocketBytesReceived,
  websocketBytesSent,
  booksEndpointRequests: booksEndpointRequests.map(entry => entry.url),
  booksEndpointResponses: booksEndpointResponses.map(entry => ({
    timestamp: entry.timestamp,
    status: entry.status,
    url: entry.url,
    contentLength: entry.contentLength,
  })),
  appBooksRequests: appBooksRequests.map(entry => entry.url),
  filterOptionRequests: filterOptionRequests.map(entry => entry.url),
  metrics,
  heapSnapshot: heapSnapshotMeta,
  artifacts: {
    networkFile,
    websocketFile,
    browserMemoryFile,
    consoleFile,
    metricsFile,
    screenshotFile,
    traceFile,
    heapSnapshotFile: heapSnapshotMeta ? heapSnapshotFile : null,
    heapSnapshotMetaFile: heapSnapshotMeta ? heapSnapshotMetaFile : null,
  },
};
writeJson(summaryFile, summary);

const hashLines = [networkFile, websocketFile, browserMemoryFile, consoleFile, metricsFile, summaryFile, screenshotFile, traceFile, heapSnapshotFile, heapSnapshotMetaFile]
  .filter(file => fs.existsSync(file))
  .map(file => `${sha256File(file)}  ${file}`);
fs.appendFileSync(hashFile, `${hashLines.join('\n')}\n`);

console.log(summaryFile);
