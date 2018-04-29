# throttlify

[![pipeline status](https://gitlab.com/wondermonger/throttlify/badges/v1.0.2/pipeline.svg)](https://gitlab.com/wondermonger/throttlify/pipelines/21263093) [![coverage report](https://gitlab.com/wondermonger/throttlify/badges/v1.0.2/coverage.svg)](https://wondermonger.gitlab.io/-/throttlify/-/jobs/65592042/artifacts/coverage/index.html)

A function that returns a throttled variant of a Promise-returning function.

## Installation

```shell
yarn add throttlify
```

**OR**

```shell
npm i throttlify
```

## Usage

### Prerequisites

- [node@>=8.3.0](https://nodejs.org)

### API

#### `throttlify(asyncFn, [opts], [ctx])`

- **asyncFn** {*Function*} asynchronous function (*required*)
- [**opts**] {*Object*} throttle options
  - [**duration**=15000] {*Number*} throttle duration in milliseconds
  - [**max**=10] {*Number*} maximum number of requests per duration
- [**ctx**] {*Object*} `this` parameter for the **asyncFn** function
- **returns** {*Function*} throttled asynchronous function

### Code Example

```javascript
'use strict';

const throttlify = require('throttlify');
const fetch = require('node-fetch');

const throttledFetch = throttlify(fetch, { duration: 60000, max: 45 });
const url = 'https://jsonplaceholder.typicode.com/posts';

Array.from(new Array(45)).forEach((v, i) => throttledFetch(`url/${i}`));

// this call will execute 60 seconds after the completion of the first request
throttledFetch(url)
  .then(res => res.json())
  .then(body => handleResponse(body))
  .catch(err => handleError(err));

```

## Development

Merge requests should be submitted to [https://gitlab.com/wondermonger/throttlify](https://gitlab.com/wondermonger/throttlify).

### Installation

```shell
yarn
```

### Linting

```shell
yarn lint
```

### Testing

```shell
# all tests
yarn test

# integration tests
yarn test:integration

# unit tests
yarn test:unit

# coverage tests
yarn test:coverage

```

The integration tests create an ephemeral Node.js server that requires a connection to a [Redis](https://redis.io/) instance. The default configuration can be overridden by setting environment variables prior to executing `yarn test` or `yarn test:integration`.

```shell
# default values
NODE_HOST="localhost"
NODE_PORT="3000"
REDIS_DB="0"
REDIS_HOST="localhost"
REDIS_PASSWORD=""
REDIS_PORT="6379"

```

## License

The MIT License (MIT)

Copyright (c) 2018 Michael J. Bondra <mjbondra@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
