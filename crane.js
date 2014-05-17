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

//** the supported components; move these to a folder and register by convention vs explicitly
var components = ['ioc', 'web', 'mvc', 'crypto', 'middleware'];

module.exports = crane = {
    //** provide some base dir context, and a helper
    path: null,
    root: function(path) {
        this.path = path;
        return this;
    }
}

//** load the crane components
components.forEach(function(name) { crane[name] = require('./'+ name) })
