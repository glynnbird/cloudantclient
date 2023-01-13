const http2 = require('node:http2')
const querystring = require('node:querystring')
const CookieJar = require('./cookie.js')
const IAM = require('./iam.js')

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
   * getting a "Set-Cookie" header. The cookie can be return to the server
   * to allow access from then on.
   * @param {string} username The Cloudant username or apikey.
   * @param {string} password The Cloudant password.
   */
  async auth (username, password) {
    await this.request({
      method: 'POST',
      path: '/_session',
      'content-type': 'application/x-www-form-urlencoded',
      body: `name=${username}&password=${password}`
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
        opts[':method'] = opts.method.toUpperCase()
        delete opts.method
      }
      if (opts.path) {
        opts[':path'] = opts.path
        delete opts.path
      }
      if (!opts[':method']) {
        opts[':method'] = 'GET'
      }
      if (!opts[':path']) {
        opts[':path'] = '/'
      }
      if (!opts['content-type']) {
        opts['content-type'] = 'application/json'
      }
      const cookieStr = this.jar.getCookieString(this.url + opts[':path'])
      if (cookieStr) {
        opts.cookie = cookieStr
      }

      // query string
      if (opts.qs) {
        opts[':path'] += '?' + querystring.stringify(opts.qs)
        delete opts.qs
      }

      // iam
      if (this.accessToken) {
        opts.authorization = 'Bearer ' + this.accessToken
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
        if (headers['set-cookie'] && headers['set-cookie'].length > 0) {
          for (const cookieStr of headers['set-cookie']) {
            this.jar.parse(cookieStr, this.url)
          }
        }
      })

      // chunks of data
      req.on('data', (chunk) => { data += chunk })

      // end of response
      req.on('end', () => {
        if (headers['content-type'] === 'application/json') {
          data = JSON.parse(data)
        }
        resolve({
          statusCode: headers[':status'],
          headers,
          data
        })
      })

      // error handling
      req.on('error', (e) => {
        reject(e)
      })
    })
  }
}

module.exports = CloudantClient
