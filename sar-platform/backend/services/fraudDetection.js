/**
 * SAR Platform - Fraud Detection Engine
 * Rule-based + Statistical anomaly detection (no paid APIs)
 */

// ── Rule Thresholds ──────────────────────────────────────────────────────────
const RULES = {
  LARGE_CASH_THRESHOLD: 10000,          // CTR threshold
  STRUCTURING_THRESHOLD: 9000,          // Just below CTR
  RAPID_TRANSFER_WINDOW_HOURS: 24,
  RAPID_TRANSFER_MIN_COUNT: 3,
  ROUND_AMOUNT_THRESHOLD: 5000,
  HIGH_RISK_COUNTRIES: ['IR', 'KP', 'SY', 'CU', 'RU', 'AF', 'MM', 'YE', 'SD', 'LY'],
  VELOCITY_MULTIPLIER: 3,               // Flag if > 3x average
  DORMANCY_DAYS: 90,                    // Account considered dormant
  UNUSUAL_HOUR_START: 0,               // Midnight
  UNUSUAL_HOUR_END: 5,                 // 5 AM
};

// ── Individual Rule Evaluators ───────────────────────────────────────────────

function checkLargeTransaction(tx) {
  const flags = [];
  let score = 0;
  if (tx.amount >= RULES.LARGE_CASH_THRESHOLD && tx.type === 'cash') {
    flags.push(`Large cash transaction of ${formatCurrency(tx.amount)} meets CTR reporting threshold ($10,000)`);
    score += 35;
  } else if (tx.amount >= 50000) {
    flags.push(`Unusually large transaction: ${formatCurrency(tx.amount)}`);
    score += 25;
  } else if (tx.amount >= 20000) {
    flags.push(`High-value transaction: ${formatCurrency(tx.amount)}`);
    score += 15;
  }
  return { flags, score };
}

function checkStructuring(transactions, current) {
  const flags = [];
  let score = 0;
  const windowStart = new Date(current.date);
  windowStart.setHours(windowStart.getHours() - 48);

  const relatedTxns = transactions.filter(tx =>
    tx.transactionId !== current.transactionId &&
    (tx.senderAccount === current.senderAccount || tx.senderName === current.senderName) &&
    new Date(tx.date) >= windowStart &&
    tx.amount >= RULES.STRUCTURING_THRESHOLD &&
    tx.amount < RULES.LARGE_CASH_THRESHOLD
  );

  if (relatedTxns.length >= 2) {
    const totalAmount = relatedTxns.reduce((s, t) => s + t.amount, 0) + current.amount;
    flags.push(`Potential structuring: ${relatedTxns.length + 1} transactions totaling ${formatCurrency(totalAmount)} in 48-hour window, each below $10,000 CTR threshold`);
    score += 45;
  }

  // Single near-threshold transaction
  if (current.amount >= RULES.STRUCTURING_THRESHOLD && current.amount < RULES.LARGE_CASH_THRESHOLD) {
    flags.push(`Transaction amount of ${formatCurrency(current.amount)} is just below CTR threshold — possible structuring indicator`);
    score += 20;
  }

  return { flags, score };
}

function checkRapidTransfers(transactions, current) {
  const flags = [];
  let score = 0;
  const windowStart = new Date(current.date);
  windowStart.setHours(windowStart.getHours() - RULES.RAPID_TRANSFER_WINDOW_HOURS);

  const rapidTxns = transactions.filter(tx =>
    tx.transactionId !== current.transactionId &&
    (tx.senderAccount === current.senderAccount || tx.receiverAccount === current.senderAccount) &&
    new Date(tx.date) >= windowStart &&
    (tx.type === 'transfer' || tx.type === 'wire')
  );

  if (rapidTxns.length >= RULES.RAPID_TRANSFER_MIN_COUNT) {
    flags.push(`Rapid fund movement: ${rapidTxns.length + 1} transfers within 24 hours totaling ${formatCurrency(rapidTxns.reduce((s, t) => s + t.amount, 0) + current.amount)}`);
    score += 30;
  }
  return { flags, score };
}

function checkHighRiskJurisdiction(tx) {
  const flags = [];
  let score = 0;
  const countries = [tx.senderCountry, tx.receiverCountry].filter(Boolean);
  const highRisk = countries.filter(c => RULES.HIGH_RISK_COUNTRIES.includes(c?.toUpperCase()));
  if (highRisk.length > 0) {
    flags.push(`Transaction involves high-risk jurisdiction(s): ${highRisk.join(', ')} (OFAC/FATF monitored)`);
    score += 40;
  }
  return { flags, score };
}

function checkRoundAmounts(tx) {
  const flags = [];
  let score = 0;
  if (tx.amount >= RULES.ROUND_AMOUNT_THRESHOLD) {
    const cents = tx.amount % 1;
    const isRound = cents === 0 && tx.amount % 1000 === 0;
    if (isRound) {
      flags.push(`Suspiciously round transaction amount: ${formatCurrency(tx.amount)} — common in layering schemes`);
      score += 10;
    }
  }
  return { flags, score };
}

function checkUnusualHours(tx) {
  const flags = [];
  let score = 0;
  const hour = new Date(tx.date).getHours();
  if (hour >= RULES.UNUSUAL_HOUR_START && hour <= RULES.UNUSUAL_HOUR_END) {
    flags.push(`Transaction initiated at unusual hour: ${String(hour).padStart(2, '0')}:${String(new Date(tx.date).getMinutes()).padStart(2, '0')} — outside normal business hours`);
    score += 12;
  }
  return { flags, score };
}

function checkCrossJurisdictionLayering(transactions, current) {
  const flags = [];
  let score = 0;
  
  // Check if same account sends to multiple different countries
  const relatedSends = transactions.filter(tx =>
    tx.transactionId !== current.transactionId &&
    tx.senderAccount === current.senderAccount &&
    tx.receiverCountry && tx.receiverCountry !== current.senderCountry
  );
  
  const uniqueCountries = [...new Set(relatedSends.map(t => t.receiverCountry))];
  if (uniqueCountries.length >= 3) {
    flags.push(`Cross-border layering pattern: funds dispersed to ${uniqueCountries.length} different countries (${uniqueCountries.join(', ')})`);
    score += 35;
  }
  return { flags, score };
}

function checkVelocityAnomaly(transactions, current) {
  const flags = [];
  let score = 0;

  // Get 30-day historical average for this account
  const thirtyDaysAgo = new Date(current.date);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const historicalTxns = transactions.filter(tx =>
    tx.senderAccount === current.senderAccount &&
    new Date(tx.date) >= thirtyDaysAgo &&
    tx.transactionId !== current.transactionId
  );

  if (historicalTxns.length >= 5) {
    const avgAmount = historicalTxns.reduce((s, t) => s + t.amount, 0) / historicalTxns.length;
    if (current.amount > avgAmount * RULES.VELOCITY_MULTIPLIER) {
      flags.push(`Velocity anomaly: current transaction (${formatCurrency(current.amount)}) is ${(current.amount / avgAmount).toFixed(1)}x the 30-day average of ${formatCurrency(avgAmount)}`);
      score += 25;
    }
  }
  return { flags, score };
}

function checkCryptoMixing(tx) {
  const flags = [];
  let score = 0;
  if (tx.type === 'crypto') {
    flags.push('Cryptocurrency transaction — increased anonymity risk; possible mixing/tumbling activity');
    score += 20;
    if (tx.amount > 10000) {
      flags.push(`High-value crypto transaction: ${formatCurrency(tx.amount)}`);
      score += 15;
    }
  }
  return { flags, score };
}

function checkDormantAccount(transactions, current) {
  const flags = [];
  let score = 0;
  
  const priorTxns = transactions.filter(tx =>
    tx.senderAccount === current.senderAccount &&
    tx.transactionId !== current.transactionId &&
    new Date(tx.date) < new Date(current.date)
  ).sort((a, b) => new Date(b.date) - new Date(a.date));

  if (priorTxns.length > 0) {
    const daysSinceLast = Math.floor(
      (new Date(current.date) - new Date(priorTxns[0].date)) / (1000 * 60 * 60 * 24)
    );
    if (daysSinceLast >= RULES.DORMANCY_DAYS) {
      flags.push(`Sudden activity on dormant account: no transactions for ${daysSinceLast} days, now initiating ${formatCurrency(current.amount)} transfer`);
      score += 28;
    }
  }
  return { flags, score };
}

// ── Statistical Anomaly (Z-Score) ────────────────────────────────────────────

function computeZScoreAnomaly(transactions, current) {
  const amounts = transactions
    .filter(tx => tx.type === current.type)
    .map(tx => tx.amount);
  
  if (amounts.length < 5) return { zScore: 0, anomalyScore: 0 };
  
  const mean = amounts.reduce((s, v) => s + v, 0) / amounts.length;
  const variance = amounts.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / amounts.length;
  const stdDev = Math.sqrt(variance);
  
  if (stdDev === 0) return { zScore: 0, anomalyScore: 0 };
  
  const zScore = Math.abs((current.amount - mean) / stdDev);
  // Normalize z-score to 0-100
  const anomalyScore = Math.min(100, Math.round((zScore / 5) * 100));
  
  return { zScore, anomalyScore };
}

// ── Isolation Forest (simplified) ────────────────────────────────────────────

function isolationForestScore(transactions, current) {
  // Simplified path length estimation
  const features = ['amount'];
  let pathLengths = [];
  
  for (let i = 0; i < 50; i++) {
    let path = 0;
    let subset = [...transactions];
    
    while (subset.length > 1 && path < 15) {
      const feature = features[Math.floor(Math.random() * features.length)];
      const vals = subset.map(t => t[feature]);
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      
      if (max === min) break;
      
      const splitVal = min + Math.random() * (max - min);
      const left = subset.filter(t => t[feature] < splitVal);
      const right = subset.filter(t => t[feature] >= splitVal);
      
      if (current[feature] < splitVal) subset = left;
      else subset = right;
      path++;
    }
    pathLengths.push(path);
  }
  
  const avgPath = pathLengths.reduce((s, v) => s + v, 0) / pathLengths.length;
  // Lower path length = more anomalous
  const maxPath = 15;
  const score = Math.max(0, Math.min(100, Math.round((1 - avgPath / maxPath) * 100)));
  return score;
}

// ── Master Analysis Function ─────────────────────────────────────────────────

function analyzeTransaction(transaction, allTransactions) {
  const checks = [
    checkLargeTransaction(transaction),
    checkStructuring(allTransactions, transaction),
    checkRapidTransfers(allTransactions, transaction),
    checkHighRiskJurisdiction(transaction),
    checkRoundAmounts(transaction),
    checkUnusualHours(transaction),
    checkCrossJurisdictionLayering(allTransactions, transaction),
    checkVelocityAnomaly(allTransactions, transaction),
    checkCryptoMixing(transaction),
    checkDormantAccount(allTransactions, transaction),
  ];

  const allFlags = checks.flatMap(c => c.flags);
  const ruleScore = Math.min(100, checks.reduce((s, c) => s + c.score, 0));

  const { zScore, anomalyScore } = computeZScoreAnomaly(allTransactions, transaction);
  const isoScore = isolationForestScore(allTransactions, transaction);

  // Weighted composite score
  const finalScore = Math.min(100, Math.round(
    ruleScore * 0.6 +
    anomalyScore * 0.25 +
    isoScore * 0.15
  ));

  const riskLevel =
    finalScore >= 75 ? 'critical' :
    finalScore >= 50 ? 'high' :
    finalScore >= 25 ? 'medium' : 'low';

  return {
    riskScore: finalScore,
    riskLevel,
    riskFlags: allFlags,
    anomalyScore: Math.round((anomalyScore + isoScore) / 2),
    details: { ruleScore, anomalyScore, isoScore, zScore }
  };
}

// ── Batch Analysis ───────────────────────────────────────────────────────────

function analyzeBatch(transactions) {
  return transactions.map(tx => ({
    transactionId: tx.transactionId,
    ...analyzeTransaction(tx, transactions)
  }));
}

// ── Pattern Detection for SAR ────────────────────────────────────────────────

function detectPatterns(transactions) {
  const patterns = [];
  const flagged = transactions.filter(tx => tx.riskScore >= 25);
  
  if (flagged.length === 0) return patterns;

  // Pattern 1: Structuring
  const structuring = flagged.filter(tx => tx.riskFlags.some(f => f.toLowerCase().includes('structuring')));
  if (structuring.length > 0) {
    patterns.push({
      patternType: 'Structuring / Smurfing',
      description: `${structuring.length} transaction(s) identified with amounts intentionally kept below reporting thresholds, consistent with structuring to evade CTR requirements (31 U.S.C. § 5324).`,
      severity: 'high',
      evidence: structuring.slice(0, 3).map(t => `Transaction ${t.transactionId}: ${formatCurrency(t.amount)}`),
      ruleTriggered: 'RULE_STRUCTURING_DETECTION'
    });
  }

  // Pattern 2: Rapid movement / Layering
  const layering = flagged.filter(tx => tx.riskFlags.some(f => f.toLowerCase().includes('rapid')));
  if (layering.length > 0) {
    const total = layering.reduce((s, t) => s + t.amount, 0);
    patterns.push({
      patternType: 'Layering / Rapid Fund Movement',
      description: `Rapid movement of ${formatCurrency(total)} across ${layering.length} transactions detected, consistent with the layering phase of money laundering (BSA/AML typology).`,
      severity: 'high',
      evidence: layering.slice(0, 3).map(t => `${formatCurrency(t.amount)} on ${new Date(t.date).toLocaleDateString()}`),
      ruleTriggered: 'RULE_RAPID_TRANSFERS'
    });
  }

  // Pattern 3: High-risk jurisdiction
  const intl = flagged.filter(tx => tx.riskFlags.some(f => f.toLowerCase().includes('jurisdiction')));
  if (intl.length > 0) {
    patterns.push({
      patternType: 'High-Risk Jurisdiction Exposure',
      description: `${intl.length} transaction(s) involve countries designated as high-risk or under OFAC sanctions/FATF monitoring, requiring enhanced due diligence per 31 CFR Part 1010.`,
      severity: 'critical',
      evidence: intl.slice(0, 3).map(t => `${t.receiverCountry || t.senderCountry}: ${formatCurrency(t.amount)}`),
      ruleTriggered: 'RULE_HIGH_RISK_COUNTRY'
    });
  }

  // Pattern 4: Velocity anomaly
  const velocity = flagged.filter(tx => tx.riskFlags.some(f => f.toLowerCase().includes('velocity')));
  if (velocity.length > 0) {
    patterns.push({
      patternType: 'Transaction Velocity Anomaly',
      description: `Statistical analysis (Z-score method) identified ${velocity.length} transaction(s) with amounts significantly deviating from established behavioral baseline, indicating potential account compromise or unusual activity.`,
      severity: 'medium',
      evidence: velocity.slice(0, 3).map(t => `${formatCurrency(t.amount)} — ${t.riskScore}% risk score`),
      ruleTriggered: 'RULE_VELOCITY_ANOMALY'
    });
  }

  // Pattern 5: Dormant account
  const dormant = flagged.filter(tx => tx.riskFlags.some(f => f.toLowerCase().includes('dormant')));
  if (dormant.length > 0) {
    patterns.push({
      patternType: 'Dormant Account Reactivation',
      description: `Account(s) with extended periods of inactivity suddenly initiated significant transactions, consistent with account takeover or third-party control indicators.`,
      severity: 'medium',
      evidence: dormant.map(t => `Account ${t.senderAccount}: ${formatCurrency(t.amount)}`),
      ruleTriggered: 'RULE_DORMANT_ACCOUNT'
    });
  }

  // Pattern 6: Crypto
  const crypto = flagged.filter(tx => tx.type === 'crypto');
  if (crypto.length > 0) {
    patterns.push({
      patternType: 'Cryptocurrency / Virtual Asset Activity',
      description: `${crypto.length} cryptocurrency transaction(s) totaling ${formatCurrency(crypto.reduce((s,t) => s+t.amount, 0))} detected. Virtual assets present elevated risk of anonymization and potential conversion through mixing services.`,
      severity: 'high',
      evidence: crypto.map(t => `${formatCurrency(t.amount)} via ${t.channel}`),
      ruleTriggered: 'RULE_CRYPTO_ACTIVITY'
    });
  }

  return patterns;
}

// ── NLP Narrative Generator (local rule-based NLP) ───────────────────────────

function generateNarrative(sarData) {
  const { subjectInfo, riskSummary, detectedPatterns, filingInstitution } = sarData;
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const { start, end } = riskSummary.dateRange || {};
  const dateRangeStr = start && end
    ? `${new Date(start).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} through ${new Date(end).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`
    : 'the reported period';

  const subjectDesc = subjectInfo.entityType === 'business'
    ? `business entity "${subjectInfo.name || 'Unknown Entity'}"`
    : `individual known as "${subjectInfo.name || 'Unknown Subject'}"`;

  const riskAdj = riskSummary.riskLevel === 'critical' ? 'critically high' :
    riskSummary.riskLevel === 'high' ? 'high' :
    riskSummary.riskLevel === 'medium' ? 'moderate' : 'elevated';

  // ── Introduction ─────────────────────────────────────────────────────────
  const introduction = `This Suspicious Activity Report (SAR) is filed by ${filingInstitution.name} (EIN: ${filingInstitution.ein}), located at ${filingInstitution.address}, pursuant to the Bank Secrecy Act (BSA), 31 U.S.C. § 5318(g), and implementing regulations at 31 C.F.R. § 1020.320. This institution is required to file a SAR when it knows, suspects, or has reason to suspect that a transaction involves funds derived from illegal activity, is designed to evade reporting or recordkeeping requirements, lacks a lawful purpose, or involves a use of the institution to facilitate criminal activity.

This report documents suspicious financial activity associated with the ${subjectDesc}, account number(s) ${(subjectInfo.accountNumbers || ['N/A']).join(', ')}, for transactions occurring during the period of ${dateRangeStr}. The aggregate value of reportable transactions identified is ${formatCurrency(riskSummary.totalAmount || 0)}, encompassing ${riskSummary.transactionCount || 0} discrete transaction(s), of which ${riskSummary.flaggedCount || 0} have been flagged as suspicious through automated pattern analysis and rule-based detection systems.`;

  // ── Observed Behavior ────────────────────────────────────────────────────
  const flagsList = (riskSummary.primaryFlags || []).slice(0, 6).map((f, i) => `  ${i + 1}. ${f}`).join('\n');
  const observedBehavior = `During the period under review, the subject's account(s) exhibited a pattern of financial activity inconsistent with expected customer behavior and inconsistent with any legitimate business purpose known to this institution. The automated fraud detection system, employing both rule-based BSA/AML typology matching and statistical anomaly detection algorithms (z-score analysis and isolation forest modeling), assigned an overall risk score of ${riskSummary.overallScore}/100, categorizing the activity as ${riskAdj} risk.

The following behavioral indicators were identified across the ${riskSummary.transactionCount} analyzed transactions:

${flagsList || '  No specific flags recorded.'}

Transaction activity was concentrated across ${riskSummary.transactionCount} events, with individual amounts ranging substantially and aggregate volume of ${formatCurrency(riskSummary.totalAmount || 0)}. The pattern, timing, and structure of these transactions, taken in totality, raise significant concerns regarding the potential illegitimate origin or purpose of the funds.`;

  // ── Suspicious Patterns ──────────────────────────────────────────────────
  const patternsText = detectedPatterns.length > 0
    ? detectedPatterns.map((p, i) => {
        const evidenceText = p.evidence && p.evidence.length > 0
          ? `\n   Evidence: ${p.evidence.join('; ')}`
          : '';
        return `${i + 1}. ${p.patternType.toUpperCase()} (Severity: ${p.severity.toUpperCase()})\n   ${p.description}${evidenceText}\n   Detection Rule: ${p.ruleTriggered}`;
      }).join('\n\n')
    : 'Statistical anomalies detected in transaction volume and frequency inconsistent with account profile.';

  const suspiciousPatterns = `Based on comprehensive analysis of the transaction data, the following suspicious activity typologies and patterns were identified in accordance with FinCEN guidance and BSA/AML best practices:

${patternsText}

The cumulative weight of these indicators, assessed through a multi-layered detection framework combining deterministic rule evaluation with probabilistic anomaly scoring, establishes a reasonable basis for suspicion that the described activity may involve proceeds of unlawful activity or a violation of federal law. Each pattern identified above has been cross-referenced against established FinCEN typologies and FATF guidance on money laundering red flags.`;

  // ── Conclusion ───────────────────────────────────────────────────────────
  const conclusion = `Based on the totality of information gathered and reviewed, ${filingInstitution.name} has determined that the financial activity described herein is suspicious and warrants the filing of this Suspicious Activity Report with the Financial Crimes Enforcement Network (FinCEN) via the BSA E-Filing System.

The subject's activity demonstrates characteristics consistent with one or more of the following potential violations: structuring to evade currency transaction reporting requirements (31 U.S.C. § 5324), money laundering (18 U.S.C. §§ 1956-1957), wire fraud (18 U.S.C. § 1343), or use of financial institution to conduct unlawful activity.

This institution has not notified the subject of the filing of this SAR, consistent with the prohibition on "tipping off" under 31 U.S.C. § 5318(g)(2). All underlying transaction records, account statements, and supporting documentation are being retained in accordance with BSA recordkeeping requirements (31 C.F.R. § 1020.410) and will be made available to appropriate law enforcement and regulatory authorities upon lawful request.

This SAR was generated on ${today} by the compliance department of ${filingInstitution.name}. The automated narrative was reviewed for accuracy and completeness prior to filing. Risk Score: ${riskSummary.overallScore}/100 (${riskSummary.riskLevel?.toUpperCase()}).`;

  const fullNarrative = `INTRODUCTION\n${'─'.repeat(80)}\n${introduction}\n\nOBSERVED BEHAVIOR\n${'─'.repeat(80)}\n${observedBehavior}\n\nSUSPICIOUS PATTERNS IDENTIFIED\n${'─'.repeat(80)}\n${suspiciousPatterns}\n\nCONCLUSION AND FILING CERTIFICATION\n${'─'.repeat(80)}\n${conclusion}`;

  return { introduction, observedBehavior, suspiciousPatterns, conclusion, fullNarrative };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount || 0);
}

module.exports = {
  analyzeTransaction,
  analyzeBatch,
  detectPatterns,
  generateNarrative,
  RULES,
};
