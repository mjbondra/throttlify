'use strict';

class Throttler {
  constructor (asyncFn, { concurrent, duration = 60000, max = 60 } = {}, ctx) {
    if (!asyncFn) throw new Error('missing function argument');
    if (typeof asyncFn !== 'function') throw new Error('first argument must be a function');
    if (typeof duration !== 'number') throw new Error('"duration" must be a number');
    if (duration <= 0) throw new Error('"duration" must be greater than 0');
    if (typeof max !== 'number') throw new Error('"max" must be a number');
    if (max <= 0) throw new Error('"max" must be greater than 0');
    if (typeof concurrent !== 'undefined') {
      if (typeof concurrent !== 'number') throw new Error('"concurrent" must be a number');
      if (concurrent <= 0) throw new Error('"concurrent" must be greater than 0');
    }

    Object.assign(this, {
      asyncFn: ctx ? asyncFn.bind(ctx) : asyncFn,
      concurrent,
      count: { concurrent: 0, duration: 0 },
      ctx,
      duration,
      max,
      queue: { concurrent: [], duration: [] }
    });
  }

  fn (...args) {
    const { asyncFn, concurrent, count, duration, max, queue } = this;
    const { durationPause, queuePause, queueShift } = Throttler;

    return new Promise(async (resolve, reject) => {
      if (count.duration >= max) await queuePause(queue.duration);
      count.duration++;

      if (concurrent && count.concurrent >= concurrent) await queuePause(queue.concurrent);
      count.concurrent++;

      try {
        resolve(await asyncFn(...args));
      } catch (err) {
        reject(err);
      }

      queueShift(queue.concurrent);
      count.concurrent--;

      await durationPause(duration);

      queueShift(queue.duration);
      count.duration--;
    });
  }

  static durationPause (duration) {
    return new Promise(resolve => setTimeout(resolve, duration));
  }

  static queuePause (queue) {
    return new Promise(resolve => queue.push(resolve));
  }

  static queueShift (queue) {
    const next = queue.shift() || (() => null);
    return next();
  }

  static throttlify (asyncFn, opts, ctx) {
    const throttler = new Throttler(asyncFn, opts, ctx);
    return throttler.fn.bind(throttler);
  }
}

module.exports = Throttler;
