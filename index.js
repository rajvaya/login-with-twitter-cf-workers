/*! @umanghome/login-with-twitter-cf-workers. MIT License. Feross Aboukhadijeh <https://feross.org/opensource> and Umang Galaiya <https://umanggalaiya.in> */
const crypto = require('crypto');
const OAuth = require('oauth-1.0a');

const TW_REQ_TOKEN_URL = 'https://api.twitter.com/oauth/request_token';
const TW_AUTH_URL = 'https://api.twitter.com/oauth/authenticate';
const TW_ACCESS_TOKEN_URL = 'https://api.twitter.com/oauth/access_token';

class LoginWithTwitter {
  constructor(opts) {
    // Check that required options exist
    if (!opts.consumerKey || typeof opts.consumerKey !== 'string') {
      throw new Error('Invalid or missing `consumerKey` option');
    }
    if (!opts.consumerSecret || typeof opts.consumerSecret !== 'string') {
      throw new Error('Invalid or missing `consumerSecret` option');
    }
    if (!opts.callbackUrl || typeof opts.callbackUrl !== 'string') {
      throw new Error('Invalid or missing `callbackUrl` option');
    }

    this.consumerKey = opts.consumerKey;
    this.consumerSecret = opts.consumerSecret;
    this.callbackUrl = opts.callbackUrl;

    this._oauth = OAuth({
      consumer: {
        key: this.consumerKey,
        secret: this.consumerSecret,
      },
      signature_method: 'HMAC-SHA1',
      hash_function: (baseString, key) => {
        return crypto
          .createHmac('sha1', key)
          .update(baseString)
          .digest('base64');
      },
    });
  }

  login() {
    const requestData = {
      url: TW_REQ_TOKEN_URL,
      method: 'POST',
      data: {
        oauth_callback: this.callbackUrl,
      },
    };

    const requestOptions = {
      method: requestData.method,
      headers: {
        ...this._oauth.toHeader(this._oauth.authorize(requestData)),
        'Content-Type': 'application/json',
      },
    };

    // Get a "request token"
    return fetch(requestData.url, requestOptions)
      .then((res) => res.text())
      .then((res) => {
        const {
          oauth_token: token,
          oauth_token_secret: tokenSecret,
          oauth_callback_confirmed: callbackConfirmed,
        } = parseQueryString(res);

        // Must validate that this param exists, according to Twitter docs
        if (callbackConfirmed !== 'true') {
          return Promise.reject(
            new Error(
              'Missing `oauth_callback_confirmed` parameter in response (is the callback URL approved for this client application?)'
            )
          );
        }

        // Redirect visitor to this URL to authorize the app
        const url = `${TW_AUTH_URL}?${makeQueryString({
          oauth_token: token,
        })}`;

        return {
          tokenSecret,
          url,
        };
      });
  }

  callback(params, tokenSecret) {
    const { oauth_token: token, oauth_verifier: verifier } = params;

    if (typeof params.denied === 'string' && params.denied.length > 0) {
      return Promise.reject(new Error('User denied login permission'));
    }

    if (
      typeof params.oauth_token !== 'string' ||
      params.oauth_token.length === 0
    ) {
      return Promise.reject(
        new Error(
          'Invalid or missing `oauth_token` parameter for login callback'
        )
      );
    }
    if (
      typeof params.oauth_verifier !== 'string' ||
      params.oauth_verifier.length === 0
    ) {
      return Promise.reject(
        new Error(
          'Invalid or missing `oauth_verifier` parameter for login callback'
        )
      );
    }
    if (typeof tokenSecret !== 'string' || tokenSecret.length === 0) {
      return Promise.reject(
        new Error(
          'Invalid or missing `tokenSecret` argument for login callback'
        )
      );
    }

    const requestData = {
      url: TW_ACCESS_TOKEN_URL,
      method: 'POST',
      data: {
        oauth_token: token,
        oauth_token_secret: tokenSecret,
        oauth_verifier: verifier,
      },
    };

    // Get a user "access token" and "access token secret"
    return fetch(requestData.url, {
      method: requestData.method,
      body: makeQueryString(requestData.data),
      headers: this._oauth.toHeader(this._oauth.authorize(requestData)),
    })
      .then((res) => res.text())
      .then((res) => {
        // Ready to make signed requests on behalf of the user
        const {
          oauth_token: userToken,
          oauth_token_secret: userTokenSecret,
          screen_name: userName,
          user_id: userId,
        } = parseQueryString(res);

        return {
          userName,
          userId,
          userToken,
          userTokenSecret,
        };
      });
  }
}

module.exports = LoginWithTwitter;

function makeQueryString(object) {
  const url = new URLSearchParams();

  Object.keys(object).forEach((key) => {
    url.set(key, object[key]);
  });

  return url.toString();
}

function parseQueryString(string) {
  const url = new URLSearchParams(string);
  const object = {};

  for (var key of url.keys()) {
    object[key] = url.get(key);
  }

  return object;
}
