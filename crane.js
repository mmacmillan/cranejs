/*
 | crane.js
 | ----
 | does the heavy-lifting for javascript applications
 |
 | Mike MacMillan
 | mikejmacmillan@gmail.com
*/
var util = require('util'),
    emitter = require('events').EventEmitter;

module.exports = crane = {
    //** provide some base dir context, and a helper
    path: null,
    root: function(path) {
        this.path = this.ioc.root = this.web.root = path;
        return this;
    }
}

//** register and initialize the components
var comps = ['ioc', 'web'];
comps.forEach(function(name) {
    (crane[name] = require('./'+ name)).initialize(crane);
});
