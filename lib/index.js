'use strict';

function throttlify (asyncFn, { duration = 15000, max = 10 } = {}, ctx) {
  const queue = [];
  let count = 0;

  return async (...params) => {
    if (count >= max) await new Promise(resolve => queue.push(resolve));
    count++;
    setTimeout(() => {
      const next = queue.shift();
      if (next) next();
      count--;
    }, duration);

    return ctx ? asyncFn.bind(ctx)(...params) : asyncFn(...params);
  };
}

module.exports = throttlify;
