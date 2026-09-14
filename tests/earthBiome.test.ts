/**
 * Earth biome classification tests.
 *
 * Plain TypeScript, no test-runner dependency. Run via scripts/run-tests.mjs.
 */

import { classifyEarthBiome, latitudeMoisture, blendMoisture, DESERT_LAT_MIN, DESERT_LAT_MAX } from '../src/sim/world/earth/earthBiome';

let failures = 0;

function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    console.log('PASS: ' + name);
  } else {
    failures++;
    console.error('FAIL: ' + name + (detail ? ' (' + detail + ')' : ''));
  }
}

// 1. Water: any elevation at or below sea level.
check('sea level is water', classifyEarthBiome(45, 0, 0.5) === 'water');
check('negative elevation is water', classifyEarthBiome(45, -430, 0.5) === 'water');
check('deep ocean is water', classifyEarthBiome(-10, -10000, 0.5) === 'water');

// 2. Polar caps: permanent ice regardless of elevation.
check('arctic sea ice cap is snow', classifyEarthBiome(80, 0.5, 0.5) === 'snow');
check('antarctic plateau is snow', classifyEarthBiome(-80, 3000, 0.5) === 'snow');
check('greenland interior is snow', classifyEarthBiome(75, 3000, 0.5) === 'snow');

// 3. Tropical rainforest belt.
check('equatorial lowland is forest', classifyEarthBiome(0, 200, 0.85) === 'forest');
check('amazon basin is forest', classifyEarthBiome(-5, 100, 0.9) === 'forest');

// 4. Subtropical desert belt (Sahara / Arabia / Australian interior).
const sahara = classifyEarthBiome(23, 350, 0.25);
check('sahara-like subtropics are sand', sahara === 'sand', sahara);
const arabia = classifyEarthBiome(22, 800, 0.3);
check('arabia-like dry subtropics are sand or dirt', arabia === 'sand' || arabia === 'dirt', arabia);
check('dry subtropics never classify as forest', classifyEarthBiome(28, 100, 0.2) !== 'forest');

// 5. Temperate belts: grass or forest depending on moisture.
check('moist temperate lowland is forest', classifyEarthBiome(50, 100, 0.7) === 'forest');
check('dry-ish temperate lowland is grass', classifyEarthBiome(48, 100, 0.45) === 'grass');

// 6. Tundra fringe.
const tundra = classifyEarthBiome(67, 100, 0.6);
check('polar fringe is tundra (dirt)', tundra === 'dirt', tundra);

// 7. Altitude bands: tropical tree line is high, temperate tree line is low.
check('tropical alpine highlands are mountain', classifyEarthBiome(5, 3000, 0.6) === 'mountain');
check('tropical summits are snow', classifyEarthBiome(5, 5000, 0.6) === 'snow');
check('temperate summits are stone', classifyEarthBiome(45, 3000, 0.6) === 'stone');
check('high alpine rock above tree line', classifyEarthBiome(45, 2200, 0.6) === 'stone');

// 8. Beach band at the coast.
check('coastal band is sand', classifyEarthBiome(40, 2, 0.5) === 'sand');

// 9. Latitude moisture climatology.
check('ITCZ is wet', latitudeMoisture(0) > 0.8);
check('subtropical highs are dry', latitudeMoisture(25) < 0.3);
check('westerlies are humid', latitudeMoisture(50) > 0.6);
check('desert belt matches constants', DESERT_LAT_MIN === 15 && DESERT_LAT_MAX === 35);
const saturated = blendMoisture(25, 5);
const parched = blendMoisture(25, -5);
check('blend moisture clamps to [0,1]', saturated === 1 && parched === 0, saturated + '/' + parched);

if (failures > 0) {
  throw new Error(failures + ' test(s) failed');
}
console.log('All earthBiome tests passed.');
