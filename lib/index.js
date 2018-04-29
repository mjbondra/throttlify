'use strict';

function throttlify (asyncFn, { duration = 15000, max = 10 } = {}, ctx) {
  const queue = [];
  let count = 0;

  return async (...params) => {
    if (count >= max) await new Promise(resolve => queue.push(resolve));
    count++;

    const promise = ctx ? asyncFn.bind(ctx)(...params) : asyncFn(...params);
    const [ err, data ] = await promise.then(res => [ null, res ]).catch(res => [ res ]);

    setTimeout(() => {
      const next = queue.shift();
      if (next) next();
      count--;
    }, duration);

    if (err) throw err;
    return data;
  };
}

module.exports = throttlify;
