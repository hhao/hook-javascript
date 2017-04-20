var Auth = require('./auth');
var Collection = require('./collection');
var Channel = require('./channel');
var KeyValues = require('./key_values');
var System = require('./system');
var PluginManager = require('./plugin_manager');
require('./vendor/json.date-extensions');

module.exports = class Client {

  /**
   * Hook.Client is the entry-point for using hook.
   *
   * You should instantiate a global javascript client for consuming hook.
   *
   * ```javascript
   * var client = new Hook.Client({
   *   url: "http://local-or-remote-hook-address.com/public/index.php/",
   *   app_id: 1,   // your app's id
   *   key: 'test'  // your app's public key
   * });
   * ```
   *
   * @module Hook
   * @class Hook.Client
   *
   * @param {Object} options
   *   @param {String} options.app_id
   *   @param {String} options.key
   *   @param {String} options.endpoint default: http://hook.dev
   *
   * @constructor
   */

  constructor(options) {
    if (!options) { options = {}; }
    this.endpoint = options.endpoint || options.url;
    this.app_id = options.app_id || options.appId || "";
    this.key = options.key || "";

    this.options = (typeof(options.options) !== "undefined") ? options.options : {};

    // append last slash if doesn't have it
    if (this.endpoint.lastIndexOf('/') != this.endpoint.length - 1) {
      this.endpoint += "/";
    }

    /**
     * @property {Hook.KeyValues} keys
     */
    this.keys = new KeyValues(this);

    /**
     * @property {Hook.Auth} auth
     */
    this.auth = new Auth(this);

    /**
     * @property {Hook.System} system
     */
    this.system = new System(this);

    // Setup plugins
    PluginManager.setup(this);
  }

  /**
   * Get collection instance.
   * @method collection
   * @param {String} collectionName
   * @return {Hook.Collection}
   *
   * @example Retrieve a collection reference. Your collection tables are created on demand.
   *
   *     // Users collection
   *     var users = client.collection('users');
   *
   *     // Highscores
   *     var highscores = client.collection('highscores');
   *
   */
  collection(collectionName) {
    return new Collection(this, collectionName);
  }

  /**
   * Get channel instance.
   * @method channel
   * @param {String} name
   * @param {Object} options (optional)
   * @return {Hook.Channel}
   *
   * @example Create a channel using Servet-Sent Events transport.
   *
   *     var channel = client.channel('messages');
   *
   * @example Create a channel using WebSockets transport.
   *
   *     var channel = client.channel('messages', { transport: "websockets" });
   *
   */
  channel(name, options) {
    if (typeof(options)==="undefined") { options = {}; }

    var collection = this.collection(name);
    collection.segments = collection.segments.replace('collection/', 'channels/');

    // Use 'SSE' as default transport layer
    if (!options.transport) { options.transport = 'sse'; }
    options.transport = options.transport.toUpperCase();

    return new Channel(this, collection, options);
  }

  /**
   * Get remote URL string.
   * @method url
   * @param {String} route
   * @return {String}
   *
   * @example Downloading data from a hook route
   *
   *     location.href = client.url('download', { something: "hey" })
   *
   * @example Using custom hook route for image catpcha
   *
   *     // Implementing custom route for captcha: https://github.com/doubleleft/hook/wiki/Composer-dependencies
   *     var img = new Image();
   *     img.src = client.url('captcha');
   *
   */
  url(route, params) {
    var serializedParams = "";
    if (params) {
      serializedParams = "&" + this.serialize(params);
    }
    return this.endpoint + route + this.getCredentialsParams() + serializedParams;
  }

  /**
   * Create resource
   * @method post
   * @param {String} segments
   * @param {Object} data
   */
  post(segments, data) {
    if (typeof(data)==="undefined") {
      data = {};
    }
    return this.request(segments, "POST", data);
  }

  /**
   * Retrieve a resource
   * @method get
   * @param {String} segments
   * @param {Object} data
   */
  get(segments, data) {
    return this.request(segments, "GET", data);
  }

  /**
   * Update existing resource
   * @method put
   * @param {String} segments
   * @param {Object} data
   */
  put(segments, data) {
    return this.request(segments, "PUT", data);
  }

  /**
   * Delete existing resource.
   * @method delete
   * @param {String} segments
   */
  remove(segments, data) {
    return this.request(segments, "DELETE", data);
  }

  /**
   * @method request
   * @param {String} segments
   * @param {String} method
   * @param {Object} data
   */
  request(segments, method, data) {
    // Compute request headers
    var request_headers = this.getHeaders();
    request_headers["Content-Type"] = 'text/json';

    // Use method override? (some web servers doesn't respond to DELETE/PUT requests)
    if (method !== "GET" && method !== "POST" && this.options.method_override) {
      request_headers['X-HTTP-Method-Override'] = method;
      method = "POST";
    }

    var url = this.endpoint + segments;
    var initObj = {
        method: method,
        headers: request_headers
    };
    if (method === "GET") {
        url = url + '?' + this.getPayload(method, data);
    } else {
        initObj['body'] = this.getPayload(method, data);
    }
    var promise = fetch(url, initObj).then(function(res) { 
          // total = responseHeaders.match(/x-total-count: ([^\n]+)/i);
          // if (total) { data.total = parseInt(total[1]); }
          return res.json();
      });

    return promise;
  }

  /**
   * Get XHR headers for app/auth context.
   * @method getHeaders
   * @return {Object}
   */
  getHeaders() {
    // App authentication request headers
    var request_headers = {
      'X-App-Id': this.app_id,
      'X-App-Key': this.key
    }, auth_token;

    // Forward user authentication token, if it is set
    var auth_token = this.auth.getToken();
    if (auth_token) {
      request_headers['X-Auth-Token'] = auth_token;
    }
    return request_headers;
  }

  /**
   * Get payload of given data
   * @method getPayload
   * @param {String} requestMethod
   * @param {Object} data
   * @return {String|FormData}
   */
  getPayload(method, data) {
    var payload = null;
    if (data) {

      if (data instanceof FormData){
        payload = data;
      } else if (method !== "GET") {
        var field, value, filename,
            formdata = new FormData(),
            worth = false;

        for (field in data) {
          value = data[field];
          filename = null;

          if (typeof(value)==='undefined' || value === null) {
            continue;

          } else if (typeof(value)==='boolean' || typeof(value)==='number' || typeof(value)==="string") {
            value = value.toString();

          // IE8 can't compare instanceof String with HTMLInputElement.
          } else if (value instanceof HTMLInputElement && value.files && value.files.length > 0) {
            filename = value.files[0].name;
            value = value.files[0];
            worth = true;

          } else if (value instanceof HTMLInputElement) {
            value = value.value;

          } else if (value instanceof HTMLCanvasElement) {
            if (typeof(dataURLtoBlob)==="undefined") {
              throw new Error("Please add this dependency in your project: https://github.com/blueimp/JavaScript-Canvas-to-Blob");
            }
            value = dataURLtoBlob(value.toDataURL());
            worth = true;
            filename = 'canvas.png';

          } else if (typeof(Blob) !== "undefined" && value instanceof Blob) {
            worth = true;
            filename = 'blob.' + value.type.match(/\/(.*)/)[1]; // get extension from blob mime/type
          }

          //
          // Consider serialization to keep data types here: http://phpjs.org/functions/serialize/
          //
          if (!(value instanceof Array)) { // fixme
            if (typeof(value)==="string") {
              formdata.append(field, value);
            } else {
              try {
                formdata.append(field, value, filename || "file");
              } catch (e) {
                // TODO:
                // Node.js (CLI console) throws exception here
              }
            }
          }
        }

        if (worth) {
          payload = formdata;
        }
      }

      payload = payload || JSON.stringify(data, function(key, value) {
        if (this[key] instanceof Date) {
          return Math.round(this[key].getTime() / 1000);
        } else {
          return value;
        }
      });

      // empty payload, return null.
      if (payload == "{}") { return null; }

      if (method==="GET" && typeof(payload)==="string") {
        payload = encodeURIComponent(payload);
      }
    }
    return payload;
  }

  getCredentialsParams() {
    var params = "?X-App-Id=" + this.app_id + "&X-App-Key=" + this.key;
    var auth_token = this.auth.getToken();
    if (auth_token) { params += '&X-Auth-Token=' + auth_token; }
    return params;
  }

  serialize(obj, prefix) {
    var str = [];
    for (var p in obj) {
      if (obj.hasOwnProperty(p)) {
        var k = prefix ? prefix + "[" + p + "]" : p,
        v = obj[p];
        str.push(typeof v == "object" ? this.serialize(v, k) : encodeURIComponent(k) + "=" + encodeURIComponent(v));
      }
    }
    return str.join("&");
  }

}
