const HttpClient = require('./httpclient.js')
const constants = require('./constants.js')

/**
 * IAM authentication handler
 *
 * Exchanges an IAM API key for a time-limited token that can be used as a
 * "bearer token" in future API calls
 */
class IAM extends HttpClient {
  /**
   * Authenticate with the IBM IAM service. See
   * https://cloud.ibm.com/apidocs/iam-identity-token-api#gettoken-apikey
   * @param {string} apiKey The IAM API to authenticate with
   * @return {object} The IAM object containing the access_token and expiration etc
   */
  async auth (apiKey) {
    const req = {
      url: 'https://iam.cloud.ibm.com/identity/token',
      method: constants.HTTP_POST,
      body: {
        grant_type: 'urn:ibm:params:oauth:grant-type:apikey',
        apikey: apiKey
      },
      headers: { }
    }
    req.headers[constants.HTTP2_CONTENT_TYPE] = constants.MIME_FORM_ENCODED
    req.headers[constants.HTTP2_ACCEPT] = constants.MIME_JSON
    return this.request(req)
  }
}

module.exports = IAM
