#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const budgets = [
  { route: "/", file: "data/analyze.data", maxCompressedKb: 340 },
  { route: "/calendar", file: "data/calendar/analyze.data", maxCompressedKb: 320 },
  {
    route: "/program-store",
    file: "data/program-store/analyze.data",
    maxCompressedKb: 345,
  },
  { route: "/settings", file: "data/settings/analyze.data", maxCompressedKb: 305 },
  { route: "/login", file: "data/login/analyze.data", maxCompressedKb: 290 },
];

const analyzeRoot = path.resolve(".next/diagnostics/analyze");

function readAnalyzeFrame(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (buffer.length < 5) throw new Error(`Invalid analyze data: ${filePath}`);
  const frameLength = buffer.readUInt32BE(0);
  return JSON.parse(buffer.subarray(4, 4 + frameLength).toString("utf8"));
}

function fullSourcePath(analysis, sourceIndex, cache) {
  if (cache.has(sourceIndex)) return cache.get(sourceIndex);
  const source = analysis.sources?.[sourceIndex];
  if (!source) return "";
  const resolved =
    source.parent_source_index == null
      ? source.path
      : `${fullSourcePath(analysis, source.parent_source_index, cache)}${source.path}`;
  cache.set(sourceIndex, resolved);
  return resolved;
}

function reachableModernClientCompressedBytes(analysis) {
  let total = 0;
  const sourcePathCache = new Map();
  for (const part of analysis.chunk_parts ?? []) {
    const filename = analysis.output_files?.[part.output_file_index]?.filename ?? "";
    const sourcePath = fullSourcePath(
      analysis,
      part.source_index,
      sourcePathCache,
    );
    const isClientJavaScript =
      filename.startsWith("[client-fs]/_next/static/chunks/") &&
      filename.endsWith(".js");
    // Next emits this legacy nomodule fallback but modern module-capable clients
    // never download it. Keep the budget aligned with real primary traffic.
    const isLegacyNoModulePolyfill = sourcePath.endsWith(
      "next/dist/build/polyfills/polyfill-nomodule.js",
    );
    if (isClientJavaScript && !isLegacyNoModulePolyfill) {
      total += Number(part.compressed_size ?? 0);
    }
  }
  return total;
}

let failed = false;
console.log(
  "Modern route-reachable client graph budget (compressed, lazy chunks included)",
);

for (const budget of budgets) {
  const analysis = readAnalyzeFrame(path.join(analyzeRoot, budget.file));
  const actualKb = reachableModernClientCompressedBytes(analysis) / 1024;
  const passed = actualKb <= budget.maxCompressedKb;
  if (!passed) failed = true;
  console.log(
    `${passed ? "PASS" : "FAIL"} ${budget.route.padEnd(16)} ${actualKb.toFixed(1)}KB / ${budget.maxCompressedKb}KB`,
  );
}

if (failed) process.exit(1);
