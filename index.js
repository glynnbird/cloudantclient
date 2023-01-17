const querystring = require('node:querystring')
const IAM = require('./iam.js')
const constants = require('./constants.js')
const Http2Client = require('./http2client.js')

/**
 * Cloudant HTTP2 Client
 *
 * Communicates with Cloudant using HTTP2. Can use username/password or IAM
 * authentication. Once authenticated, any HTTP2 request can be made on the
 * connection
 */
class CloudantClient extends Http2Client {
  /**
   * CloudantClient constructor.
   * @param {string} url The Cloudant URL to connect to.
   */
  constructor (url) {
    // call the Http2Client's constructor
    super(url)

    // additional attributes we need to keep track of IAM auth
    this.accessToken = null
    this.accessTokenExpiration = 0
    this.refreshTimeout = null
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
      'content-type': constants.MIME_FORM_ENCODED,
      body: querystring.stringify({ name, password })
    })
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
   * @param {object} opts The request options. method/path/body/qs + other headers
   * @return {object} The returned data
   */
  async request (opts) {
    // iam
    if (this.accessToken) {
      opts.authorization = `Bearer ${this.accessToken}`
    }
    return super.request(opts)
  }

  /**
   * Disconnect the HTTP2 connection to Cloudant
   */
  disconnect () {
    super.disconnect()
    if (this.refreshTimeout) {
      clearTimeout(this.refreshTimeout)
      this.refreshTimeout = null
    }
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
