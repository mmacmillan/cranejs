/*
 | mvc.js
 | ----
 | the mvc component of the crane module
 |
 | Mike MacMillan
 | mikejmacmillan@gmail.com
*/
var util = require('util'),
    _ = require('lodash'),
    fs = require('fs'),
    path = require('path'),
    q = require('q'),
    crane = null;

var _controllers = {},
    _app = null,
    _ioc = null,
    _opt = null,
    _init = null,
    _errorHandler = null;


//** Component Interface
//** ----

module.exports = mvc = {
    __init: function(crane) { crane = crane; },

    initialize: function(app, opt) {
        if(_init) return;

        //** some defaults
        _.defaults((_opt = opt||{}), {
            indexView: 'index',
            defaultController: 'index',
            routePrefix: '/',
            controllers: '/controllers/',
            views: '/views/'
        });

        //** set the global reference to the express app (express only for now)
        _app = app;
        _errorHandler = opt.errorHandler;

        _init = true;
    },

    //** sets the ioc container we use for resolving objects
    container: function(cont) { cont && _ioc = cont; },

    controller: function(name, deps, impl) {
        if(!name || !impl) return; //** validate/normalize
        !Array.IsArray((deps = deps||[])) && deps = [deps];

        //** if we've seen this controller before, return it, otherwise, store it
        if(_controllers[name]) return _controllers[name];
        _controllers[name] = impl;

        //** make sure the controller knows about its dependencies by name
        deps.length > 0 && !impl.dependencies && (impl.dependencies = deps);

        if(!_init) return;
        
        NEED TO "PARSE" CONTROLLER HERE, SAME WAY WE WOULD WHEN INITIALIZE IS CALLED, THIS ALLOWS
        CONTROLLERS TO BE ADDED BEFORE AND AFTER INIT

    },

    models: function(list) {
        return mvc;
    }
}



//** Helper Methods
//** ----

function route(handler, req, res, next) { //** simple route handler
    function error(err) { _errorHandler && _errorHandler.call(this, err, req ,res) }
    var p = q.defer();

    //** call the handler for this route
    util.log('[http] route: '+ req.url);
    handler.call(this, p, req, res);

    //** handle the callback
    p.promise
        .then(function(result) {
            result = result || {};

            //** 1) if the result object is a string, assume its markup and send text/html to the client
            if(typeof(result) == 'string') {
                res.writeHead(200, {'content-type': 'text/html'});
                res.end(result.toString());

            //** 2) if the result object is an object, assume its an object literaly that needs to be serialized to json
            } else {
                res.writeHead(200, { 'content-type': 'application/javascript' });
                res.end(JSON.stringify(result));
            }
        })

        //** handle errors using the global error handler
        .catch(error);
}

function parseController(c) {
    //** wire up the "index" method for the controller, if an "index" method is implemented
    c[_opt.indexView] && _app.all(_opt.routePrefix + c.name +'(/)?', _errorHandler, route.bind(c, c[_opt.indexView]));

    //** wire up the individual controller methods
    parseMethods(c);

    //** if this is the default controller...
    if(c.name == _opt.defaultController) { 
        //** wire up the app root route to it; this is the primary root redirect
        _app.all(_opt.routePrefix +'[/]?', _errorHandler, route.bind(c, c[_opt.indexView]));

        //** wire up the default controllers methods off the root
        parseMethods(_.extend(c, {name: ''}));
    }

    //** extend the default controller implementation onto the object
    _.defaults(c, {

        //** a simple method that wraps the pattern of rendering a view with options
        renderView: function(res, name, opt, p) {
            p = p || _q.defer(), opt = opt||{};

            //** render the view, return a promise, resolving/rejecting it when the view is rendered
            res.render(name, opt, function(err, html) {
                if(err) return p.reject(err); //**** MAKE THIS RETURN AN HTTP ERROR/500
                p.resolve(html);
            });
            return p.promise;
        },

        renderLayout: function(res, views, opt, p) {
            opt = opt||{};
            var views = _.isArray(views)?views:[views],
                q = [];

            //** iterate the views, creating an array of promises for views
            views.forEach(function(view) { q.push(this.renderView(res, view.name||view, view.opt||{})) }.bind(this));

            //** when all the promises have been completed, aggregate their html chunks
            _q.all(q).then(function(results) {
                var html = '';
                (results||[]).forEach(function(chunk) { html += chunk; });

                //** render the layout
                this.renderView(res, opt.layoutView||'layout', _.extend(opt, { content: html }), p);
            }.bind(this));
        }
    });
}

function parseMethods(obj, path, ctx) {
    ctx = ctx||obj;
    !obj.name && (obj.name = '');

    for(var m in obj) {
        //** convention: anything starting with underscore is "private"
        if(/^_.*/.test(m)) continue;                 

        //** recursively parse controller methods, preserving paths
//**** this only supports a single level of nesting, and isn't working right...fix this
        if(typeof(obj[m]) == 'object') {
            parseMethods.call(this, _.extend(obj[m], {name: obj.name}), m +'/', ctx);
            continue;
        }

        if(typeof(obj[m]) !== 'function') continue;

        //**** add translation table here to translate method names before we create endpoints
        //**** ie, translate obj['SomeMethod'] to obj['SomeOtherMethod'] and dont wire up 'SomeMethod'
        
        //** create a callback for every "public" method
        _app.all(_opt.routePrefix + (obj.name !== '' ? obj.name +'/' : '') + (path||'') + m +'(/)?', _errorHandler, route.bind(ctx, obj[m]));
    }
}
