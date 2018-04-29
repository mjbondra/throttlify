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
    opts = { duration: 500, max: 5 };
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
    let obs;
    let run;
    let throttledAsyncFunction;

    beforeEach(() => {
      throttledAsyncFunction = throttlify(asyncFunction, opts);
      obs = new PerformanceObserver(list => {
        [ run = {} ] = list.getEntries();
        obs.disconnect();
      });
      obs.observe({ entryTypes: ['measure'] });
    });

    it('should execute the async function when the queue is smaller than the max', async () => {
      const data = await throttledAsyncFunction();
      expect(asyncFunction).to.have.been.called();
      expect(data).to.equal(stubConfig.asyncFunction.data);
    });

    it('should defer the execution of the async function when the queue is larger than the max', async () => {
      performance.mark('start');
      Array.from(new Array(opts.max)).forEach(() => throttledAsyncFunction());
      const data = await throttledAsyncFunction();
      performance.mark('finish');
      performance.measure('run', 'start', 'finish');
      expect(asyncFunction).to.have.been.called();
      expect(data).to.equal(stubConfig.asyncFunction.data);
      expect(run.duration).to.be.at.least(opts.duration);
    });

    it('should have catchable async function errors', async () => {
      stubConfig.asyncFunction.err = new Error('async function error');
      const data = await throttledAsyncFunction().catch(err => err);
      expect(asyncFunction).to.have.been.called();
      expect(data).to.equal(stubConfig.asyncFunction.err);
    });

    it('should catch async function errors on defered async function executions', async () => {
      performance.mark('start');
      Array.from(new Array(opts.max)).forEach(() => throttledAsyncFunction());
      stubConfig.asyncFunction.err = new Error('async function error');
      const data = await throttledAsyncFunction().catch(err => err);
      performance.mark('finish');
      performance.measure('run', 'start', 'finish');
      expect(asyncFunction).to.have.been.called();
      expect(data).to.equal(stubConfig.asyncFunction.err);
      expect(run.duration).to.be.at.least(opts.duration);
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
