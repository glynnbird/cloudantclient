const http2 = require('node:http2')
const querystring = require('node:querystring')
const crypto = require('crypto')
const CookieJar = require('./cookie.js')
const IAM = require('./iam.js')

// mime types
const MIME_FORM_ENCODED = 'application/x-www-form-urlencoded'
const MIME_JSON = 'application/json'

// http methods
const HTTP_GET = 'GET'

// path
const DEFAULT_PATH = '/'

// http2
const HTTP2_PATH = ':path'
const HTTP2_METHOD = ':method'
const HTTP2_CONTENT_TYPE = 'content-type'
const HTTP2_SET_COOKIE = 'set-cookie'

/**
 * Cloudant HTTP2 Client
 *
 * Communicates with Cloudant using HTTP2. Can use username/password or IAM
 * authentication. Once authenticated, any HTTP2 request can be made on the
 * connection
 */
class CloudantClient {
  /**
   * CloudantClient constructor.
   * @param {string} url The Cloudant URL to connect to.
   */
  constructor (url) {
    this.url = url
    this.client = null
    this.ready = false
    this.jar = new CookieJar()
    this.accessToken = null
    this.accessTokenExpiration = 0
    this.refreshTimeout = null
    this.requestId = 1
    this.uuid = crypto.randomUUID().substring(0, 8)
    this.connect()
  }

  /**
   * Connect to Cloudant service using HTTP2. Called automatically by
   * the constructor.
   */
  connect () {
    this.client = http2.connect(this.url)
    this.client.on('error', this.errorHandler)
  }

  /**
   * Authenticate with Cloudant by passing a username and password and
   * getting a "Set-Cookie" header. The cookie can be returned to the server
   * to allow access from then on.
   * @param {string} name The Cloudant username or apikey.
   * @param {string} password The Cloudant password.
   */
  async auth (name, password) {
    await this.request({
      method: 'POST',
      path: '/_session',
      'content-type': MIME_FORM_ENCODED,
      body: querystring.stringify({ name, password })
    })
    this.ready = true
  }

  /**
   * Authenticate with IBM's IAM service by exchanging an apikey
   * for a bearer token
   * @param {string} apiKey The IBM IAM API key
   * @param {boolean} autoRefresh Whether to refresh the token prior to its expiration
   */
  async iam (apiKey, autoRefresh) {
    const iamClient = new IAM()
    const response = await iamClient.auth(apiKey)
    this.accessToken = response.access_token
    this.accessTokenExpiration = response.expiration
    if (autoRefresh) {
      const delay = response.expires_in * 1000 - 60000 // a minute before expiry
      this.refreshTimeout = setTimeout(() => {
        this.iam(apiKey, true)
      }, delay)
    }
  }

  /**
   * Disconnect the HTTP2 connection to Cloudant
   */
  disconnect () {
    this.client.close()
    if (this.refreshTimeout) {
      clearTimeout(this.refreshTimeout)
      this.refreshTimeout = null
    }
  }

  /**
   * Handle error responses from the client
   */
  errorHandler (err) {
    console.error(err)
  }

  /**
   * Handle request logging
   */
  logRequest (requestId, opts, body, startTime) {
    if (process.env.DEBUG && process.env.DEBUG.includes('cloudantclient')) {
      let auth = ''
      if (opts.cookie) {
        auth = ' COOKIE'
      } else if (opts.authorization) {
        auth = ' BEARER'
      }
      let length = ''
      if (body) {
        length = ` body=${body.length}`
      }
      console.log(`${requestId} ${startTime.toISOString()} ${opts[HTTP2_METHOD]} ${opts[HTTP2_PATH]}${auth}${length}`)
    }
  }

  /**
   * Handle response logging
   */
  logResponse (requestId, statusCode, length, startTime) {
    if (process.env.DEBUG && process.env.DEBUG.includes('cloudantclient')) {
      const now = new Date()
      const diff = now.getTime() - startTime.getTime()
      console.log(`${requestId} ${now.toISOString()} +${diff} ${statusCode} ${length}`)
    }
  }

  /**
   * Make multiple requests in parallel over the same established HTTP2 connection.
   * @param {Array} optsArr The array of request opts.
   * @return {Array} The returned data
   */
  async requests (optsArr) {
    const promises = optsArr.map((opts) => {
      return this.request(opts)
    })
    return Promise.allSettled(promises)
  }

  /**
   * Make requests over the established HTTP2 connection.
   * @param {object} opts The request options. method/path/body/qs
   * @return {object} The returned data
   */
  async request (opts) {
    return new Promise((resolve, reject) => {
      if (!opts) {
        opts = {}
      }
      if (opts.method) {
        opts[HTTP2_METHOD] = opts.method.toUpperCase()
        delete opts.method
      }
      if (opts.path) {
        opts[HTTP2_PATH] = opts.path
        delete opts.path
      }
      if (!opts[HTTP2_METHOD]) {
        opts[HTTP2_METHOD] = HTTP_GET
      }
      if (!opts[HTTP2_PATH]) {
        opts[HTTP2_PATH] = DEFAULT_PATH
      }
      if (!opts[HTTP2_CONTENT_TYPE]) {
        opts[HTTP2_CONTENT_TYPE] = MIME_JSON
      }
      const cookieStr = this.jar.getCookieString(this.url + opts[HTTP2_PATH])
      if (cookieStr) {
        opts.cookie = cookieStr
      }

      // query string
      if (opts.qs) {
        opts[HTTP2_PATH] += `?${querystring.stringify(opts.qs)}`
        delete opts.qs
      }

      // iam
      if (this.accessToken) {
        opts.authorization = `Bearer ${this.accessToken}`
      }

      // body
      let body = null
      if (opts.body) {
        if (typeof opts.body === 'object') {
          body = JSON.stringify(opts.body)
        } else {
          body = opts.body
        }
        delete opts.body
      }

      // request id - add header to allow tracking
      const requestId = this.requestId
      opts.requestid = `${this.uuid}${requestId}`
      const startTime = new Date()
      this.logRequest(opts.requestid, opts, body, startTime)
      this.requestId++

      // make the request
      const req = this.client.request(opts)

      // optionally send request body
      if (body) {
        req.write(body)
      }

      // indicated we're finished sending
      req.end()

      // handle the response
      req.setEncoding('utf8')
      let data = ''
      let headers = null

      // initial response with headers
      req.on('response', (h) => {
        headers = h
        if (headers[HTTP2_SET_COOKIE] && headers[HTTP2_SET_COOKIE].length > 0) {
          for (const cookieStr of headers[HTTP2_SET_COOKIE]) {
            this.jar.parse(cookieStr, this.url)
          }
        }
      })

      // chunks of data
      req.on('data', (chunk) => { data += chunk })

      // end of response
      req.on('end', () => {
        const statusCode = headers[':status']
        this.logResponse(opts.requestid, statusCode, data.length, startTime)
        if (headers[HTTP2_CONTENT_TYPE] === MIME_JSON) {
          data = JSON.parse(data)
        }
        const retval = {
          statusCode,
          headers,
          data
        }
        if (statusCode < 400) {
          resolve(retval)
        } else {
          reject(retval)
        }
      })

      // error handling
      req.on('error', (e) => {
        reject(e)
      })
    })
  }

  /**
   * Combine two URL paths together, avoiding //
   * @param {string} p1 The first part of the path e.g. '/mydb'
   * @param {string} p2 The second part of the path e.g. '/_all_dbs'
   * @return {object} The returned data e.g. /mydb/_all_dbs
   */
  combinePaths (p1, p2) {
    const startSlash = /^\//
    const endSlash = /\/$/
    if (!p1.match(startSlash)) {
      p1 = '/' + p1
    }
    p1 = p1.replace(endSlash, '')
    if (p2) {
      if (!p2.match(startSlash)) {
        p2 = '/' + p2
      }
    }
    return p1 + p2
  }

  /**
   * Database helper
   * @param {string} dbName The name of the database to deal with
   * @return {object} An object containing a request function
   */
  db (dbName) {
    const encodedDbName = encodeURIComponent(dbName)
    return {
      request: async (opts) => {
        const root = `/${encodedDbName}`
        if (opts.path) {
          opts.path = this.combinePaths(root, opts.path)
        } else {
          opts.path = root
        }
        return this.request(opts)
      },
      partition: (partitionName) => {
        const encodedPartitionName = encodeURIComponent(partitionName)
        return {
          request: async (opts) => {
            const root = `/${encodedDbName}/_partition/${encodedPartitionName}`
            if (opts.path) {
              opts.path = this.combinePaths(root, opts.path)
            } else {
              opts.path = `/${encodedDbName}/_partition/${encodedPartitionName}`
            }
            return this.request(opts)
          }
        }
      }
    }
  }
}

module.exports = CloudantClient
