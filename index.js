const http2 = require('node:http2')
const querystring = require('node:querystring')
const CookieJar = require('./cookie.js')

class CloudantClient {
  constructor (url, username, password) {
    this.url = url
    this.username = username
    this.password = password
    this.client = null
    this.ready = false
    this.jar = new CookieJar()
    this.connect()
  }

  connect () {
    this.client = http2.connect(this.url)
    this.client.on('error', this.errorHandler)
  }

  async auth () {
    await this.request({
      method: 'POST',
      path: '/_session',
      'content-type': 'application/x-www-form-urlencoded',
      body: `name=${this.username}&password=${this.password}`
    })
    this.ready = true
  }

  disconnect () {
    this.client.close()
  }

  errorHandler (err) {
    console.error(err)
  }

  async request (opts) {
    return new Promise((resolve, reject) => {
      if (!opts) {
        opts = {}
      }
      if (opts.method) {
        opts[':method'] = opts.method
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

      // make the request
      const req = this.client.request(opts)

      // optionally send request body
      if (opts.body && typeof opts.body === 'object') {
        opts.body = JSON.stringify(opts.body)
      }
      if (opts.body) {
        req.write(opts.body)
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
