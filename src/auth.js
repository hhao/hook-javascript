var Events = require('./utils/events');
var localStorage = typeof chrome !== 'undefined' && typeof chrome.storage !== 'undefined'
    ? chrome.storage.local
    : (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
        ? window.localStorage
        : require('localstorage-memory'));

class Auth extends Events {
  /**
   * Deals with user registration/authentication
   * @module Hook
   * @class Hook.Auth
   * @extends Hook.Events
   * @param {Hook.Client} client
   * @constructor
   */
  constructor(client) {
    super();
    this.client = client;

    /**
     * @property currentUser
     * @type {Object}
     */
    this.currentUser = null;

    var now = new Date(),
        tokenExpiration = new Date(localStorage.getItem(this.client.app_id + '-' + Auth.AUTH_TOKEN_EXPIRATION)),
        currentUser = localStorage.getItem(this.client.app_id + '-' + Auth.AUTH_DATA_KEY);

    // Fill current user only when it isn't expired yet.
    if (currentUser && now.getTime() < tokenExpiration.getTime()) {
      this.currentUser = JSON.parse(currentUser); // localStorage only supports recording strings, so we need to parse it
    }
  }

  /**
   * @method setUserData
   * @param {Object} data
   * @return {Hook.Auth} this
   */
  setCurrentUser(data) {
    if (!data) {
      // trigger logout event
      this.trigger('logout', this.currentUser);
      this.currentUser = data;

      localStorage.removeItem(this.client.app_id + '-' + Auth.AUTH_TOKEN_KEY);
      localStorage.removeItem(this.client.app_id + '-' + Auth.AUTH_DATA_KEY);
    } else {
      localStorage.setItem(this.client.app_id + '-' + Auth.AUTH_DATA_KEY, JSON.stringify(data));

      // trigger login event
      this.currentUser = data;
      this.trigger('login', data);
    }

    return this;
  }

  /**
   * Register a user.
   * @param {Object} data
   * @method register
   *
   * @example Register with email address
   *
   *     client.auth.register({
   *       email: "endel@doubleleft.com",
   *       password: "12345",
   *       name: "Endel Dreyer"
   *     }).then(function(user) {
   *       console.log("Registered user: ", user);
   *     });
   *
   */
  register(data) {
    var promise, that = this;
    if (typeof(data)==="undefined") { data = {}; }
    promise = this.client.post('auth/email', data);
    promise.then(function(data) {
      that._registerToken(data);
    });
    return promise;
  }

  /**
   * Verify if user is already registered, and log-in if succeed.
   * @method login
   * @param {Object} data
   * @return {Promise}
   *
   * @example
   *
   *     client.auth.login({email: "edreyer@doubleleft.com", password: "123"}).then(function(data){
   *       console.log("User found: ", data);
   *     }, function(data){
   *       console.log("User not found or password invalid.", data);
   *     });
   */
  login(data) {
    var promise, that = this;
    if (typeof(data)==="undefined") { data = {}; }
    promise = this.client.post('auth/email/login', data);
    promise.then(function(data) {
      that._registerToken(data);
    });
    return promise;
  }

  /**
   * Update current user info.
   *
   * @method update
   * @param {Object} data
   * @return {Promise}
   *
   * @example
   *
   *     client.auth.update({ score: 100 }).then(function(data){
   *       console.log("updated successfully: ", data);
   *     }).otherwise(function(data){
   *       console.log("error: ", data);
   *     });
   */
  update(data) {
    if (!this.currentUser) {
      throw new Error("not logged in.");
    }

    var that = this;
    var promise = this.client.collection('auth').update(this.currentUser._id, data);

    // update localStorage info
    promise.then(function(data) { that.setCurrentUser(data); });

    return promise;
  }

  /**
   * Send a 'forgot password' confirmation email to target user email address.
   * @method forgotPassword
   * @param {Object} data
   * @return {Promise}
   *
   * @example
   *
   *     client.auth.forgotPassword({
   *       email: "edreyer@doubleleft.com",
   *       subject: "Project name: Forgot your password?",
   *       template: "Hi {{name}}, click here to reset your password http://custom-project.com/pass-recovery-path.html?token={{token}}"
   *     }).then(function(data){
   *       console.log("Email enviado!", data);
   *     }, function(data){
   *       console.log("User not found: ", data);
   *     });
   */
  forgotPassword(data) {
    if (typeof(data)==="undefined") { data = {}; }
    return this.client.post('auth/email/forgotPassword', data);
  }

  /**
   * Reset user password
   * @method resetPassword
   * @param {Object} data
   *   @param {Object} data.password
   *   @param {Object} data.token [optional]
   * @return {Promise}
   *
   * @example Getting token automatically from query string
   *
   *     client.auth.resetPassword("my-new-password-123").then(function(data){
   *       console.log("Password reseted! ", data);
   *     }, function(data){
   *       console.log("Error", data.error);
   *     });
   *
   * @example Providing a token manually
   *
   *     client.auth.resetPassword({token: "xxx", password: "my-new-password-123"}).then(function(data){
   *       console.log("Password reseted! ", data);
   *     }, function(data){
   *       console.log("Error", data.error);
   *     });
   *
   */
  resetPassword(data) {
    if (typeof(data.token)!=="string") { throw new Error("forgot password token required. Remember to use 'auth.forgotPassword' before 'auth.resetPassword'."); }
    if (typeof(data.password)!=="string") { throw new Error("new password required."); }
    return this.client.post('auth/email/resetPassword', data);
  }

  /**
   * @method logout
   * @return {Hook.Auth} this
   */
  logout() {
    return this.setCurrentUser(null);
  }

  /**
   * @method isLogged
   * @return {Boolean}
   */
  isLogged() {
    return this.currentUser !== null;
  }

  /**
   * @method getToken
   * @return {String|null}
   */
  getToken() {
    return localStorage.getItem(this.client.app_id + '-' + Auth.AUTH_TOKEN_KEY);
  }

  _registerToken(data) {
    if (data.token) {
      // register authentication token on localStorage
      localStorage.setItem(this.client.app_id + '-' + Auth.AUTH_TOKEN_KEY, data.token.token);
      localStorage.setItem(this.client.app_id + '-' + Auth.AUTH_TOKEN_EXPIRATION, data.token.expire_at);
      delete data.token;

      // Store curent user
      this.setCurrentUser(data);
    }
  }

}

// Constrants
Auth.AUTH_DATA_KEY = 'hook-auth-data';
Auth.AUTH_TOKEN_KEY = 'hook-auth-token';
Auth.AUTH_TOKEN_EXPIRATION = 'hook-auth-token-expiration';

// Export
module.exports = Auth;
