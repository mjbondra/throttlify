'use strict';

const chai = require('chai');
const dirtyChai = require('dirty-chai');
const { performance, PerformanceObserver } = require('perf_hooks'); // eslint-disable-line
const sinonChai = require('sinon-chai');

const stubs = require('./stubs');
const throttlify = require('../../lib');

const { expect } = chai;

chai.use(dirtyChai);
chai.use(sinonChai);

describe('throttlify', () => {
  let asyncFunction;
  let ctx;
  let opts;
  let stubConfig;

  beforeEach(() => {
    ctx = null;
    opts = { duration: 500, max: 10 };
    stubConfig = {
      asyncFunction: {
        ctx: {
          err: null,
          required: false
        },
        data: 'foo',
        err: null
      }
    };
    asyncFunction = stubs.asyncFunction(stubConfig.asyncFunction);
  });

  it('should return a function', () => {
    expect(throttlify(asyncFunction)).to.be.a('function');
    expect(throttlify(asyncFunction, opts)).to.be.a('function');
    expect(throttlify(asyncFunction, opts, ctx)).to.be.a('function');
  });

  describe('throttled async function', () => {
    let entries;
    let obs;
    let throttledAsyncFunction;

    beforeEach(() => {
      entries = [];
      throttledAsyncFunction = throttlify(asyncFunction, opts);
      obs = new PerformanceObserver(list => {
        entries.push(...list.getEntries());
        obs.disconnect();
      });
      obs.observe({ entryTypes: ['measure'] });
    });

    it('should execute the async function when the queue is smaller than the max', async () => {
      const n = opts.max - 1;
      Array.from(new Array(n - 1)).forEach(() => throttledAsyncFunction());
      const data = await throttledAsyncFunction();
      performance.measure('start-of-last to end-of-first', `fn-${n}-start`, 'fn-1-finish');
      expect(asyncFunction).to.have.been.called();
      expect(data).to.equal(stubConfig.asyncFunction.data);
      expect(entries[0].duration).to.be.greaterThan(0);
    });

    it('should defer the execution of the async function when the queue is larger than the max', async () => {
      const n = opts.max + 1;
      Array.from(new Array(n - 1)).forEach(() => throttledAsyncFunction());
      const data = await throttledAsyncFunction();
      performance.measure('end-of-first to start-of-last', 'fn-1-finish', `fn-${n}-start`);
      expect(asyncFunction).to.have.been.called();
      expect(data).to.equal(stubConfig.asyncFunction.data);
      expect(entries[0].duration).to.be.at.least(opts.duration);
    });

    it('should have catchable async function errors', async () => {
      stubConfig.asyncFunction.err = new Error('async function error');
      const data = await throttledAsyncFunction().catch(err => err);
      expect(asyncFunction).to.have.been.called();
      expect(data).to.equal(stubConfig.asyncFunction.err);
    });

    it('should catch async function errors on defered async function executions', async () => {
      const n = opts.max + 1;
      Array.from(new Array(n - 1)).forEach(() => throttledAsyncFunction());
      stubConfig.asyncFunction.err = new Error('async function error');
      const data = await throttledAsyncFunction().catch(err => err);
      performance.measure('end-of-first to start-of-last', 'fn-1-finish', `fn-${n}-start`);
      expect(asyncFunction).to.have.been.called();
      expect(data).to.equal(stubConfig.asyncFunction.err);
      expect(entries[0].duration).to.be.at.least(opts.duration);
    });

    describe('concurrency', () => {
      it('should not limit concurrency when the value of the concurrency property is falsy', async () => {
        const n = opts.max / 2;
        throttledAsyncFunction = throttlify(asyncFunction, { ...opts, concurrent: null });
        Array.from(new Array(n - 1)).forEach(() => throttledAsyncFunction());
        await throttledAsyncFunction();
        performance.measure('start-of-last to end-of-first', `fn-${n}-start`, 'fn-1-finish');
        expect(asyncFunction).to.have.been.called();
        expect(entries[0].duration).to.be.at.greaterThan(0);
      });

      it('should limit concurrency when number of requests is greater than the concurrency limit', async () => {
        const n = opts.max / 2;
        throttledAsyncFunction = throttlify(asyncFunction, { ...opts, concurrent: n - 1 });
        Array.from(new Array(n - 1)).forEach(() => throttledAsyncFunction());
        await throttledAsyncFunction();
        performance.measure('end-of-first to start-of-last', 'fn-1-finish', `fn-${n}-start`);
        expect(asyncFunction).to.have.been.called();
        expect(entries[0].duration).to.be.at.greaterThan(0);
      });

      it('should limit concurrency and number of requests per duration', async () => {
        const n = opts.max + 1;
        const concurrent = opts.max / 2;
        throttledAsyncFunction = throttlify(asyncFunction, { ...opts, concurrent });
        Array.from(new Array(n - 1)).forEach(() => throttledAsyncFunction());
        await throttledAsyncFunction();
        performance.measure('end-of-first to start-of-first-nonconcurrent', 'fn-1-finish', `fn-${concurrent + 1}-start`);
        performance.measure('end-of-first to start-of-last', 'fn-1-finish', `fn-${n}-start`);
        expect(entries[0].duration).to.be.at.greaterThan(0);
        expect(entries[1].duration).to.be.at.least(opts.duration);
      });
    });

    describe('context', () => {
      beforeEach(() => {
        stubConfig.asyncFunction.ctx.required = true;
        stubConfig.asyncFunction.ctx.err = new Error('missing context');
      });

      it('should fail when context is required but not explicitly passed', async () => {
        const data = await throttledAsyncFunction().catch(err => err);
        expect(data).to.equal(stubConfig.asyncFunction.ctx.err);
      });

      it('should succeed when context is required and explicitly passed', async () => {
        ctx = { foo: 'bar' };
        throttledAsyncFunction = throttlify(asyncFunction, opts, ctx);
        const data = await throttledAsyncFunction();
        expect(data).to.equal(stubConfig.asyncFunction.data);
      });
    });
  });
});
