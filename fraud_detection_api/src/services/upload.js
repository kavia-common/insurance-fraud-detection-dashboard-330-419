const Papa = require('papaparse');
const { getSupabaseClient } = require('./supabaseClient');

function required(value, field) {
  if (value == null || String(value).trim() === '') {
    throw new Error(`Missing required field: ${field}`);
  }
  return String(value).trim();
}

function toNumber(value, field) {
  const n = Number(String(value ?? '').replace(/[$,]/g, '').trim());
  if (!Number.isFinite(n)) throw new Error(`Invalid number for ${field}`);
  return n;
}

function toDate(value, field) {
  const s = required(value, field);
  // Accept YYYY-MM-DD or parseable date
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date for ${field}`);
  // Return YYYY-MM-DD
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function computeRisk({ claimAmount, reportLagDays, incidentType, description }) {
  // Simple demo scoring rules:
  // - high amount increases risk
  // - late reporting increases risk
  // - certain incident types increase risk
  // - keywords in description add risk
  let score = 0;
  const signals = [];

  if (claimAmount >= 25000) {
    score += 35;
    signals.push({
      signal_type: 'HighClaimAmount',
      severity: 'high',
      description: `Claim amount ${claimAmount} is unusually high.`,
      rule_code: 'AMT_25K',
      metadata: { claimAmount },
    });
  } else if (claimAmount >= 10000) {
    score += 20;
    signals.push({
      signal_type: 'ElevatedClaimAmount',
      severity: 'medium',
      description: `Claim amount ${claimAmount} is elevated.`,
      rule_code: 'AMT_10K',
      metadata: { claimAmount },
    });
  } else if (claimAmount >= 5000) {
    score += 10;
  }

  if (reportLagDays >= 10) {
    score += 25;
    signals.push({
      signal_type: 'LateReporting',
      severity: 'high',
      description: `Claim was reported ${reportLagDays} days after incident.`,
      rule_code: 'LAG_10D',
      metadata: { reportLagDays },
    });
  } else if (reportLagDays >= 4) {
    score += 12;
    signals.push({
      signal_type: 'ModerateReportingLag',
      severity: 'medium',
      description: `Claim was reported ${reportLagDays} days after incident.`,
      rule_code: 'LAG_4D',
      metadata: { reportLagDays },
    });
  }

  const type = String(incidentType || '').toLowerCase();
  if (['property', 'fire', 'theft'].some(t => type.includes(t))) {
    score += 10;
  }

  const desc = String(description || '').toLowerCase();
  const keywordHits = [];
  for (const kw of ['conflicting', 'accelerant', 'inconsistent', 'policy inception', 'unusual']) {
    if (desc.includes(kw)) keywordHits.push(kw);
  }
  if (keywordHits.length > 0) {
    score += Math.min(20, 5 * keywordHits.length);
    signals.push({
      signal_type: 'KeywordIndicators',
      severity: keywordHits.length >= 3 ? 'high' : 'medium',
      description: `Description contains risk keywords: ${keywordHits.join(', ')}`,
      rule_code: 'KW_MATCH',
      metadata: { keywordHits },
    });
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  const risk_level = score >= 75 ? 'high' : score >= 40 ? 'medium' : 'low';

  return { risk_score: score, risk_level, signals };
}

function normalizeRow(row) {
  // Accept flexible CSV header names.
  const claim_number = row.claim_number || row.claimNumber || row['Claim #'] || row.claim_no;
  const policy_number = row.policy_number || row.policyNumber || row['Policy #'] || row.policy_no;
  const claimant_name = row.claimant_name || row.claimantName || row['Claimant Name'] || row.name;
  const claimant_email = row.claimant_email || row.claimantEmail || row.email;

  const incident_date = row.incident_date || row.incidentDate || row.loss_date || row.lossDate || row['Loss Date'];
  const report_date = row.report_date || row.reportDate || row['Report Date'];

  const claim_amount = row.claim_amount || row.claimAmount || row.amount || row['Claim Amount'];
  const incident_type = row.incident_type || row.incidentType || row.type || row['Incident Type'];
  const description = row.description || row['Description'] || '';

  const normalized = {
    claim_number: required(claim_number, 'claim_number'),
    policy_number: required(policy_number, 'policy_number'),
    claimant_name: required(claimant_name, 'claimant_name'),
    claimant_email: claimant_email ? String(claimant_email).trim() : null,
    incident_date: toDate(incident_date, 'incident_date'),
    report_date: toDate(report_date || incident_date, 'report_date'),
    claim_amount: toNumber(claim_amount, 'claim_amount'),
    incident_type: required(incident_type, 'incident_type'),
    description: description ? String(description).trim() : null,
  };

  const incident = new Date(normalized.incident_date);
  const report = new Date(normalized.report_date);
  const reportLagDays = Math.max(0, Math.round((report.getTime() - incident.getTime()) / (24 * 3600 * 1000)));

  const risk = computeRisk({
    claimAmount: normalized.claim_amount,
    reportLagDays,
    incidentType: normalized.incident_type,
    description: normalized.description,
  });

  return { ...normalized, ...risk };
}

/**
 * PUBLIC_INTERFACE
 * ingestCsvBuffer
 * Parse an uploaded CSV (buffer) and insert claims + fraud_signals into Supabase.
 */
async function ingestCsvBuffer(buffer) {
  const supabase = getSupabaseClient();

  const csv = buffer.toString('utf-8');

  const parsed = Papa.parse(csv, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  });

  if (parsed.errors && parsed.errors.length) {
    const first = parsed.errors[0];
    throw new Error(`CSV parse error: ${first.message || 'Unknown error'}`);
  }

  const rows = Array.isArray(parsed.data) ? parsed.data : [];
  if (rows.length === 0) {
    return { inserted: 0, updated: 0, signalsInserted: 0, message: 'No rows found in CSV.' };
  }

  let inserted = 0;
  let updated = 0;
  let signalsInserted = 0;

  for (let i = 0; i < rows.length; i += 1) {
    const raw = rows[i];
    const normalized = normalizeRow(raw);

    // Upsert claims by claim_number (unique).
    const claimPayload = {
      claim_number: normalized.claim_number,
      policy_number: normalized.policy_number,
      claimant_name: normalized.claimant_name,
      claimant_email: normalized.claimant_email,
      incident_date: normalized.incident_date,
      report_date: normalized.report_date,
      claim_amount: normalized.claim_amount,
      incident_type: normalized.incident_type,
      description: normalized.description,
      risk_level: normalized.risk_level,
      risk_score: normalized.risk_score,
      status: normalized.risk_level === 'high' ? 'in_review' : 'new',
    };

    const { data: upserted, error: upsertErr } = await supabase
      .from('claims')
      .upsert(claimPayload, { onConflict: 'claim_number' })
      .select('id')
      .maybeSingle();

    if (upsertErr) throw new Error(upsertErr.message);
    if (!upserted?.id) throw new Error('Failed to upsert claim (missing id).');

    // Heuristic: we can’t easily distinguish insert vs update w/out extra query; keep simple:
    updated += 1;

    const claimId = upserted.id;

    // Insert signals for this ingestion (do not de-dup for demo simplicity).
    const sigs = (normalized.signals || []).map(s => ({
      claim_id: claimId,
      signal_type: s.signal_type,
      severity: s.severity,
      description: s.description,
      rule_code: s.rule_code,
      metadata: s.metadata || {},
    }));

    if (sigs.length) {
      const { error: sigErr } = await supabase.from('fraud_signals').insert(sigs);
      if (sigErr) throw new Error(sigErr.message);
      signalsInserted += sigs.length;
    }

    inserted += 1;
  }

  return {
    inserted,
    updated,
    signalsInserted,
    message: 'CSV processed successfully.',
  };
}

module.exports = {
  ingestCsvBuffer,
};
