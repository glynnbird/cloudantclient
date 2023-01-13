# CloudantClient

A p.o.c minimal Cloudant HTTP2 client.

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

## Helpers

### Database helper

If you're doing a lot of work with known database, then the `db(dbName)` helper can save some typing:

```js
const db = client.db('mydb')
// the path becomes relative to `/mydb`
await db.request({ path: '/_all_dbs' })
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
1 2023-01-13T16:46:11.135Z POST /_session body=123
1 2023-01-13T16:46:11.587Z 200 77
2 2023-01-13T16:46:11.587Z POST /testdb COOKIE body=25
2 2023-01-13T16:46:11.727Z 201 95
3 2023-01-13T16:46:16.731Z POST /testdb COOKIE body=25
3 2023-01-13T16:46:16.875Z 201 95
4 2023-01-13T16:46:21.877Z POST /testdb COOKIE body=25
4 2023-01-13T16:46:22.010Z 201 95
```