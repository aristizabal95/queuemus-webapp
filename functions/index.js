const functions = require('firebase-functions');
const admin = require('firebase-admin');

const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const SpotifyWebApi = require('spotify-web-api-node');

// const express = require('express');
const engines = require('consolidate');

const firebaseApp = admin.initializeApp(
  functions.config().firebase
);

// Create Spotify API wrapper
const Spotify = new SpotifyWebApi({
  clientId: functions.config().spotify.client_id,
  clientSecret: functions.config().spotify.client_secret,
  redirectUri: `https://${process.env.GCLOUD_PROJECT}.firebaseapp.com/spotify-auth.html`,
});

// Declare the authorization scopes to use
const OAUTH_SCOPES = ['user-read-email', 'playlist-read-private'];

exports.createUser = functions.https.onRequest((req, res) => {
  const create = async function () {
    const name = req.query['name'] || "TestUser"
    const user = await createUser(name);

    res.jsonp(user);
  };
  create();
})

exports.spotifyauth = functions.https.onRequest((req, res) => {
  cookieParser()(req, res, () => {
    const state = req.cookies.state || crypto.randomBytes(20).toString('hex');
    console.log('Setting verification state:', state);
    res.cookie('state', state.toString(), {maxAge:3600000, secure: true, httpOnly: true});
    const authorizeURL = Spotify.createAuthorizeURL(OAUTH_SCOPES, state.toString());
    res.redirect(authorizeURL);
  });
});

exports.spotifytoken = functions.https.onRequest((req, res) => {
  try {
    cookieParser()(req, res, () => {
      console.log('Received verification state:', req.cookies.state);
      console.log('Received state:', req.query.state);
      if (!req.cookies.state) {
        throw new Error('State cookie not set or expired. Maybe you took too long to authorize. Please try again.');
      } else if (req.cookies.state !== req.query.state) {
        throw new Error('State validation failed');
      }
      console.log('Received auth code:', req.query.code);
      Spotify.authorizationCodeGrant(req.query.code, (error, data) => {
        if (error) {
          throw error;
        }
        console.log('Received Access Token:', data.body['access_token']);
        Spotify.setAccessToken(data.body['access_token']);

        Spotify.getMe(async (error, userResults) => {
          if (error) {
            throw error;
          }
          console.log('Auth code exchange result received:', userResults);
          // We have a Spotify access token and the user identity now.
          const accessToken = data.body['access_token'];
          const spotifyUserID = userResults.body['id'];
          const profilePic = userResults.body['images'][0]['url'];
          const userName = userResults.body['display_name'];
          const email = userResults.body['email'];

          // Create a Firebase account and get the Custom Auth Token.
          // const firebaseToken = await createFirebaseAccount(spotifyUserID, userName, profilePic, email, accessToken);
          // Serve an HTML page that signs the user in and updates the user profile.
          // res.jsonp({token: firebaseToken});
          res.jsonp({status: 200})
        });
      });
    });
  } catch (error) {
    return res.jsonp({error: error.toString});
  }
  return null;
});

async function createUser(name) {
  return admin.auth().createUser({
    displayName: name,
    timestamp: Date.now(),
  });
}
