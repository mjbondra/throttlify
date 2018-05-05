'use strict';

const chai = require('chai');
const dirtyChai = require('dirty-chai');
const { performance, PerformanceObserver } = require('perf_hooks'); // eslint-disable-line
const { spy } = require('sinon');
const sinonChai = require('sinon-chai');

const stubs = require('./stubs');
const Throttler = require('../../lib/throttler');

const { expect } = chai;

chai.use(dirtyChai);
chai.use(sinonChai);

describe('class: Throttler', () => {
  let asyncFn;
  let ctx;
  let entries;
  let obs;
  let opts;
  let stubConfig;

  beforeEach(() => {
    ctx = null;
    entries = [];
    obs = new PerformanceObserver(list => {
      entries.push(...list.getEntries());
      obs.disconnect();
    });
    obs.observe({ entryTypes: ['measure'] });
    opts = { duration: 500, max: 10 };
    stubConfig = {
      asyncFunction: {
        ctx: {
          err: null,
          required: false
        },
        data: 'foo',
        delay: 250,
        err: null
      }
    };
    asyncFn = stubs.asyncFunction(stubConfig.asyncFunction);
  });

  describe('constructor', () => {
    let args;
    let bind;
    let call;

    beforeEach(() => {
      args = [ asyncFn, opts, ctx ];
      bind = spy(asyncFn, 'bind');
      call = () => new Throttler(...args);
    });

    afterEach(() => {
      bind.restore();
    });

    it('should create a Throttler instance with default options when passed a function', () => {
      args = [ asyncFn ];
      const throttler = new Throttler(...args);
      expect(throttler.asyncFn).to.equal(asyncFn);
      expect(throttler.concurrent).to.not.exist();
      expect(throttler.duration).to.be.a('number');
      expect(throttler.max).to.be.a('number');
      expect(throttler.ctx).to.not.exist();
    });

    it('should create a configured Throttler instance when passed options', () => {
      opts.concurrent = 10;
      args = [ asyncFn, opts ];
      const throttler = new Throttler(...args);
      expect(throttler.asyncFn).to.equal(asyncFn);
      expect(throttler.concurrent).to.equal(opts.concurrent);
      expect(throttler.duration).to.equal(opts.duration);
      expect(throttler.max).to.equal(opts.max);
      expect(throttler.ctx).to.not.exist();
    });

    it('should bind passed context to the passed function', () => {
      ctx = { foo: 'bar' };
      args = [ asyncFn, opts, ctx ];
      const throttler = new Throttler(...args);
      expect(throttler.asyncFn).to.be.a('function');
      expect(throttler.ctx).to.equal(ctx);
      expect(bind).to.have.been.calledWith(ctx);
    });

    it('should throw an error when called without a function', () => {
      args = [ null, opts, ctx ];
      expect(call).to.throw();
    });

    it('should throw an error when first argument is not a function', () => {
      args = [ true, opts, ctx ];
      expect(call).to.throw();
      args = [ {}, opts, ctx ];
      expect(call).to.throw();
      args = [ '', opts, ctx ];
      expect(call).to.throw();
    });

    it('should throw an error when duration is not a number', () => {
      opts.duration = true;
      expect(call).to.throw();
      opts.duration = {};
      expect(call).to.throw();
      opts.duration = '';
      expect(call).to.throw();
    });

    it('should throw an error when duration is less than or equal to 0', () => {
      opts.duration = -1;
      expect(call).to.throw();
    });

    it('should throw an error when max is not a number', () => {
      opts.max = true;
      expect(call).to.throw();
      opts.max = {};
      expect(call).to.throw();
      opts.max = '';
      expect(call).to.throw();
    });

    it('should throw an error when max is less than or equal to 0', () => {
      opts.max = -1;
      expect(call).to.throw();
    });

    it('should throw an error when concurrent is not a number', () => {
      opts.concurrent = true;
      expect(call).to.throw();
      opts.concurrent = {};
      expect(call).to.throw();
      opts.concurrent = '';
      expect(call).to.throw();
    });

    it('should throw an error when concurrent is less than or equal to 0', () => {
      opts.concurrent = -1;
      expect(call).to.throw();
    });
  });

  describe('methods', () => {
    describe('fn', () => {
      let args;
      let fn;
      let throttler;

      beforeEach(() => {
        args = [ asyncFn, opts, ctx ];
        throttler = new Throttler(...args);
        fn = throttler.fn.bind(throttler);
      });

      describe('rate limit', () => {
        it('should execute "asyncFn" immediately when duration count is less than "max"', async () => {
          const n = opts.max - 1;
          Array.from(new Array(n - 1)).forEach(() => fn());
          performance.mark('call');
          const resultAsync = fn();
          expect(throttler.count.duration).to.be.lessThan(opts.max);
          expect(throttler.queue.duration.length).to.equal(0);
          const data = await resultAsync;
          performance.measure('execution-delay', 'call', `fn-${n}-start`);
          expect(asyncFn).to.have.been.called();
          expect(data).to.equal(stubConfig.asyncFunction.data);
          expect(entries[0].duration).to.be.lessThan(2); // reasonable approximation of "immediate"
        });

        it('should defer the execution of "asyncFn" when duration count is equal to "max"', async () => {
          const n = opts.max + 1;
          Array.from(new Array(n - 1)).forEach(() => fn());
          performance.mark('call');
          const resultAsync = fn();
          expect(throttler.count.duration).to.equal(opts.max);
          expect(throttler.queue.duration.length).to.equal(1);
          const data = await resultAsync;
          performance.measure('execution-delay', 'call', `fn-${n}-start`);
          expect(asyncFn).to.have.been.called();
          expect(data).to.equal(stubConfig.asyncFunction.data);
          expect(entries[0].duration).to.be.at.least(opts.duration);
        });

        it('should catch "asyncFn" errors immediately when duration count is less than "max"', async () => {
          const n = opts.max - 1;
          Array.from(new Array(n - 1)).forEach(() => fn());
          stubConfig.asyncFunction.err = new Error('async function error');
          performance.mark('call');
          const errAsync = fn().catch(err => err);
          expect(throttler.count.duration).to.be.lessThan(opts.max);
          expect(throttler.queue.duration.length).to.equal(0);
          const err = await errAsync;
          performance.measure('execution-delay', 'call', `fn-${n}-start`);
          expect(asyncFn).to.have.been.called();
          expect(err).to.equal(stubConfig.asyncFunction.err);
          expect(entries[0].duration).to.be.lessThan(2); // reasonable approximation of "immediate"
        });

        it('should catch deferred "asyncFn" execution errors when duration count is equal to "max"', async () => {
          const n = opts.max + 1;
          Array.from(new Array(n - 1)).forEach(() => fn());
          stubConfig.asyncFunction.err = new Error('async function error');
          performance.mark('call');
          const errAsync = fn().catch(err => err);
          expect(throttler.count.duration).to.equal(opts.max);
          expect(throttler.queue.duration.length).to.equal(1);
          const err = await errAsync;
          performance.measure('execution-delay', 'call', `fn-${n}-start`);
          expect(asyncFn).to.have.been.called();
          expect(err).to.equal(stubConfig.asyncFunction.err);
          expect(entries[0].duration).to.be.at.least(opts.duration);
        });
      });

      describe('concurrency', () => {
        describe('unlimited', () => {
          beforeEach(() => {
            opts.concurrent = undefined;
            throttler = new Throttler(...args);
            fn = throttler.fn.bind(throttler);
          });

          it('should execute "asyncFn" immediately when "concurrent" is undefined', async () => {
            const n = opts.max / 2;
            Array.from(new Array(n - 1)).forEach(() => fn());
            performance.mark('call');
            const resultAsync = fn();
            expect(throttler.count.concurrent).to.equal(n);
            expect(throttler.queue.concurrent.length).to.equal(0);
            const data = await resultAsync;
            performance.measure('execution-delay', 'call', `fn-${n}-start`);
            expect(asyncFn).to.have.been.called();
            expect(data).to.equal(stubConfig.asyncFunction.data);
            expect(entries[0].duration).to.be.lessThan(2); // reasonable approximation of "immediate"
          });

          it('should catch "asyncFn" errors immediately when "concurrent" is undefined', async () => {
            const n = opts.max / 2;
            Array.from(new Array(n - 1)).forEach(() => fn());
            stubConfig.asyncFunction.err = new Error('async function error');
            performance.mark('call');
            const errAsync = fn().catch(err => err);
            expect(throttler.count.concurrent).to.equal(n);
            expect(throttler.queue.concurrent.length).to.equal(0);
            const err = await errAsync;
            performance.measure('execution-delay', 'call', `fn-${n}-start`);
            expect(asyncFn).to.have.been.called();
            expect(err).to.equal(stubConfig.asyncFunction.err);
            expect(entries[0].duration).to.be.lessThan(2); // reasonable approximation of "immediate"
          });
        });

        describe('limited', () => {
          beforeEach(() => {
            opts.concurrent = opts.max / 2;
            throttler = new Throttler(...args);
            fn = throttler.fn.bind(throttler);
          });

          it('should defer the execution of "asyncFn" when concurrent count is equal to "concurrent"', async () => {
            const n = opts.concurrent + 1;
            Array.from(new Array(n - 1)).forEach(() => fn());
            performance.mark('call');
            const resultAsync = fn();
            expect(throttler.count.concurrent).to.equal(opts.concurrent);
            expect(throttler.queue.concurrent.length).to.equal(1);
            const data = await resultAsync;
            performance.measure('execution-delay', 'call', `fn-${n}-start`);
            expect(asyncFn).to.have.been.called();
            expect(data).to.equal(stubConfig.asyncFunction.data);
            expect(entries[0].duration).to.be.at.least(stubConfig.asyncFunction.delay);
          });

          it('should catch deferred "asyncFn" execution errors when concurrent count is equal to "concurrent"', async () => {
            const n = opts.concurrent + 1;
            Array.from(new Array(n - 1)).forEach(() => fn());
            stubConfig.asyncFunction.err = new Error('async function error');
            performance.mark('call');
            const errAsync = fn().catch(err => err);
            expect(throttler.count.concurrent).to.equal(opts.concurrent);
            expect(throttler.queue.concurrent.length).to.equal(1);
            const err = await errAsync;
            performance.measure('execution-delay', 'call', `fn-${n}-start`);
            expect(asyncFn).to.have.been.called();
            expect(err).to.equal(stubConfig.asyncFunction.err);
            expect(entries[0].duration).to.be.at.least(stubConfig.asyncFunction.delay);
          });
        });
      });

      describe('rate limit and concurrency', () => {
        beforeEach(() => {
          opts.concurrent = opts.max / 2;
          throttler = new Throttler(...args);
          fn = throttler.fn.bind(throttler);
        });

        it('should defer execution of "asyncFn" when duration count is equal to "max" and concurrent count is equal to "concurrent"', async () => {
          const durationAndConcurrencyDelay = opts.duration + stubConfig.asyncFunction.delay;
          const n = opts.max + 1;
          Array.from(new Array(n - 1)).forEach(() => fn());
          performance.mark('call');
          const resultAsync = fn();
          expect(throttler.count.concurrent).to.equal(opts.concurrent);
          expect(throttler.queue.concurrent.length).to.equal(n - opts.concurrent - 1);
          expect(throttler.count.duration).to.equal(opts.max);
          expect(throttler.queue.duration.length).to.equal(1);
          const data = await resultAsync;
          performance.measure('execution-delay', 'call', `fn-${n}-start`);
          // performance.measure('end-of-first to start-of-nonconcurrent', 'fn-1-finish', `fn-${opts.concurrent + 1}-start`);
          // performance.measure('end-of-first to start-of-last', 'fn-1-finish', `fn-${n}-start`);
          expect(asyncFn).to.have.been.called();
          expect(data).to.equal(stubConfig.asyncFunction.data);
          expect(entries[0].duration).to.be.at.least(durationAndConcurrencyDelay);
          // expect(entries[1].duration).to.be.lessThan(2); // reasonable approximation of "immediate"
          // expect(entries[2].duration).to.be.at.least(opts.duration);
        });

        it('should catch deferred "asyncFn" execution errors when duration count is equal to "max" and concurrent count is equal to "concurrent"', async () => {
          const durationAndConcurrencyDelay = opts.duration + stubConfig.asyncFunction.delay;
          const n = opts.max + 1;
          Array.from(new Array(n - 1)).forEach(() => fn().catch(err => err));
          stubConfig.asyncFunction.err = new Error('async function error');
          performance.mark('call');
          const errAsync = fn().catch(err => err);
          expect(throttler.count.concurrent).to.equal(opts.concurrent);
          expect(throttler.queue.concurrent.length).to.equal(n - opts.concurrent - 1);
          expect(throttler.count.duration).to.equal(opts.max);
          expect(throttler.queue.duration.length).to.equal(1);
          const err = await errAsync;
          performance.measure('execution-delay', 'call', `fn-${n}-start`);
          expect(asyncFn).to.have.been.called();
          expect(err).to.equal(stubConfig.asyncFunction.err);
          expect(entries[0].duration).to.be.at.least(durationAndConcurrencyDelay);
        });
      });

      describe('context', () => {
        beforeEach(() => {
          stubConfig.asyncFunction.ctx.required = true;
          stubConfig.asyncFunction.ctx.err = new Error('missing context');
        });

        it('should fail when context is used by "asyncFn" but was not passed to constructor', async () => {
          args = [ asyncFn, opts ];
          throttler = new Throttler(...args);
          fn = throttler.fn.bind(throttler);
          const err = await fn().catch(e => e);
          expect(err).to.equal(stubConfig.asyncFunction.ctx.err);
        });

        it('should succeed when context is used by "asyncFn" and was passed to constructor', async () => {
          ctx = { foo: 'bar' };
          args = [ asyncFn, opts, ctx ];
          throttler = new Throttler(...args);
          fn = throttler.fn.bind(throttler);
          const data = await fn();
          expect(data).to.equal(stubConfig.asyncFunction.data);
        });
      });
    });
  });

  describe('static methods', () => {
    describe('durationPause', () => {
      let durationPause;

      beforeEach(() => {
        durationPause = Throttler.durationPause;
      });

      it('should return a promise that resolves in the duration provided (in ms)', async () => {
        performance.mark('start');
        await durationPause(opts.duration);
        performance.mark('finish');
        performance.measure('start to finish', 'start', 'finish');
        expect(entries[0].duration).to.be.at.least(opts.duration);
      });

      it('should return a promise that resolves immediately no argument is passed', async () => {
        performance.mark('start');
        await durationPause();
        performance.mark('finish');
        performance.measure('start to finish', 'start', 'finish');
        expect(entries[0].duration).to.be.lessThan(2); // reasonable approximation of "immediate"
      });

      it('should return a promise that resolves immediately when duration is not a number', async () => {
        performance.mark('start');
        await durationPause(NaN);
        performance.mark('finish');
        performance.measure('start to finish', 'start', 'finish');
        expect(entries[0].duration).to.be.lessThan(2); // reasonable approximation of "immediate"
      });
    });

    describe('queuePause', () => {
      let queue;
      let queuePause;

      beforeEach(() => {
        queue = [];
        queuePause = Throttler.queuePause;
      });

      it('should return a promise and add its resolve function to the provided array', async () => {
        setTimeout(() => {
          const resolve = queue.pop();
          expect(resolve).to.be.a('function');
          resolve();
        }, opts.duration);
        const delay = queuePause(queue);
        expect(delay).to.be.a('promise');
        await delay;
      });

      it('should return a promise that resolves an error when called without an argument', async () => {
        const queuePauseError = await queuePause().catch(err => err);
        expect(queuePauseError).to.be.an('error');
      });

      it('should return a promise that resolves an error when called with something other than an array', async () => {
        const queuePauseError = await queuePause(NaN).catch(err => err);
        expect(queuePauseError).to.be.an('error');
      });
    });

    describe('queueShift', () => {
      let queue;
      let queueFn;
      let queuePromise;
      let queueShift;

      beforeEach(() => {
        queue = [];
        queuePromise = new Promise(resolve => {
          queueFn = spy(resolve);
          queue.push(queueFn);
        });
        queueShift = Throttler.queueShift;
      });

      it('should call the first function in the provided array and resolve the queue promise', async () => {
        queueShift(queue);
        await queuePromise;
        expect(queueFn).to.have.been.called();
      });

      it('should do nothing when called with an empty array', () => {
        queueShift([]);
        expect(queueFn).to.not.have.been.called();
      });

      it('should throw an error when called without an argument', () => {
        expect(queueShift).to.throw();
      });

      it('should throw an error when called with something other than an array', () => {
        expect(queueShift.bind(null, NaN)).to.throw();
      });
    });

    describe('throttlify', () => {
      let args;
      let bind;
      let throttlify;

      beforeEach(() => {
        ctx = { foo: 'bar' };
        args = [ asyncFn, opts, ctx ];
        bind = spy(Throttler.prototype.fn, 'bind');
        throttlify = Throttler.throttlify;
      });

      afterEach(() => {
        bind.restore();
      });

      it('should return an async function', () => {
        expect(throttlify(...args)).to.be.a('function');
        expect(bind).to.have.been.called();
        const [[ throttler ] = []] = bind.args;
        expect(throttler).to.be.an.instanceof(Throttler);
      });

      it('should bind a configured Throttler instance to the returned function', () => {
        throttlify(...args);
        expect(bind).to.have.been.called();
        const [[ throttler ] = []] = bind.args;
        expect(throttler).to.be.an.instanceof(Throttler);
        expect(throttler.asyncFn).to.be.a('function');
        expect(throttler.concurrent).to.equal(opts.concurrent);
        expect(throttler.duration).to.equal(opts.duration);
        expect(throttler.max).to.equal(opts.max);
        expect(throttler.ctx).to.equal(ctx);
      });
    });
  });
});
