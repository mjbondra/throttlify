'use strict';

const chai = require('chai');
const dirtyChai = require('dirty-chai');
const { performance, PerformanceObserver } = require('perf_hooks'); // eslint-disable-line
const { spy, stub } = require('sinon');
const sinonChai = require('sinon-chai');

const stubs = require('./stubs');
const Throttler = require('../../lib/throttler');

const { expect } = chai;

chai.use(dirtyChai);
chai.use(sinonChai);

describe('class: Throttler', () => {
  let allowance;
  let asyncFn;
  let ctx;
  let entries;
  let obs;
  let opts;
  let stubConfig;

  beforeEach(() => {
    allowance = 10; // 10 ms allowance
    ctx = null;
    entries = [];
    obs = new PerformanceObserver(list => {
      entries.push(...list.getEntries().filter(entry => !entries.includes(entry)));
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
    let args;
    let throttler;

    beforeEach(() => {
      args = [ asyncFn, opts, ctx ];
      throttler = new Throttler(...args);
    });

    describe('fn', () => {
      let delay;
      let fn;
      let pause;
      let shift;

      beforeEach(() => {
        args = [{ foo: 'bar' }];
        delay = throttler.duration / 2;
        fn = throttler.fn.bind(throttler);
        pause = stub(throttler, 'pause')
          .callsFake(() => new Promise(resolve => setTimeout(() => resolve(throttler), delay)));
        shift = stub(throttler, 'shift')
          .callsFake(() => new Promise(resolve => setTimeout(() => resolve(throttler), delay)));
      });

      afterEach(() => {
        pause.restore();
        shift.restore();
      });

      it('should call and await "asyncFn" with passed arguments', async () => {
        const data = await fn(...args);
        performance.mark('finish');
        performance.measure('fn-1-finish to finish', 'fn-1-finish', 'finish');
        expect(data).to.equal(stubConfig.asyncFunction.data);
        expect(asyncFn).to.have.been.calledWith(...args);
        expect(entries[0].duration).to.be.closeTo(0, allowance);
      });

      it('should allow "asyncFn" errors to be caught', async () => {
        stubConfig.asyncFunction.err = new Error('async function error');
        const err = await fn(...args).catch(e => e);
        expect(err).to.equal(stubConfig.asyncFunction.err);
        expect(asyncFn).to.have.been.calledWith(...args);
      });

      it('should call and await the "pause" instance method', async () => {
        performance.mark('start');
        await fn(...args);
        performance.measure('start to fn-1-start', 'start', 'fn-1-start');
        expect(pause).to.have.been.called();
        expect(entries[0].duration).to.be.closeTo(delay, allowance);
      });

      it('should call the "shift" instance method with an invoked "asyncFn"', async () => {
        await fn(...args);
        expect(shift).to.have.been.called();
        expect(shift.args[0][0]).to.be.a('promise');
      });
    });

    describe('pause', () => {
      let pause;
      let queuePause;

      beforeEach(() => {
        pause = throttler.pause.bind(throttler);
        queuePause = spy(Throttler, 'queuePause');
      });

      afterEach(() => {
        queuePause.restore();
      });

      describe('rate limit', () => {
        it('should not call "queuePause" when duration count is less than "max"', async () => {
          const count = throttler.count.duration = opts.max - 1;
          await pause();
          expect(queuePause).to.not.have.been.called();
          expect(throttler.count.duration).to.equal(count + 1);
        });

        it('should call and await "queuePause" with the duration queue when duration count is equal to "max"', async () => {
          const count = throttler.count.duration = opts.max;
          const delay = throttler.duration;
          setTimeout(() => throttler.queue.duration.shift()(), delay);
          await pause();
          expect(queuePause).to.have.been.calledWith(throttler.queue.duration);
          expect(throttler.count.duration).to.equal(count + 1);
        });

        it('should resolve immediately when duration count is less than "max"', async () => {
          const count = throttler.count.duration = opts.max - 1;
          performance.mark('start');
          await pause();
          performance.mark('end');
          performance.measure('resolve', 'start', 'end');
          expect(throttler.count.duration).to.equal(count + 1);
          expect(entries[0].duration).to.be.closeTo(0, allowance);
        });

        it('should defer resolution when duration count is equal to "max"', async () => {
          const delay = throttler.duration;
          throttler.count.duration = opts.max;
          setTimeout(() => throttler.queue.duration.shift()(), delay);
          performance.mark('start');
          await pause();
          performance.mark('end');
          performance.measure('resolve', 'start', 'end');
          expect(entries[0].duration).to.be.closeTo(delay, allowance);
        });
      });

      describe('concurrency', () => {
        it('should not call "queuePause" when "concurrent" is undefined', async () => {
          throttler.concurrent = opts.concurrent = undefined;
          const count = throttler.count.concurrent = opts.max / 2;
          await pause();
          expect(queuePause).to.not.have.been.called();
          expect(throttler.count.concurrent).to.equal(count + 1);
        });

        it('should not call "queuePause" when concurrent count is less than "concurrent"', async () => {
          throttler.concurrent = opts.concurrent = opts.max / 2;
          const count = throttler.count.concurrent = throttler.concurrent - 1;
          await pause();
          expect(queuePause).to.not.have.been.called();
          expect(throttler.count.concurrent).to.equal(count + 1);
        });

        it('should call and await "queuePause" with the concurrent queue when concurrent count is equal to "concurrent"', async () => {
          throttler.concurrent = opts.concurrent = opts.max / 2;
          const count = throttler.count.concurrent = throttler.concurrent;
          const delay = throttler.duration;
          setTimeout(() => throttler.queue.concurrent.shift()(), delay);
          await pause();
          expect(queuePause).to.have.been.calledWith(throttler.queue.concurrent);
          expect(throttler.count.concurrent).to.equal(count + 1);
        });

        it('should resolve immediately when "concurrent" is undefined', async () => {
          throttler.concurrent = opts.concurrent = undefined;
          const count = throttler.count.concurrent = opts.max / 2;
          performance.mark('start');
          await pause();
          performance.mark('end');
          performance.measure('resolve', 'start', 'end');
          expect(throttler.count.concurrent).to.equal(count + 1);
          expect(entries[0].duration).to.be.closeTo(0, allowance);
        });

        it('should resolve immediately when concurrent count is less than "concurrent"', async () => {
          throttler.concurrent = opts.concurrent = opts.max / 2;
          const count = throttler.count.concurrent = throttler.concurrent - 1;
          performance.mark('start');
          await pause();
          performance.mark('end');
          performance.measure('resolve', 'start', 'end');
          expect(throttler.count.concurrent).to.equal(count + 1);
          expect(entries[0].duration).to.be.closeTo(0, allowance);
        });

        it('should defer resolution of when concurrent count is equal to "concurrent"', async () => {
          throttler.concurrent = opts.concurrent = opts.max / 2;
          const count = throttler.count.concurrent = throttler.concurrent;
          const delay = throttler.duration;
          setTimeout(() => throttler.queue.concurrent.shift()(), delay);
          performance.mark('start');
          await pause();
          performance.mark('end');
          performance.measure('resolve', 'start', 'end');
          expect(throttler.count.concurrent).to.equal(count + 1);
          expect(entries[0].duration).to.be.closeTo(delay, allowance);
        });
      });

      describe('rate limit and concurrency', () => {
        it('should call and await "queuePause" with each queue when duration count is equal to "max" and concurrent count is equal to "concurrent"', async () => {
          const count = {
            concurrent: throttler.count.concurrent = throttler.concurrent = throttler.max / 2,
            duration: throttler.count.duration = throttler.max
          };
          const delay = throttler.duration + (throttler.duration / 2);
          setTimeout(() => throttler.queue.duration.shift()(), throttler.duration);
          setTimeout(() => throttler.queue.concurrent.shift()(), delay);
          await pause();
          expect(queuePause).to.have.been.calledWith(throttler.queue.concurrent);
          expect(queuePause).to.have.been.calledWith(throttler.queue.duration);
          expect(throttler.count.concurrent).to.equal(count.concurrent + 1);
          expect(throttler.count.duration).to.equal(count.duration + 1);
        });

        it('should defer resolution when duration count is equal to "max" and concurrent count is equal to "concurrent"', async () => {
          const count = {
            concurrent: throttler.count.concurrent = throttler.concurrent = throttler.max / 2,
            duration: throttler.count.duration = throttler.max
          };
          const delay = throttler.duration + (throttler.duration / 2);
          setTimeout(() => throttler.queue.duration.shift()(), throttler.duration);
          setTimeout(() => throttler.queue.concurrent.shift()(), delay);
          performance.mark('start');
          await pause();
          performance.mark('end');
          performance.measure('resolve', 'start', 'end');
          expect(throttler.count.concurrent).to.equal(count.concurrent + 1);
          expect(throttler.count.duration).to.equal(count.duration + 1);
          expect(entries[0].duration).to.be.closeTo(delay, allowance);
        });
      });
    });

    describe('shift', () => {
      let durationPause;
      let queueShift;
      let shift;

      beforeEach(() => {
        durationPause = spy(Throttler, 'durationPause');
        queueShift = spy(Throttler, 'queueShift');
        shift = throttler.shift.bind(throttler);
        throttler.count.concurrent = opts.concurrent = opts.max / 2;
        throttler.queue.concurrent = Array.from(new Array(10)).map(() => spy());
        throttler.count.duration = opts.max;
        throttler.queue.duration = Array.from(new Array(10)).map(() => spy());
      });

      afterEach(() => {
        durationPause.restore();
        queueShift.restore();
      });

      it('should call "queueShift" with the concurrent queue when the "pending" promise resolves', async () => {
        const count = throttler.count.concurrent;
        const [ queueFn ] = throttler.queue.concurrent;
        const pending = asyncFn();
        await shift(pending);
        const data = await pending;
        expect(data).to.equal(stubConfig.asyncFunction.data);
        expect(queueShift).to.have.been.calledWith(throttler.queue.concurrent);
        expect(queueFn).to.have.been.called();
        expect(throttler.count.concurrent).to.equal(count - 1);
      });

      it('should call "queueShift" with the concurrent queue when the "pending" promise throws an error', async () => {
        stubConfig.asyncFunction.err = new Error('async function error');
        const count = throttler.count.concurrent;
        const [ queueFn ] = throttler.queue.concurrent;
        const pending = asyncFn();
        await shift(pending);
        const err = await pending.catch(e => e);
        expect(err).to.equal(stubConfig.asyncFunction.err);
        expect(queueShift).to.have.been.calledWith(throttler.queue.concurrent);
        expect(queueFn).to.have.been.called();
        expect(throttler.count.concurrent).to.equal(count - 1);
      });

      it('should call "queueShift" with the duration queue when the "durationPause" and "pending" promises resolve', async () => {
        const count = throttler.count.duration;
        const [ queueFn ] = throttler.queue.duration;
        const pending = asyncFn();
        await shift(pending);
        const data = await pending;
        expect(data).to.equal(stubConfig.asyncFunction.data);
        expect(durationPause).to.have.been.calledWith(opts.duration);
        expect(queueShift).to.have.been.calledWith(throttler.queue.duration);
        expect(queueFn).to.have.been.called();
        expect(throttler.count.duration).to.equal(count - 1);
      });

      it('should call "queueShift" with the duration queue when the "durationPause" promise resolves and the "pending" promise throws an error', async () => {
        stubConfig.asyncFunction.err = new Error('async function error');
        const count = throttler.count.duration;
        const [ queueFn ] = throttler.queue.duration;
        const pending = asyncFn();
        await shift(pending);
        const err = await pending.catch(e => e);
        expect(err).to.equal(stubConfig.asyncFunction.err);
        expect(durationPause).to.have.been.calledWith(opts.duration);
        expect(queueShift).to.have.been.calledWith(throttler.queue.duration);
        expect(queueFn).to.have.been.called();
        expect(throttler.count.duration).to.equal(count - 1);
      });

      it('should have a resolution time that is equal to "duration" when it is greater than "pending" resolution time', async () => {
        expect(opts.duration).to.be.greaterThan(stubConfig.asyncFunction.delay);
        const pending = asyncFn();
        performance.mark('start');
        await shift(pending);
        performance.mark('end');
        performance.measure('resolve', 'start', 'end');
        expect(entries[0].duration).to.be.closeTo(opts.duration, allowance);
      });

      it('should have a resolution time that is equal to "pending" resolution time when it is greater than "duration"', async () => {
        stubConfig.asyncFunction.delay = opts.duration * 2;
        expect(opts.duration).to.be.lessThan(stubConfig.asyncFunction.delay);
        const pending = asyncFn();
        performance.mark('start');
        await shift(pending);
        performance.mark('end');
        performance.measure('resolve', 'start', 'end');
        expect(entries[0].duration).to.be.closeTo(stubConfig.asyncFunction.delay, allowance);
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
        expect(entries[0].duration).to.be.closeTo(opts.duration, allowance);
      });

      it('should return a promise that resolves immediately no argument is passed', async () => {
        performance.mark('start');
        await durationPause();
        performance.mark('finish');
        performance.measure('start to finish', 'start', 'finish');
        expect(entries[0].duration).to.be.closeTo(0, allowance); // reasonable approximation of "immediate"
      });

      it('should return a promise that resolves immediately when duration is not a number', async () => {
        performance.mark('start');
        await durationPause(NaN);
        performance.mark('finish');
        performance.measure('start to finish', 'start', 'finish');
        expect(entries[0].duration).to.be.closeTo(0, allowance); // reasonable approximation of "immediate"
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
