/**
 * Shiftwell Swap Rules Engine
 * 
 * Pure evaluation function for shift swaps.
 * Separated from UI for testability and portability.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    // Node.js CommonJS
    module.exports = factory();
  } else {
    // Browser global / ES script import
    const exports = factory();
    root.ShiftwellRules = exports;
    root.evaluateSwap = exports.evaluateSwap;
    root.CUSTOMER_PRESETS = exports.CUSTOMER_PRESETS;
    root.REPLAY_SWAPS = exports.REPLAY_SWAPS;
    root.OUTCOMES = exports.OUTCOMES;
    root.diffInDays = exports.diffInDays;
    root.parseUTCDate = exports.parseUTCDate;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Standard outcome constants
  const OUTCOMES = {
    AUTO_APPROVE: 'AUTO_APPROVE',
    MANAGER_REVIEW: 'MANAGER_REVIEW',
    BLOCK: 'BLOCK',
    ESCALATE_REGIONAL: 'ESCALATE_REGIONAL',
  };

  // Customer default preset configurations
  const CUSTOMER_PRESETS = {
    FreshBowl: {
      customer: 'FreshBowl',
      certCheck: false,
      overLimitAction: 'manager',
      hoursLimit: 48,
      autoApprove: true,
      swapsPerMonth: 2900,
    },
    CarePoint: {
      customer: 'CarePoint',
      certCheck: true,
      overLimitAction: 'manager',
      hoursLimit: 48,
      autoApprove: true,
      swapsPerMonth: 310,
    },
    UrbanMart: {
      customer: 'UrbanMart',
      certCheck: false,
      overLimitAction: 'escalate',
      hoursLimit: 48,
      autoApprove: true,
      swapsPerMonth: 3100,
    },
  };

  /**
   * Safe UTC date parser for "YYYY-MM-DD"
   * Avoids local timezone off-by-one shifts.
   */
  function parseUTCDate(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return null;
    const parts = dateStr.trim().split('-');
    if (parts.length !== 3) return null;
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
    return new Date(Date.UTC(y, m, d));
  }

  /**
   * Computes difference in calendar days between two YYYY-MM-DD strings.
   * Positive number means targetDate is after baseDate.
   */
  function diffInDays(targetDateStr, baseDateStr) {
    const target = parseUTCDate(targetDateStr);
    const base = parseUTCDate(baseDateStr);
    if (!target || !base) return null;
    const msPerDay = 1000 * 60 * 60 * 24;
    return Math.round((target.getTime() - base.getTime()) / msPerDay);
  }

  /**
   * Pure evaluation function for a prospective swap.
   * Evaluates ALL rules every time and returns structured outcomes.
   * 
   * @param {Object} swap
   *   customer: string
   *   role: string
   *   trained: boolean
   *   hoursScheduled: number
   *   shiftHours: number
   *   shiftDate: string (YYYY-MM-DD)
   *   certificates: Array<{name: string, expiry: string (YYYY-MM-DD)}>
   * @param {Object} settings
   *   autoApprove: boolean (default: true)
   *   certCheck: boolean (default: false)
   *   hoursLimit: number (default: 48)
   *   overLimitAction: "escalate" | "manager" (default: "manager")
   * 
   * @returns {Object} { outcome, reason, checks, projectedHours, hoursLimit }
   */
  function evaluateSwap(swap, settings) {
    // Apply default settings cleanly
    const config = {
      autoApprove: settings && settings.autoApprove !== undefined ? Boolean(settings.autoApprove) : true,
      certCheck: settings && settings.certCheck !== undefined ? Boolean(settings.certCheck) : false,
      hoursLimit: settings && typeof settings.hoursLimit === 'number' && !isNaN(settings.hoursLimit) ? settings.hoursLimit : 48,
      overLimitAction: settings && settings.overLimitAction === 'escalate' ? 'escalate' : 'manager',
    };

    const checks = [];

    // -------------------------------------------------------------
    // RULE 1: Certificate Validation (only if certCheck is on)
    // -------------------------------------------------------------
    let certOutcomeImpact = null;
    let certStatus = 'pass';
    let certReason = 'All certifications valid';

    if (!config.certCheck) {
      certStatus = 'skipped';
      certReason = 'Certificate check disabled for this account';
      checks.push({
        rule: 'certificate',
        status: certStatus,
        reason: certReason,
      });
    } else {
      const certList = Array.isArray(swap && swap.certificates) ? swap.certificates : [];

      if (certList.length === 0) {
        certStatus = 'pass';
        certReason = 'No certifications required for this role';
      } else {
        const expiredCerts = [];
        const warningCerts = [];
        const validCerts = [];

        for (const cert of certList) {
          const certName = cert.name || 'Certificate';
          const expiryStr = cert.expiry || '';
          const daysDiff = diffInDays(expiryStr, swap.shiftDate);

          if (daysDiff === null) {
            continue;
          }

          if (daysDiff < 0) {
            // Expired before the shift date -> BLOCK
            expiredCerts.push({
              name: certName,
              expiry: expiryStr,
              reason: `${certName} expired on ${expiryStr}`,
            });
          } else if (daysDiff === 0) {
            // Expiring ON the shift date is valid
            validCerts.push({
              name: certName,
              reason: `${certName} valid through shift date (expires today)`,
            });
          } else if (daysDiff <= 30) {
            // Expiring within 30 days after the shift date -> WARN
            warningCerts.push({
              name: certName,
              days: daysDiff,
              reason: `${certName} expires in ${daysDiff} day${daysDiff === 1 ? '' : 's'}`,
            });
          } else {
            // Valid well in advance
            validCerts.push({
              name: certName,
              reason: `${certName} valid until ${expiryStr}`,
            });
          }
        }

        if (expiredCerts.length > 0) {
          certStatus = 'fail';
          certOutcomeImpact = OUTCOMES.BLOCK;
          certReason = expiredCerts.map(c => c.reason).join(', ');
        } else if (warningCerts.length > 0) {
          certStatus = 'warn';
          certReason = warningCerts.map(c => c.reason).join(', ');
        } else {
          certStatus = 'pass';
          certReason = validCerts.length > 0 ? validCerts.map(c => c.reason).join(', ') : 'All certifications valid';
        }
      }

      checks.push({
        rule: 'certificate',
        status: certStatus,
        reason: certReason,
      });
    }

    // -------------------------------------------------------------
    // RULE 2: Training Check
    // -------------------------------------------------------------
    let trainingOutcomeImpact = null;
    let trainingStatus = 'pass';
    let trainingReason = '';

    const isTrained = Boolean(swap && swap.trained);
    if (!isTrained) {
      trainingStatus = 'fail';
      trainingOutcomeImpact = OUTCOMES.MANAGER_REVIEW;
      trainingReason = swap && swap.role ? `Employee is not trained for ${swap.role}` : 'Employee is not trained for this role';
    } else {
      trainingStatus = 'pass';
      trainingReason = swap && swap.role ? `Employee is trained for ${swap.role}` : 'Employee is trained for this role';
    }

    checks.push({
      rule: 'training',
      status: trainingStatus,
      reason: trainingReason,
    });

    // -------------------------------------------------------------
    // RULE 3: Overtime / Hours Limit Check
    // -------------------------------------------------------------
    let overtimeOutcomeImpact = null;
    let overtimeStatus = 'pass';
    let overtimeReason = '';

    const scheduled = typeof swap.hoursScheduled === 'number' ? swap.hoursScheduled : parseFloat(swap.hoursScheduled) || 0;
    const shift = typeof swap.shiftHours === 'number' ? swap.shiftHours : parseFloat(swap.shiftHours) || 0;
    const projected = scheduled + shift;

    // Projected strictly greater than hoursLimit triggers overtime rule (48 exact allowed)
    if (projected > config.hoursLimit) {
      overtimeStatus = 'fail';
      if (config.overLimitAction === 'escalate') {
        overtimeOutcomeImpact = OUTCOMES.ESCALATE_REGIONAL;
        overtimeReason = `Projected hours (${projected}h) exceed limit of ${config.hoursLimit}h (escalates to regional approver)`;
      } else {
        overtimeOutcomeImpact = OUTCOMES.MANAGER_REVIEW;
        overtimeReason = `Projected hours (${projected}h) exceed limit of ${config.hoursLimit}h (requires manager review)`;
      }
    } else {
      overtimeStatus = 'pass';
      if (projected === config.hoursLimit) {
        overtimeReason = `Projected hours (${projected}h) at exact limit of ${config.hoursLimit}h (allowed)`;
      } else {
        overtimeReason = `Projected hours (${projected}h) within limit of ${config.hoursLimit}h`;
      }
    }

    checks.push({
      rule: 'overtime',
      status: overtimeStatus,
      reason: overtimeReason,
    });

    // -------------------------------------------------------------
    // OUTCOME RESOLUTION & PRECEDENCE
    // Precedence: BLOCK > ESCALATE_REGIONAL > MANAGER_REVIEW > AUTO_APPROVE
    // -------------------------------------------------------------
    let outcome;
    let primaryReason = '';

    if (certOutcomeImpact === OUTCOMES.BLOCK) {
      outcome = OUTCOMES.BLOCK;
      primaryReason = certReason;
    } else if (overtimeOutcomeImpact === OUTCOMES.ESCALATE_REGIONAL) {
      outcome = OUTCOMES.ESCALATE_REGIONAL;
      primaryReason = overtimeReason;
    } else if (trainingOutcomeImpact === OUTCOMES.MANAGER_REVIEW || overtimeOutcomeImpact === OUTCOMES.MANAGER_REVIEW) {
      outcome = OUTCOMES.MANAGER_REVIEW;
      // If untrained, training reason leads; otherwise overtime leads
      if (trainingStatus === 'fail') {
        primaryReason = trainingReason;
      } else {
        primaryReason = overtimeReason;
      }
    } else {
      outcome = OUTCOMES.AUTO_APPROVE;
      const warnCheck = checks.find(c => c.status === 'warn');
      if (warnCheck) {
        primaryReason = `Auto-approved with warning: ${warnCheck.reason}`;
      } else {
        primaryReason = 'All criteria met for instant auto-approval';
      }
    }

    // -------------------------------------------------------------
    // AUTO-APPROVAL OVERRIDE (Today's manual behaviour)
    // If settings.autoApprove is false, any would-be AUTO_APPROVE
    // becomes MANAGER_REVIEW with the reason "Auto-approval off (today's behaviour)".
    // BLOCK and ESCALATE_REGIONAL still apply.
    // -------------------------------------------------------------
    if (!config.autoApprove) {
      if (outcome === OUTCOMES.AUTO_APPROVE) {
        outcome = OUTCOMES.MANAGER_REVIEW;
        primaryReason = "Auto-approval off (today's behaviour)";
        checks.push({
          rule: 'auto_approval',
          status: 'fail',
          reason: "Auto-approval off (today's behaviour)",
        });
      }
    }

    return {
      outcome,
      reason: primaryReason,
      checks,
      projectedHours: projected,
      hoursLimit: config.hoursLimit,
    };
  }

  // Preloaded 20 replay swap dataset
  const REPLAY_SWAPS = [
    // FreshBowl: 1-8 (certCheck off, overLimitAction manager, 48h limit)
    { id: 1, customer: 'FreshBowl', role: 'Cook', trained: true, hoursScheduled: 30, shiftHours: 8, shiftDate: '2026-11-10', certificates: [] },
    { id: 2, customer: 'FreshBowl', role: 'Cook', trained: true, hoursScheduled: 32, shiftHours: 8, shiftDate: '2026-11-10', certificates: [] },
    { id: 3, customer: 'FreshBowl', role: 'Cashier', trained: true, hoursScheduled: 24, shiftHours: 6, shiftDate: '2026-11-10', certificates: [] },
    { id: 4, customer: 'FreshBowl', role: 'Cook', trained: true, hoursScheduled: 36, shiftHours: 8, shiftDate: '2026-11-10', certificates: [] },
    { id: 5, customer: 'FreshBowl', role: 'Cook', trained: false, hoursScheduled: 20, shiftHours: 8, shiftDate: '2026-11-10', certificates: [] },
    { id: 6, customer: 'FreshBowl', role: 'Cook', trained: true, hoursScheduled: 42, shiftHours: 8, shiftDate: '2026-11-10', certificates: [] },
    { id: 7, customer: 'FreshBowl', role: 'Cleaner', trained: true, hoursScheduled: 28, shiftHours: 6, shiftDate: '2026-11-10', certificates: [] },
    { id: 8, customer: 'FreshBowl', role: 'Cook', trained: true, hoursScheduled: 34, shiftHours: 8, shiftDate: '2026-11-10', certificates: [] },

    // CarePoint: 9-14 (certCheck on, overLimitAction manager, 48h limit)
    {
      id: 9,
      customer: 'CarePoint',
      role: 'Nurse',
      trained: true,
      hoursScheduled: 24,
      shiftHours: 8,
      shiftDate: '2026-11-10',
      certificates: [
        { name: 'BLS', expiry: '2027-03-31' },
        { name: 'Nursing Council', expiry: '2027-03-31' },
      ],
    },
    {
      id: 10,
      customer: 'CarePoint',
      role: 'Nurse',
      trained: true,
      hoursScheduled: 30,
      shiftHours: 8,
      shiftDate: '2026-11-10',
      certificates: [
        { name: 'BLS', expiry: '2026-09-15' },
        { name: 'Nursing Council', expiry: '2027-03-31' },
      ],
    },
    {
      id: 11,
      customer: 'CarePoint',
      role: 'Nurse',
      trained: true,
      hoursScheduled: 20,
      shiftHours: 8,
      shiftDate: '2026-11-10',
      certificates: [
        { name: 'BLS', expiry: '2027-03-31' },
        { name: 'Nursing Council', expiry: '2027-03-31' },
      ],
    },
    {
      id: 12,
      customer: 'CarePoint',
      role: 'Nurse',
      trained: true,
      hoursScheduled: 28,
      shiftHours: 8,
      shiftDate: '2026-11-10',
      certificates: [
        { name: 'BLS', expiry: '2026-11-30' },
        { name: 'Nursing Council', expiry: '2027-03-31' },
      ],
    },
    {
      id: 13,
      customer: 'CarePoint',
      role: 'Receptionist',
      trained: true,
      hoursScheduled: 30,
      shiftHours: 8,
      shiftDate: '2026-11-10',
      certificates: [],
    },
    {
      id: 14,
      customer: 'CarePoint',
      role: 'Nurse',
      trained: false,
      hoursScheduled: 16,
      shiftHours: 8,
      shiftDate: '2026-11-10',
      certificates: [
        { name: 'BLS', expiry: '2027-03-31' },
        { name: 'Nursing Council', expiry: '2027-03-31' },
      ],
    },

    // UrbanMart: 15-20 (certCheck off, overLimitAction escalate, 48h limit)
    { id: 15, customer: 'UrbanMart', role: 'Associate', trained: true, hoursScheduled: 38, shiftHours: 8, shiftDate: '2026-11-10', certificates: [] },
    { id: 16, customer: 'UrbanMart', role: 'Associate', trained: true, hoursScheduled: 42, shiftHours: 8, shiftDate: '2026-11-10', certificates: [] },
    { id: 17, customer: 'UrbanMart', role: 'Associate', trained: true, hoursScheduled: 40, shiftHours: 8, shiftDate: '2026-11-10', certificates: [] },
    { id: 18, customer: 'UrbanMart', role: 'Associate', trained: true, hoursScheduled: 44, shiftHours: 6, shiftDate: '2026-11-10', certificates: [] },
    { id: 19, customer: 'UrbanMart', role: 'Associate', trained: false, hoursScheduled: 30, shiftHours: 8, shiftDate: '2026-11-10', certificates: [] },
    { id: 20, customer: 'UrbanMart', role: 'Associate', trained: true, hoursScheduled: 25, shiftHours: 8, shiftDate: '2026-11-10', certificates: [] },
  ];

  return {
    OUTCOMES,
    CUSTOMER_PRESETS,
    REPLAY_SWAPS,
    evaluateSwap,
    diffInDays,
    parseUTCDate,
  };
});
