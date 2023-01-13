const { URL } = require('url')
const https = require('https')

/**
 * IAM authentication handler
 *
 * Exchanges an IAM API key for a time-limited token that can be used as a 
 * "bearer token" in future API calls
 */
class IAM {
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
   * @return {object | string} The parsed object or the original string.
   */
  async request (opts) {
    const self = this
    return new Promise((resolve, reject) => {
      // Build the post string from an object
      const postData = new URLSearchParams(opts.body).toString()
      const parsed = new URL(opts.url)

      // An object of options to indicate where to post to
      const req = {
        host: parsed.hostname,
        path: parsed.pathname,
        method: 'post',
        headers: {
          'content-Type': 'application/x-www-form-urlencoded',
          accept: 'application/json'
        }
      }

      // Set up the request
      let response = ''
      const request = https.request(req, function (res) {
        res.setEncoding('utf8')
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
      if (postData) {
        request.write(postData)
      }
      request.end()
    })
  }

  /**
   * Authenticate with the IBM IAM service. See
   * https://cloud.ibm.com/apidocs/iam-identity-token-api#gettoken-apikey
   * @param {string} apiKey The IAM API to authenticate with
   * @return {object} The IAM object containing the access_token and expiration etc
   */
  async auth (apiKey) {
    const req = {
      url: 'https://iam.cloud.ibm.com/identity/token',
      body: {
        grant_type: 'urn:ibm:params:oauth:grant-type:apikey',
        apikey: apiKey
      }
    }
    return await this.request(req)
  }
}

module.exports = IAM
