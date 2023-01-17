
const { URL } = require('url')
const https = require('https')
const querystring = require('node:querystring')

// constants
const constants = require('./constants.js')

class HttpClient {
  /**
   * JSON parser - parses a string as JSON or if it isn't JSON just returns the input.
   * @param {string} str The string to parse.
   * @return {object | string} The parsed object or the original string.
   */
  jsonParse (str) {
    try {
      return JSON.parse(str)
    } catch (e) {
      return str
    }
  }

  /**
   * Make an HTTP POST request to a supplied URL
   * @param {object} opts The request options
   * - url - the URL to make the request to.
   * - body - the object to send. This object is converted to URLSearchParams format.
   * - headers - HTTP headers to send with the request
   * @return {object | string} The parsed object or the original string.
   */
  async request (opts) {
    const self = this
    if (!opts.method) {
      opts.method = constants.HTTP_GET
    }
    if (!opts.headers) {
      opts.headers = {}
      opts.headers[constants.HTTP2_CONTENT_TYPE] = constants.MIME_JSON
      opts.headers.accept = constants.MIME_JSON
    }

    return new Promise((resolve, reject) => {
      // Build the post string from an object
      let body = ''
      if (opts.body && typeof opts.body === 'object') {
        if (opts.headers[constants.HTTP2_CONTENT_TYPE] === constants.MIME_JSON) {
          body = JSON.stringify(opts.body)
        } else if (opts.headers[constants.HTTP2_CONTENT_TYPE] === constants.MIME_FORM_ENCODED) {
          body = querystring.stringify(opts.body)
        }
      }
      const parsed = new URL(opts.url)

      // An object of options to indicate where to post to
      const req = {
        host: parsed.hostname,
        path: parsed.pathname,
        method: opts.method,
        headers: opts.headers
      }

      // Set up the request
      let response = ''
      const request = https.request(req, function (res) {
        res.setEncoding(constants.ENCODING_UTF8)
        res.on('data', function (chunk) {
          response += chunk
        })
        res.on('close', function () {
          if (res.statusCode >= 400) {
            return reject(self.jsonParse(response))
          }
          resolve(self.jsonParse(response))
        })
      })
      request.on('error', function (e) {
        reject(e)
      })

      // post the data
      if (body) {
        request.write(body)
      }
      request.end()
    })
  }
}

module.exports = HttpClient
