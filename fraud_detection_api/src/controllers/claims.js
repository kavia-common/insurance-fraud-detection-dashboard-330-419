const claimsService = require('../services/claims');
const uploadService = require('../services/upload');

class ClaimsController {
  /**
   * PUBLIC_INTERFACE
   * uploadCsv
   * POST /api/claims/upload
   */
  async uploadCsv(req, res, next) {
    try {
      if (!req.file || !req.file.buffer) {
        return res.status(400).json({ message: 'Missing file. Expected multipart form field "file".' });
      }
      const result = await uploadService.ingestCsvBuffer(req.file.buffer);
      return res.status(200).json(result);
    } catch (err) {
      return next(err);
    }
  }

  /**
   * PUBLIC_INTERFACE
   * listClaims
   * GET /api/claims
   */
  async listClaims(req, res, next) {
    try {
      const { q, riskBand, sortBy, sortDir } = req.query || {};
      const claims = await claimsService.listClaims({ q, riskBand, sortBy, sortDir });
      return res.status(200).json({ claims });
    } catch (err) {
      return next(err);
    }
  }

  /**
   * PUBLIC_INTERFACE
   * getClaim
   * GET /api/claims/:id
   */
  async getClaim(req, res, next) {
    try {
      const { id } = req.params;
      const claim = await claimsService.getClaimById(id);
      if (!claim) return res.status(404).json({ message: 'Claim not found' });
      return res.status(200).json({ claim });
    } catch (err) {
      return next(err);
    }
  }

  /**
   * PUBLIC_INTERFACE
   * submitOutcome
   * POST /api/claims/:id/outcome
   */
  async submitOutcome(req, res, next) {
    try {
      const { id } = req.params;
      const { outcome, notes } = req.body || {};
      const updated = await claimsService.submitOutcome(id, { outcome, notes });
      if (!updated) return res.status(404).json({ message: 'Claim not found' });
      return res.status(200).json({ claim: updated });
    } catch (err) {
      return next(err);
    }
  }

  /**
   * PUBLIC_INTERFACE
   * queue
   * GET /api/queue
   */
  async queue(req, res, next) {
    try {
      const queue = await claimsService.getQueue();
      return res.status(200).json({ queue });
    } catch (err) {
      return next(err);
    }
  }

  /**
   * PUBLIC_INTERFACE
   * reportsSummary
   * GET /api/reports/summary
   */
  async reportsSummary(req, res, next) {
    try {
      const summary = await claimsService.getReportsSummary();
      return res.status(200).json(summary);
    } catch (err) {
      return next(err);
    }
  }
}

module.exports = new ClaimsController();
