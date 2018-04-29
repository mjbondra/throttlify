'use strict';

function throttlify (asyncFn, { duration = 15000, max = 10 } = {}, ctx) {
  const durationPause = () => new Promise(resolve => setTimeout(resolve, duration));
  const fn = ctx ? asyncFn.bind(ctx) : asyncFn;
  const queue = [];
  const queuePause = () => new Promise(resolve => queue.push(resolve));
  let count = 0;

  return (...params) => new Promise(async (resolve, reject) => {
    if (count >= max) await queuePause();
    count++;

    await fn(...params)
      .then(resolve)
      .catch(reject);

    await durationPause();

    const next = queue.shift();
    if (next) next();
    count--;
  });
}

module.exports = throttlify;
