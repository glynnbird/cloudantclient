const http2 = require('node:http2')
const crypto = require('crypto')
const CookieJar = require('./cookie.js')
const constants = require('./constants.js')

/**
 * A general-purpose HTTP2 Client
 *
 * Communicates with a server using HTTP2. Will parse  set-cookie headers
 * from the server and pass back relevant cookies on future requests.
 * Will log requests if an environment variable DEBUG=http2 is set. 
 */
class Http2Client {
  /**
   * Http2Client constructor.
   * @param {string} url The server URL to connect to.
   */
  constructor (url) {
    this.jar = new CookieJar()
    this.url = url
    this.client = null
    this.uuid = crypto.randomUUID().substring(0, 8)
    this.requestId = 1
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
   * Disconnect the HTTP2 connection to Cloudant
   */
  disconnect () {
    this.client.close()
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
    if (process.env.DEBUG && process.env.DEBUG.includes('http2')) {
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
      console.log(`${requestId} ${startTime.toISOString()} ${opts[constants.HTTP2_METHOD]} ${opts[constants.HTTP2_PATH]}${auth}${length}`)
    }
  }

  /**
   * Handle response logging
   */
  logResponse (requestId, statusCode, length, startTime) {
    if (process.env.DEBUG && process.env.DEBUG.includes('http2')) {
      const now = new Date()
      const diff = now.getTime() - startTime.getTime()
      console.log(`${requestId} ${now.toISOString()} +${diff} ${statusCode} ${length}`)
    }
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
        opts[constants.HTTP2_METHOD] = opts.method.toUpperCase()
        delete opts.method
      }
      if (opts.path) {
        opts[constants.HTTP2_PATH] = opts.path
        delete opts.path
      }
      if (!opts[constants.HTTP2_METHOD]) {
        opts[constants.HTTP2_METHOD] = constants.HTTP_GET
      }
      if (!opts[constants.HTTP2_PATH]) {
        opts[constants.HTTP2_PATH] = constants.DEFAULT_PATH
      }
      if (!opts[constants.HTTP2_CONTENT_TYPE]) {
        opts[constants.HTTP2_CONTENT_TYPE] = constants.MIME_JSON
      }
      const cookieStr = this.jar.getCookieString(this.url + opts[constants.HTTP2_PATH])
      if (cookieStr) {
        opts.cookie = cookieStr
      }

      // query string
      if (opts.qs) {
        opts[constants.HTTP2_PATH] += `?${new URLSearchParams(opts.qs).toString()}`
        delete opts.qs
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
      req.setEncoding(constants.ENCODING_UTF8)
      let data = ''
      let headers = null

      // initial response with headers
      req.on('response', (h) => {
        headers = h
        if (headers[constants.HTTP2_SET_COOKIE] && headers[constants.HTTP2_SET_COOKIE].length > 0) {
          for (const cookieStr of headers[constants.HTTP2_SET_COOKIE]) {
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
        if (headers[constants.HTTP2_CONTENT_TYPE] === constants.MIME_JSON) {
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
}

module.exports = Http2Client
