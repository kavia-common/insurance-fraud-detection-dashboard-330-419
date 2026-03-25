const express = require('express');
const multer = require('multer');
const healthController = require('../controllers/health');
const claimsController = require('../controllers/claims');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// Health endpoint

/**
 * @swagger
 * tags:
 *   - name: Health
 *     description: Service health and diagnostics
 *   - name: Claims
 *     description: Claims ingestion, listing, detail and investigator actions
 *   - name: Queue
 *     description: Investigator queue operations
 *   - name: Reports
 *     description: Summary reporting and analytics
 */

/**
 * @swagger
 * /:
 *   get:
 *     tags: [Health]
 *     summary: Health endpoint
 *     responses:
 *       200:
 *         description: Service health check passed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 message:
 *                   type: string
 *                   example: Service is healthy
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 environment:
 *                   type: string
 *                   example: development
 */
router.get('/', healthController.check.bind(healthController));

/**
 * @swagger
 * components:
 *   schemas:
 *     Claim:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         claim_number:
 *           type: string
 *         policy_number:
 *           type: string
 *         claimant_name:
 *           type: string
 *         claimant_email:
 *           type: string
 *           nullable: true
 *         incident_date:
 *           type: string
 *           format: date
 *         report_date:
 *           type: string
 *           format: date
 *         claim_amount:
 *           type: number
 *         incident_type:
 *           type: string
 *         description:
 *           type: string
 *           nullable: true
 *         risk_level:
 *           type: string
 *           enum: [low, medium, high]
 *         risk_score:
 *           type: integer
 *         status:
 *           type: string
 *           enum: [new, in_review, approved, denied]
 *         outcome:
 *           type: string
 *           enum: [fraud, not_fraud]
 *           nullable: true
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 *     FraudSignal:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         claim_id:
 *           type: string
 *           format: uuid
 *         signal_type:
 *           type: string
 *         severity:
 *           type: string
 *           enum: [low, medium, high]
 *         description:
 *           type: string
 *         rule_code:
 *           type: string
 *           nullable: true
 *         metadata:
 *           type: object
 *         created_at:
 *           type: string
 *           format: date-time
 *     ReportsSummary:
 *       type: object
 *       properties:
 *         totalClaims:
 *           type: integer
 *         highRisk:
 *           type: integer
 *         inQueue:
 *           type: integer
 *         reviewedToday:
 *           type: integer
 *         riskBreakdown:
 *           type: object
 *         outcomes:
 *           type: object
 */

/**
 * @swagger
 * /api/claims/upload:
 *   post:
 *     tags: [Claims]
 *     summary: Upload claims CSV for parsing/scoring and insertion
 *     description: Accepts a CSV file as multipart/form-data field "file". Inserts/updates claims and attaches rule-based fraud signals.
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Upload processed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 inserted:
 *                   type: integer
 *                 updated:
 *                   type: integer
 *                 signalsInserted:
 *                   type: integer
 *                 message:
 *                   type: string
 */
router.post('/api/claims/upload', upload.single('file'), claimsController.uploadCsv.bind(claimsController));

/**
 * @swagger
 * /api/claims:
 *   get:
 *     tags: [Claims]
 *     summary: List claims
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Search term across claim number, policy number, claimant name
 *       - in: query
 *         name: riskBand
 *         schema:
 *           type: string
 *           enum: [low, medium, high]
 *         description: Filter by risk band
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [riskScore, amount, lossDate]
 *         description: Sort column
 *       - in: query
 *         name: sortDir
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *         description: Sort direction
 *     responses:
 *       200:
 *         description: Claims list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 claims:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Claim'
 */
router.get('/api/claims', claimsController.listClaims.bind(claimsController));

/**
 * @swagger
 * /api/claims/{id}:
 *   get:
 *     tags: [Claims]
 *     summary: Get claim detail (including fraud signals)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Claim detail
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 claim:
 *                   allOf:
 *                     - $ref: '#/components/schemas/Claim'
 *                     - type: object
 *                       properties:
 *                         fraud_signals:
 *                           type: array
 *                           items:
 *                             $ref: '#/components/schemas/FraudSignal'
 *       404:
 *         description: Claim not found
 */
router.get('/api/claims/:id', claimsController.getClaim.bind(claimsController));

/**
 * @swagger
 * /api/claims/{id}/outcome:
 *   post:
 *     tags: [Claims]
 *     summary: Submit investigator outcome for a claim
 *     description: Stores outcome (mapped to fraud/not_fraud) and updates status (approved/denied/in_review).
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               outcome:
 *                 type: string
 *                 example: confirmed_fraud
 *               notes:
 *                 type: string
 *                 example: Conflicting statements; refer to SIU.
 *     responses:
 *       200:
 *         description: Updated claim
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 claim:
 *                   $ref: '#/components/schemas/Claim'
 *       404:
 *         description: Claim not found
 */
router.post('/api/claims/:id/outcome', claimsController.submitOutcome.bind(claimsController));

/**
 * @swagger
 * /api/queue:
 *   get:
 *     tags: [Queue]
 *     summary: Get investigator queue (prioritized)
 *     responses:
 *       200:
 *         description: Queue list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 queue:
 *                   type: array
 *                   items:
 *                     allOf:
 *                       - $ref: '#/components/schemas/Claim'
 *                       - type: object
 *                         properties:
 *                           priority:
 *                             type: integer
 *                           reason:
 *                             type: string
 */
router.get('/api/queue', claimsController.queue.bind(claimsController));

/**
 * @swagger
 * /api/reports/summary:
 *   get:
 *     tags: [Reports]
 *     summary: Get reports summary metrics
 *     responses:
 *       200:
 *         description: Summary metrics
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ReportsSummary'
 */
router.get('/api/reports/summary', claimsController.reportsSummary.bind(claimsController));

/**
 * @swagger
 * /api/diag/claims-count:
 *   get:
 *     tags: [Health]
 *     summary: Diagnostics - claims count and sample
 *     description: |
 *       Returns a count of rows in the `claims` table plus up to 3 sample rows.
 *       This is intended as a minimal smoke test to validate:
 *       - backend is reachable
 *       - Supabase env vars are configured
 *       - RLS policies allow reading seeded claims
 *     responses:
 *       200:
 *         description: Diagnostics payload with count + sample.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   example: true
 *                 count:
 *                   type: integer
 *                   example: 10
 *                 sample:
 *                   type: array
 *                   items:
 *                     type: object
 *       500:
 *         description: Diagnostic failure (Supabase connectivity / permissions / configuration).
 */
router.get('/api/diag/claims-count', async (req, res) => {
  // Lazy require to avoid any startup-time coupling; errors are returned in payload.
  // This endpoint is for debug/smoke testing, not for production analytics.
  // eslint-disable-next-line global-require
  const { getSupabaseClient } = require('../services/supabaseClient');

  try {
    const supabase = getSupabaseClient();

    const { count, error: countErr } = await supabase
      .from('claims')
      .select('*', { count: 'exact', head: true });

    if (countErr) {
      return res.status(500).json({
        ok: false,
        message: 'Failed to count claims',
        error: countErr.message,
      });
    }

    const { data: sample, error: sampleErr } = await supabase
      .from('claims')
      .select('id,claim_number,policy_number,claimant_name,risk_score')
      .limit(3);

    if (sampleErr) {
      return res.status(500).json({
        ok: false,
        message: 'Count succeeded but sample query failed (possible RLS/column mismatch)',
        error: sampleErr.message,
        count: count ?? 0,
      });
    }

    return res.status(200).json({ ok: true, count: count ?? 0, sample: sample || [] });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      message: 'Diagnostics endpoint failed (Supabase env vars missing or network/auth error)',
      error: e?.message || String(e),
    });
  }
});

/**
 * PUBLIC_INTERFACE
 * GET /api/diag/routes
 * Returns the list of registered routes (method + path) for this router.
 *
 * Use this to debug "Cannot POST /api/claims/upload" issues and confirm the
 * runtime instance has the expected route mounts.
 */
router.get('/api/diag/routes', (req, res) => {
  const routesList = (router.stack || [])
    .filter(layer => layer && layer.route && layer.route.path)
    .map(layer => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods || {})
        .map(m => m.toUpperCase())
        .sort(),
    }))
    .sort((a, b) => (a.path > b.path ? 1 : -1));

  return res.status(200).json({
    ok: true,
    count: routesList.length,
    routes: routesList,
  });
});

module.exports = router;
