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

## Authentication

This library supports two types of authentication

- `await client.auth('username', 'password')` - creates a session with a client and uses cookies so that the session is refreshed assuming regular usage.
- `await client.iam('apikey', true)` - exchanges your IAM API key for a bearer token. If `true` is passed as the second parameter, the token is refreshed towards the end of tokens lifetime.