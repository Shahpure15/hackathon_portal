import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { judgeTotalPct } from '../frontend/src/modules/evaluation/score.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const vectorFile = path.resolve(__dirname, '../backend/tests/vectors/scoring_vectors.json');

if (!fs.existsSync(vectorFile)) {
  console.error(`Scoring vector file not found at: ${vectorFile}`);
  process.exit(1);
}

const vectors = JSON.parse(fs.readFileSync(vectorFile, 'utf8'));
let passed = 0;
let failed = 0;

console.log(`Checking ${vectors.length} scoring vectors between backend and frontend...`);

for (const vec of vectors) {
  if (vec.shouldError) {
    try {
      judgeTotalPct(vec.fields, vec.marks);
      console.error(`FAIL: ${vec.name} expected error, but returned normally.`);
      failed++;
    } catch (e) {
      passed++;
    }
  } else {
    try {
      const result = judgeTotalPct(vec.fields, vec.marks);
      const diff = Math.abs(result - vec.expectedTotalPct);
      if (diff > 0.0011) {
        console.error(
          `FAIL: ${vec.name} - expected: ${vec.expectedTotalPct}, got: ${result} (diff: ${diff})`
        );
        failed++;
      } else {
        passed++;
      }
    } catch (e) {
      console.error(`FAIL: ${vec.name} threw unexpected error:`, e.message);
      failed++;
    }
  }
}

console.log(`Results: ${passed} passed, ${failed} failed.`);

if (failed > 0) {
  process.exit(1);
} else {
  console.log('Scoring vector parity check PASSED!');
  process.exit(0);
}
