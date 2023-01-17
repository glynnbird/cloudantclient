# CloudantClient

A p.o.c minimal Cloudant HTTP2 client.

- No dependencies.
- HTTP2 transport.
- Promise API.
- Optional logging.
- IAM auth.
- or user/pass auth.

## Usage

```js
const client = new CloudantClient(URL)
await client.auth(USERNAME, PASSWORD)

// get a list of databases
let response = await client.request({
  method: 'GET',
  path: '/_all_dbs'
})
console.log(response)

// post a new document to a database
response = await client.request({
  method: 'POST',
  path: '/testdb',
  body: { a: 1, b:2, c: 'three'}
})
console.log(response)

// fetch all documents, with querystring
response = await client.request({
  method: 'GET',
  path: '/testdb/_all_docs',
  qs: { include_docs: true, limit:5 }
})
console.log(JSON.stringify(response))

// disconnect
client.disconnect()
```

## Multiple requests

One of the advantages of HTTP2 is to allow multiple requests to share the same connection. This is achieved by firing off multiple calls to `client.request` as you need, or you can use the `client.requests` function:

```js
const arrOpts = [
  {
    method: 'GET',
    path: '/_all_dbs',
    qs: {
      limit: 5
    }
  },
  {
    method: 'POST',
    path: '/indvaliddb',
    body: { a: 1, b:2, c: 'three'}
  },
  {
    method: 'POST',
    path: '/testdb',
    body: { a: 1, b:2, c: 'three'}
  },
  {
    method: 'GET',
    path: '/testdb/_all_docs',
    qs: { include_docs: true, limit:5 }
  }
]

const r = await client.requests(arrOpts)
console.log(r)
```

The return value from client.requests is the same as from [Promise.allSettled](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/allSettled):

```js
[
  {
    status: 'fulfilled',
    value: {
      statusCode: 200,
      headers: [Object: null prototype],
      data: [Array]
    }
  },
  {
    status: 'rejected',
    reason: {
      statusCode: 404,
      headers: [Object: null prototype],
      data: [Object]
    }
  },
  {
    status: 'fulfilled',
    value: {
      statusCode: 201,
      headers: [Object: null prototype],
      data: [Object]
    }
  },
  {
    status: 'fulfilled',
    value: {
      statusCode: 200,
      headers: [Object: null prototype],
      data: [Object]
    }
  }
]
```

## Helpers

### Database helper

If you're doing a lot of work with known database, then the `db(dbName)` helper can save some typing:

```js
const db = client.db('mydb')
// the path becomes relative to `/mydb`
// get all documents
await db.request({ path: '/_all_dbs' })
// get all documents with options
await db.request({ path: '/_all_dbs', qs: { limit: 5, include_docs: true } })
// insert new doc (auto-generated id)
await db.request({ path: '/', body: { a: 1, b: 'two', c: true}}})
// delete a document
await db.request({ method: 'delete', path: '/mydocid?rev=2-5216' })
```

### Partition helper

The Database Helper has a built-in partition helper for _Partitioned Databases_:

```js
const p = client.db('mydb').partition('5916')
// the path becomes relative to `/mydb/_partition/5916`
await p.request({ path: '/_all_dbs' })
```

## Authentication

This library supports two types of authentication

- `await client.auth('username', 'password')` - creates a session with a client and uses cookies so that the session is refreshed assuming regular usage.
- `await client.iam('apikey', true)` - exchanges your IAM API key for a bearer token. If `true` is passed as the second parameter, the token is refreshed towards the end of tokens lifetime.

## Logging

If a `DEBUG` environment variable contains the string `cloudantclient` then logs will appear on `stdout`:

```
33a392f21 2023-01-16T13:43:39.555Z GET /_all_dbs?limit=5 BEARER
33a392f21 2023-01-16T13:43:40.324Z +769 200 47
33a392f22 2023-01-16T13:43:40.578Z GET /_all_dbs?limit=5 BEARER
33a392f22 2023-01-16T13:43:40.715Z +137 200 47
33a392f23 2023-01-16T13:43:40.968Z GET /_all_dbs?limit=5 BEARER
33a392f23 2023-01-16T13:43:41.105Z +137 200 47
33a392f24 2023-01-16T13:43:41.356Z GET /_all_dbs?limit=5 BEARER
33a392f24 2023-01-16T13:43:41.497Z +141 200 47
```