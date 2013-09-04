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
var comps = ['ioc', 'web', 'crypto', 'middleware'];

module.exports = crane = {
    //** provide some base dir context, and a helper
    path: null,
    root: function(path) {
        this.path = path;
        return this;
    }
}

//** register and initialize the components
comps.forEach(function(name) {
    var comp = (crane[name] = require('./'+ name));
    comp.initialize && comp.initialize(crane);
});
