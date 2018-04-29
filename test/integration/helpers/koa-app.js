'use strict';

const Koa = require('koa');
const koaRatelimit = require('koa-ratelimit');

module.exports = ({ db, duration, errorMessage, max }) => {
  const app = new Koa();
  let count = 0;

  app.use(async (ctx, next) => {
    await next();
    if (ctx.body === errorMessage) ctx.body = { message: errorMessage };
  });
  app.use(koaRatelimit({ db, duration, errorMessage, max }));
  app.use(ctx => {
    count++;
    ctx.body = { count };
  });

  return app;
};
