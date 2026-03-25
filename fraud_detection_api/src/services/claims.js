const { getSupabaseClient } = require('./supabaseClient');

function getRiskBand(row) {
  // Support both schemas:
  // - newer seed/schema uses `risk_band`
  // - earlier iteration used `risk_level`
  return row?.risk_band ?? row?.risk_level ?? null;
}

function getLossDate(row) {
  // Support both schemas:
  // - newer seed/schema uses `claim_date`
  // - earlier iteration used `incident_date`
  return row?.claim_date ?? row?.incident_date ?? null;
}

function toClaimDto(row) {
  if (!row) return row;
  const riskBand = getRiskBand(row);

  // Keep DB fields but also provide common camelCase aliases used by the UI.
  return {
    ...row,
    claimNumber: row.claim_number,
    policyNumber: row.policy_number,
    claimantName: row.claimant_name,
    claimAmount: row.claim_amount,
    lossDate: getLossDate(row), // UI uses lossDate/loss_date as an alias
    riskScore: row.risk_score,
    // Expose both names for compatibility with older UI/service code.
    riskBand,
    riskLevel: riskBand,
  };
}

function toSignalDto(row) {
  if (!row) return row;
  return {
    ...row,
    signalType: row.signal_type,
  };
}

function mapOutcomeToDb(outcome) {
  if (!outcome) return null;
  const v = String(outcome).toLowerCase();
  if (['fraud', 'confirmed_fraud', 'suspected_fraud'].includes(v)) return 'fraud';
  if (['not_fraud', 'no_fraud'].includes(v)) return 'not_fraud';
  if (['needs_more_info'].includes(v)) return null;
  return null;
}

function mapStatusForOutcome(dbOutcome) {
  if (dbOutcome === 'fraud') return 'denied';
  if (dbOutcome === 'not_fraud') return 'approved';
  return 'in_review';
}

/**
 * PUBLIC_INTERFACE
 * listClaims
 * List claims with optional query/filter/sort.
 */
async function listClaims({ q, riskBand, sortBy, sortDir } = {}) {
  const supabase = getSupabaseClient();

  // Detect schema by probing a single row for `risk_band` existence.
  // This prevents 500s when the column name differs between environments.
  const { data: sample, error: sampleErr } = await supabase
    .from('claims')
    .select('risk_band')
    .limit(1);
  if (sampleErr) throw new Error(sampleErr.message);

  const hasRiskBandCol = Array.isArray(sample) && sample.length > 0 && Object.prototype.hasOwnProperty.call(sample[0], 'risk_band');
  const riskCol = hasRiskBandCol ? 'risk_band' : 'risk_level';

  let query = supabase.from('claims').select('*');

  if (riskBand) query = query.eq(riskCol, riskBand);

  if (q) {
    // Basic text search across common columns (PostgREST OR syntax).
    // Note: ilike patterns must escape %/_ if needed; for demo, keep simple.
    const pattern = `%${q}%`;
    query = query.or(
      [
        `claim_number.ilike.${pattern}`,
        `policy_number.ilike.${pattern}`,
        `claimant_name.ilike.${pattern}`,
      ].join(',')
    );
  }

  const sortMap = {
    riskScore: 'risk_score',
    amount: 'claim_amount',
    lossDate: 'incident_date',
  };

  const col = sortMap[sortBy] || 'risk_score';
  const ascending = String(sortDir || 'desc').toLowerCase() === 'asc';

  const { data, error } = await query.order(col, { ascending }).limit(500);
  if (error) throw new Error(error.message);

  return (data || []).map(toClaimDto);
}

/**
 * PUBLIC_INTERFACE
 * getClaimById
 * Fetch claim and attached fraud signals.
 */
async function getClaimById(id) {
  const supabase = getSupabaseClient();

  const { data: claim, error: claimErr } = await supabase
    .from('claims')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (claimErr) throw new Error(claimErr.message);
  if (!claim) return null;

  const { data: signals, error: sigErr } = await supabase
    .from('fraud_signals')
    .select('*')
    .eq('claim_id', id)
    .order('created_at', { ascending: false });

  if (sigErr) throw new Error(sigErr.message);

  return {
    ...toClaimDto(claim),
    fraud_signals: (signals || []).map(toSignalDto),
  };
}

/**
 * PUBLIC_INTERFACE
 * getQueue
 * Return a prioritized queue. For demo: high-risk in new/in_review first.
 */
async function getQueue() {
  const supabase = getSupabaseClient();

  // Some schemas use status values like `pending` instead of `new`.
  const { data, error } = await supabase
    .from('claims')
    .select('*')
    .in('status', ['new', 'pending', 'in_review'])
    .order('risk_score', { ascending: false })
    .limit(50);

  if (error) throw new Error(error.message);

  return (data || []).map((r, idx) => ({
    ...toClaimDto(r),
    priority: idx + 1,
    reason: (r.risk_band ?? r.risk_level) === 'high' ? 'High risk score' : 'Needs review',
  }));
}

/**
 * PUBLIC_INTERFACE
 * submitOutcome
 * Update claim outcome and status.
 */
async function submitOutcome(id, { outcome, notes } = {}) {
  const supabase = getSupabaseClient();

  const dbOutcome = mapOutcomeToDb(outcome);
  const status = mapStatusForOutcome(dbOutcome);

  // Support both schemas:
  // - newer schema supports investigator_notes + outcome_at
  // - earlier schema used description and updated_at
  const patch = {
    outcome: dbOutcome,
    status,
    ...(notes
      ? {
          investigator_notes: notes,
          description: `INVESTIGATOR_NOTES: ${notes}`,
        }
      : {}),
    ...(dbOutcome
      ? {
          outcome_at: new Date().toISOString(),
        }
      : {}),
  };

  const { data, error } = await supabase
    .from('claims')
    .update(patch)
    .eq('id', id)
    .select('*')
    .maybeSingle();

  if (error) throw new Error(error.message);

  return toClaimDto(data);
}

/**
 * PUBLIC_INTERFACE
 * getReportsSummary
 * Aggregate metrics used by reports/topbar.
 */
async function getReportsSummary() {
  const supabase = getSupabaseClient();

  // For demo simplicity: fetch counts by running small queries.
  // This avoids needing SQL functions/RPC on Supabase.
  const { count: totalClaims, error: totalErr } = await supabase
    .from('claims')
    .select('*', { count: 'exact', head: true });
  if (totalErr) throw new Error(totalErr.message);

  // Detect schema columns by selecting a single row.
  const { data: schemaProbe, error: probeErr } = await supabase
    .from('claims')
    .select('risk_band,outcome_at')
    .limit(1);
  if (probeErr) throw new Error(probeErr.message);

  const hasRiskBandCol =
    Array.isArray(schemaProbe) &&
    schemaProbe.length > 0 &&
    Object.prototype.hasOwnProperty.call(schemaProbe[0], 'risk_band');
  const riskCol = hasRiskBandCol ? 'risk_band' : 'risk_level';

  const hasOutcomeAtCol =
    Array.isArray(schemaProbe) &&
    schemaProbe.length > 0 &&
    Object.prototype.hasOwnProperty.call(schemaProbe[0], 'outcome_at');
  const reviewedAtCol = hasOutcomeAtCol ? 'outcome_at' : 'updated_at';

  const { count: highRisk, error: highErr } = await supabase
    .from('claims')
    .select('*', { count: 'exact', head: true })
    .eq(riskCol, 'high');
  if (highErr) throw new Error(highErr.message);

  const { count: inQueue, error: qErr } = await supabase
    .from('claims')
    .select('*', { count: 'exact', head: true })
    .in('status', ['new', 'pending', 'in_review']);
  if (qErr) throw new Error(qErr.message);

  // Breakdown: fetch lightweight columns only.
  const selectCols = `${riskCol},outcome,status,${reviewedAtCol}`;
  const { data: all, error: allErr } = await supabase.from('claims').select(selectCols);
  if (allErr) throw new Error(allErr.message);

  const riskBreakdown = { high: 0, medium: 0, low: 0 };
  const outcomes = { fraud: 0, not_fraud: 0, unreviewed: 0 };

  const today = new Date();
  const yyyy = today.getUTCFullYear();
  const mm = String(today.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(today.getUTCDate()).padStart(2, '0');
  const todayPrefix = `${yyyy}-${mm}-${dd}`;

  let reviewedToday = 0;

  for (const r of all || []) {
    const band = r[riskCol];
    if (band && riskBreakdown[band] != null) riskBreakdown[band] += 1;

    if (r.outcome === 'fraud') outcomes.fraud += 1;
    else if (r.outcome === 'not_fraud') outcomes.not_fraud += 1;
    else outcomes.unreviewed += 1;

    // Treat approved/denied as reviewed; additionally, if there is a reviewedAt column use it.
    if (['approved', 'denied'].includes(r.status)) {
      const reviewedAt = r[reviewedAtCol] ? String(r[reviewedAtCol]) : '';
      if (reviewedAt.startsWith(todayPrefix)) reviewedToday += 1;
    }
  }

  return {
    totalClaims: totalClaims ?? 0,
    highRisk: highRisk ?? 0,
    inQueue: inQueue ?? 0,
    reviewedToday,
    riskBreakdown,
    outcomes,
  };
}

module.exports = {
  listClaims,
  getClaimById,
  getQueue,
  submitOutcome,
  getReportsSummary,
};
