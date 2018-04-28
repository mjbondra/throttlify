'use strict';

const { spy } = require('sinon');

/**
 * creates an async function stub
 * @param {Object} config - stub configuration
 * @param {Boolean} [config.ctxRequired] - require ctx to bound
 * @param {Object} [config.data] - method response data
 * @param {Error} [config.err] - method error
 * @returns {Object} - async function stub
 */
module.exports = (config = {}) => {
  async function asyncFn () {
    const { ctx, data, err } = config;
    if (err) throw err;
    if (ctx.required && !this) throw ctx.err || new Error('missing context');
    return data;
  }

  return spy(asyncFn);
};
