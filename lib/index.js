'use strict';

function throttlify (asyncFn, { max = 10, ms = 15000 } = {}, ctx) {
  const queue = [];
  let count = 0;

  return async (...params) => {
    if (count >= max) await new Promise(resolve => queue.push(resolve));
    count++;
    setTimeout(() => {
      const next = queue.shift();
      if (next) next();
      count--;
    }, ms);

    return ctx ? asyncFn.bind(ctx)(...params) : asyncFn(...params);
  };
}

module.exports = throttlify;
