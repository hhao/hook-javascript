/**
 * @module Hook
 */

var Hook = {
  VERSION: "0.3.0",

  Events: require('./utils/events'),
  Client: require('./client'),
  Plugins: require('./plugin_manager'),

  defaults: {
    perPage: 50
  }
};

//
// Legacy browser support
//
if(typeof(global.FormData)==="undefined"){
  // IE9<: prevent crash when FormData isn't defined.
  global.FormData = function(){ this.append=function(){}; };
}

Promise.prototype.otherwise = function(func) {
  return this['catch'](func);
}
Promise.prototype.done = function(func) {
  this.then(func);
  this['catch'](func);
  return this;
}

module.exports = Hook;
