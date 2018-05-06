'use strict';

const { performance } = require('perf_hooks'); // eslint-disable-line
const { spy } = require('sinon');

/**
 * creates an async function stub
 * @param {Object} config - stub configuration
 * @param {Object} config.ctx - ctx configuration
 * @param {Error} [config.ctx.err] - ctx error
 * @param {Boolean} [config.ctx.required] - ctx requirement
 * @param {Object} [config.data] - method response data
 * @param {Number} [config.delay=250] - delay in ms
 * @param {Error} [config.err] - method error
 * @returns {Object} - async function stub
 */
module.exports = (config = {}) => {
  let count = 0;

  async function asyncFn () {
    const id = ++count;
    performance.mark(`fn-${id}-start`);

    const { ctx, data, delay = 250, err } = config;
    if (err) throw err;
    if (ctx.required && !this) throw ctx.err || new Error('missing context');
    await new Promise(resolve => setTimeout(resolve, delay));
    performance.mark(`fn-${id}-finish`);
    return data;
  }

  return spy(asyncFn);
};
