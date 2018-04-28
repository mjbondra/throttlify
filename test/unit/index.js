'use strict';

const chai = require('chai');
const dirtyChai = require('dirty-chai');
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
    opts = { max: 5, ms: 500 };
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
    let throttledAsyncFunction;

    beforeEach(() => {
      throttledAsyncFunction = throttlify(asyncFunction, opts);
    });

    it('should execute the async function when the queue is smaller than the max', async () => {
      const data = await throttledAsyncFunction();
      expect(data).to.equal(stubConfig.asyncFunction.data);
    });

    it('should defer the execution of the async function when the queue is larger than the max', async () => {
      const start = Date.now();
      Array.from(new Array(opts.max)).forEach(() => throttledAsyncFunction());
      const data = await throttledAsyncFunction();
      const duration = Date.now() - start;
      expect(data).to.equal(stubConfig.asyncFunction.data);
      expect(duration).to.be.at.least(opts.ms);
    });

    it('should have catchable async function errors', async () => {
      stubConfig.asyncFunction.err = new Error('async function error');
      const data = await throttledAsyncFunction().catch(err => err);
      expect(data).to.equal(stubConfig.asyncFunction.err);
    });

    it('should catch async function errors on defered async function executions', async () => {
      Array.from(new Array(opts.max)).forEach(() => throttledAsyncFunction());
      stubConfig.asyncFunction.err = new Error('async function error');
      const data = await throttledAsyncFunction().catch(err => err);
      expect(data).to.equal(stubConfig.asyncFunction.err);
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
