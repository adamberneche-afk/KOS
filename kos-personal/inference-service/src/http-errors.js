'use strict';
// ================================================================
// http-errors.js — what a failed request tells the caller
// ================================================================
// Handlers used to answer every failure with `{ error: err.message }`,
// which sent database, Stripe and Google error text (table names, SQL,
// upstream detail) to whoever called. Errors the caller can act on keep
// their message; anything else is logged in full with a short reference
// and the caller gets that reference instead.

const crypto = require('crypto');

class BadRequestError extends Error {}

// db.consumeCredits() throws this; the Apps Script caller logs the text.
const INSUFFICIENT_CREDITS = 'Insufficient credits';

/**
 * @param {Error}  err
 * @returns {{status: number, body: Object, ref: ?string}}
 */
function describeError(err) {
  if (err instanceof BadRequestError) return { status: 400, body: { error: err.message }, ref: null };
  if (err && err.message === INSUFFICIENT_CREDITS) {
    return { status: 402, body: { error: INSUFFICIENT_CREDITS }, ref: null };
  }
  const ref = crypto.randomBytes(4).toString('hex');
  return { status: 500, body: { error: 'Internal server error', ref }, ref };
}

/**
 * Logs and answers a failed request.
 * @param {Object} logger  winston-style logger.
 * @param {Object} res     Express response.
 * @param {Error}  err
 * @param {string} where   Log context, e.g. 'Job creation'.
 */
function sendError(logger, res, err, where) {
  const d = describeError(err);
  if (d.ref) logger.error(`[Server] ${where} failed (ref ${d.ref}):`, err);
  return res.status(d.status).json(d.body);
}

module.exports = { BadRequestError, INSUFFICIENT_CREDITS, describeError, sendError };
