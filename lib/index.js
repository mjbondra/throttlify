'use strict';

function throttlify (asyncFn, { concurrent, duration = 60000, max = 60 } = {}, ctx) {
  const count = { concurrent: 0, duration: 0 };
  const durationPause = () => new Promise(resolve => setTimeout(resolve, duration));
  const fn = ctx ? asyncFn.bind(ctx) : asyncFn;
  const queue = { concurrent: [], duration: [] };
  const queueShift = type => (queue[type].shift() || (() => null))();
  const queuePause = type => new Promise(resolve => queue[type].push(resolve));

  return (...params) => new Promise(async (resolve, reject) => {
    if (count.duration >= max) await queuePause('duration');
    count.duration++;

    if (concurrent && count.concurrent >= concurrent) await queuePause('concurrent');
    count.concurrent++;

    try {
      resolve(await fn(...params));
    } catch (err) {
      reject(err);
    }

    queueShift('concurrent');
    count.concurrent--;

    await durationPause();

    queueShift('duration');
    count.duration--;
  });
}

module.exports = throttlify;
