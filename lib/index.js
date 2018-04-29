'use strict';

function throttlify (asyncFn, { duration = 15000, max = 10 } = {}, ctx) {
  const fn = ctx ? asyncFn.bind(ctx) : asyncFn;
  const queue = [];
  const queueResolve = () => new Promise(resolve => queue.push(resolve));
  let count = 0;

  return (...params) => new Promise(async (resolve, reject) => {
    if (count >= max) await queueResolve();
    count++;

    await fn(...params)
      .then(resolve)
      .catch(reject);

    setTimeout(() => {
      const next = queue.shift();
      if (next) next();
      count--;
    }, duration);
  });
}

module.exports = throttlify;
