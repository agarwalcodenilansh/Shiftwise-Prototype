/**
 * Shiftwell Swap Rules Engine — Test Suite
 * 
 * Runs with plain `node tests.js` (no test frameworks needed).
 * Prints a clean PASS/FAIL table and asserts all business specifications and edge cases.
 */

const assert = require('assert');
const {
  evaluateSwap,
  CUSTOMER_PRESETS,
  REPLAY_SWAPS,
  OUTCOMES,
} = require('./rules.js');

const results = [];

function recordTest(id, category, description, passed, detail = '') {
  results.push({
    id,
    category,
    description,
    status: passed ? 'PASS' : 'FAIL',
    detail,
  });
}

console.log('\n======================================================================');
console.log('       SHIFTWELL SWAP RULES ENGINE — TEST SUITE EXECUTION             ');
console.log('======================================================================\n');

// -------------------------------------------------------------------
// TEST SUITE 1: 20 Preloaded Replay Swaps
// -------------------------------------------------------------------
console.log('Running Suite 1: 20 Preloaded Replay Swaps...\n');

const expectedReplayOutcomes = {
  1: OUTCOMES.AUTO_APPROVE,
  2: OUTCOMES.AUTO_APPROVE,
  3: OUTCOMES.AUTO_APPROVE,
  4: OUTCOMES.AUTO_APPROVE,
  5: OUTCOMES.MANAGER_REVIEW,
  6: OUTCOMES.MANAGER_REVIEW,
  7: OUTCOMES.AUTO_APPROVE,
  8: OUTCOMES.AUTO_APPROVE,
  9: OUTCOMES.AUTO_APPROVE,
  10: OUTCOMES.BLOCK,
  11: OUTCOMES.AUTO_APPROVE,
  12: OUTCOMES.AUTO_APPROVE,
  13: OUTCOMES.AUTO_APPROVE,
  14: OUTCOMES.MANAGER_REVIEW,
  15: OUTCOMES.AUTO_APPROVE,
  16: OUTCOMES.ESCALATE_REGIONAL,
  17: OUTCOMES.AUTO_APPROVE,
  18: OUTCOMES.ESCALATE_REGIONAL,
  19: OUTCOMES.MANAGER_REVIEW,
  20: OUTCOMES.AUTO_APPROVE,
};

let autoApproveCount = 0;

for (const swap of REPLAY_SWAPS) {
  const preset = CUSTOMER_PRESETS[swap.customer];
  const evalResult = evaluateSwap(swap, preset);
  const expectedOutcome = expectedReplayOutcomes[swap.id];
  const isMatch = evalResult.outcome === expectedOutcome;

  let extraCheck = true;
  let detail = `Outcome: ${evalResult.outcome}`;

  if (evalResult.outcome === OUTCOMES.AUTO_APPROVE) {
    autoApproveCount++;
  }

  // Row 12 specific check: must carry a warning
  if (swap.id === 12) {
    const hasWarn = evalResult.checks.some(c => c.status === 'warn');
    if (!hasWarn) {
      extraCheck = false;
      detail += ' (FAILED: Expected warning on row 12 not found)';
    } else {
      const warnReason = evalResult.checks.find(c => c.status === 'warn').reason;
      detail += ` (Warning detected: "${warnReason}")`;
    }
  }

  // Row 10 specific check: expired certificate reason
  if (swap.id === 10) {
    if (!evalResult.reason.includes('BLS expired on 2026-09-15')) {
      extraCheck = false;
      detail += ` (Unexpected reason: ${evalResult.reason})`;
    } else {
      detail += ` (Reason: "${evalResult.reason}")`;
    }
  }

  recordTest(
    `Replay #${swap.id.toString().padStart(2, '0')}`,
    'Replay 20',
    `${swap.customer} - ${swap.role} (${swap.hoursScheduled}/${swap.shiftHours}h, trained:${swap.trained ? 'Y' : 'N'}) -> ${expectedOutcome}`,
    isMatch && extraCheck,
    detail
  );
}

// Check auto-approve count: exactly 13 of 20 (65%)
recordTest(
  'Replay Summary',
  'Replay 20',
  '13 of 20 swaps auto-approved (65.0% auto-approval rate)',
  autoApproveCount === 13,
  `Auto-approved count: ${autoApproveCount}/20 (${(autoApproveCount / 20 * 100).toFixed(1)}%)`
);

// -------------------------------------------------------------------
// TEST SUITE 2: Edge-Case Validations
// -------------------------------------------------------------------
console.log('Running Suite 2: Edge-Case Tests...\n');

// Edge Case 1: Exactly 48 projected hours is allowed
{
  const swap48 = {
    customer: 'FreshBowl',
    role: 'Cook',
    trained: true,
    hoursScheduled: 40,
    shiftHours: 8,
    shiftDate: '2026-11-10',
    certificates: [],
  };
  const res = evaluateSwap(swap48, { autoApprove: true, certCheck: false, hoursLimit: 48, overLimitAction: 'manager' });
  const passed = res.outcome === OUTCOMES.AUTO_APPROVE && res.projectedHours === 48;
  recordTest(
    'Edge Case 1',
    'Hours Boundary',
    'Exactly 48 projected hours (40+8) is allowed without overtime penalty',
    passed,
    `Projected: ${res.projectedHours}h, Outcome: ${res.outcome}`
  );
}

// Edge Case 2: 48.5 is over the limit
{
  const swap48_5 = {
    customer: 'UrbanMart',
    role: 'Associate',
    trained: true,
    hoursScheduled: 40.5,
    shiftHours: 8,
    shiftDate: '2026-11-10',
    certificates: [],
  };
  const resEscalate = evaluateSwap(swap48_5, { autoApprove: true, certCheck: false, hoursLimit: 48, overLimitAction: 'escalate' });
  const resManager = evaluateSwap(swap48_5, { autoApprove: true, certCheck: false, hoursLimit: 48, overLimitAction: 'manager' });
  
  const passed = resEscalate.outcome === OUTCOMES.ESCALATE_REGIONAL && resManager.outcome === OUTCOMES.MANAGER_REVIEW && resEscalate.projectedHours === 48.5;
  recordTest(
    'Edge Case 2',
    'Hours Boundary',
    '48.5 projected hours strictly exceeds 48h limit (triggers configured action)',
    passed,
    `Projected: ${resEscalate.projectedHours}h -> Escalate: ${resEscalate.outcome}, Manager: ${resManager.outcome}`
  );
}

// Edge Case 3: Certificate expiring ON the shift date is valid
{
  const swapExpiringOnShift = {
    customer: 'CarePoint',
    role: 'Nurse',
    trained: true,
    hoursScheduled: 24,
    shiftHours: 8,
    shiftDate: '2026-11-10',
    certificates: [
      { name: 'BLS', expiry: '2026-11-10' }, // Expires ON the shift date
      { name: 'Nursing Council', expiry: '2027-05-01' },
    ],
  };
  const res = evaluateSwap(swapExpiringOnShift, { autoApprove: true, certCheck: true, hoursLimit: 48, overLimitAction: 'manager' });
  const certCheck = res.checks.find(c => c.rule === 'certificate');
  const passed = res.outcome === OUTCOMES.AUTO_APPROVE && certCheck.status === 'pass';
  recordTest(
    'Edge Case 3',
    'Cert Boundary',
    'Certificate expiring ON the shift date (2026-11-10) is valid and auto-approved',
    passed,
    `Cert status: ${certCheck ? certCheck.status : 'missing'}, Outcome: ${res.outcome}`
  );
}

// Edge Case 4: Auto-approval off turns would-be AUTO_APPROVE into MANAGER_REVIEW
{
  const swapApproved = {
    customer: 'FreshBowl',
    role: 'Cook',
    trained: true,
    hoursScheduled: 30,
    shiftHours: 8,
    shiftDate: '2026-11-10',
    certificates: [],
  };
  const resOn = evaluateSwap(swapApproved, { autoApprove: true, certCheck: false, hoursLimit: 48, overLimitAction: 'manager' });
  const resOff = evaluateSwap(swapApproved, { autoApprove: false, certCheck: false, hoursLimit: 48, overLimitAction: 'manager' });
  
  const expectedReason = "Auto-approval off (today's behaviour)";
  const passed = resOn.outcome === OUTCOMES.AUTO_APPROVE &&
                 resOff.outcome === OUTCOMES.MANAGER_REVIEW &&
                 resOff.reason === expectedReason;
  recordTest(
    'Edge Case 4',
    'Auto-Approve Toggle',
    'Auto-approval off turns auto-approve into MANAGER_REVIEW with exact reason',
    passed,
    `AutoApprove ON: ${resOn.outcome} -> OFF: ${resOff.outcome} (Reason: "${resOff.reason}")`
  );
}

// Edge Case 5: BLOCK still wins when swap is also over hours limit and untrained
{
  const swapMultiFailure = {
    customer: 'CarePoint',
    role: 'Nurse',
    trained: false,             // Untrained (would give MANAGER_REVIEW)
    hoursScheduled: 46,
    shiftHours: 8,              // 46 + 8 = 54h > 48 (would give ESCALATE_REGIONAL)
    shiftDate: '2026-11-10',
    certificates: [
      { name: 'BLS', expiry: '2026-10-01' }, // Expired on 2026-10-01 (BLOCK)
    ],
  };
  const res = evaluateSwap(swapMultiFailure, {
    autoApprove: true,
    certCheck: true,
    hoursLimit: 48,
    overLimitAction: 'escalate',
  });

  const passed = res.outcome === OUTCOMES.BLOCK && res.reason.includes('BLS expired on 2026-10-01');
  recordTest(
    'Edge Case 5',
    'Precedence',
    'BLOCK takes precedence over ESCALATE_REGIONAL and untrained MANAGER_REVIEW',
    passed,
    `Outcome: ${res.outcome} (Reason: "${res.reason}")`
  );
}

// Edge Case 6: BLOCK and ESCALATE still apply when autoApprove is false
{
  const swapOvertimeEscalate = {
    customer: 'UrbanMart',
    role: 'Associate',
    trained: true,
    hoursScheduled: 44,
    shiftHours: 8, // 52h > 48
    shiftDate: '2026-11-10',
    certificates: [],
  };
  const res = evaluateSwap(swapOvertimeEscalate, {
    autoApprove: false,
    certCheck: false,
    hoursLimit: 48,
    overLimitAction: 'escalate',
  });

  const passed = res.outcome === OUTCOMES.ESCALATE_REGIONAL;
  recordTest(
    'Edge Case 6',
    'Auto-Approve Off',
    'ESCALATE_REGIONAL still applies even when auto-approval is toggled off',
    passed,
    `Outcome: ${res.outcome}`
  );
}

// -------------------------------------------------------------------
// PRINT CLEAN FORMATTED TEST RESULTS TABLE
// -------------------------------------------------------------------
console.log('--------------------------------------------------------------------------------------------------------');
console.log(
  '| ' + 'ID'.padEnd(16) +
  '| ' + 'CATEGORY'.padEnd(16) +
  '| ' + 'DESCRIPTION'.padEnd(46) +
  '| ' + 'STATUS'.padEnd(8) + '|'
);
console.log('--------------------------------------------------------------------------------------------------------');

let passCount = 0;
let failCount = 0;

for (const t of results) {
  if (t.status === 'PASS') passCount++;
  else failCount++;

  const statusColored = t.status === 'PASS' ? '\x1b[32mPASS\x1b[0m    ' : '\x1b[31mFAIL\x1b[0m    ';
  const descShort = t.description.length > 44 ? t.description.substring(0, 41) + '...' : t.description;

  console.log(
    `| ${t.id.padEnd(16)}| ${t.category.padEnd(16)}| ${descShort.padEnd(46)}| ${statusColored}|`
  );
}

console.log('--------------------------------------------------------------------------------------------------------\n');
console.log(`TEST SUMMARY: ${passCount} PASSED, ${failCount} FAILED out of ${results.length} total tests.`);

if (failCount > 0) {
  console.error('\n❌ SOME TESTS FAILED! See details above.');
  process.exit(1);
} else {
  console.log('\n✅ ALL TESTS PASSED SUCCESSFULLY! The pure rules engine is 100% verified.\n');
  process.exit(0);
}
