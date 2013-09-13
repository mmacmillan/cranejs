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
    _queue = [],
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
            defaultController: 'index',
            indexView: 'index',
            routePrefix: '/',
            controllers: '/controllers/',
            views: '/views/'
        });

        //** set the global reference to the express app (express only for now)
        _app = app;
        _errorHandler = opt.errorHandler;

        //** initialize any controllers that have been q'd
        _queue.forEach(initializeController);

        _init = true;
    },

    //** sets the ioc container we use for resolving objects
    container: function(cont) { if(cont) _ioc = cont; return mvc },

    controller: function(name, deps, impl) { //** m: the module object that invoked .controller()
        if(!name || !impl) return; //** validate/normalize
        !Array.isArray((deps = deps||[])) && (deps = [deps]);

        //** if we've seen this controller before, return it, otherwise, store it
        if(_controllers[name]) return _controllers[name];
        _controllers[name] = impl = _.extend(impl, {name: name||''});

        //** make sure the controller knows about its dependencies by name
        if(deps.length > 0 && !impl._dependencies) impl._dependencies = deps;

        //** initialize our controller, or queue it for initialization later
        _init
            ? initializeController(impl)
            : _queue.push(impl);

        //** set the controller implementation as the exports object for the given module
        return impl;
    }
};



//** Routing
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

function initializeController(c) {
    //** wire up the individual controller methods
    parseMethods(c, c.name);

    //** if this is the default controller, wire it up sans controller name (let its methods be served off root)
    if(c.name == _opt.defaultController) 
        parseMethods(c, '');

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

    //** if a container has been provided, resolve the controller, to get its dependencies
    _ioc && _ioc(c._iocKey);

    //** if the controller implements an initialize method, call it now
    _.isFunction(c.initialize) && c.initialize.call(c);
}

//** parses route handlers from the given object
function parseMethods(obj, path, ctx) {
    ctx = ctx||obj;
    if(!path && path != '') path = obj.name||'';
    if(path != '' && _.last(path) != '/') path += '/';

    for(var m in obj) {
        //** convention: anything starting with underscore is "private", dont wire up the initialize method as a route handler
        if(/^_.*/.test(m) || m == 'initialize') continue;                 

        //** if the property is an object, parse it, nesting the path; this allows /controller/nested/object/endpoint routes easily
        if(typeof(obj[m]) == 'object') {
            parseMethods(obj[m], path + m, ctx);
            continue;
        }

        if(!_.isFunction(obj[m])) continue;

        //** if this is the "index" method, wire it up sans named endpoint
        m == _opt.indexView && _app.all(_opt.routePrefix + path, _errorHandler, route.bind(obj, obj[m]));

        //**** add translation table here to translate method names before we create endpoints
        //**** ie, translate obj['SomeMethod'] to obj['SomeOtherMethod'] and dont wire up 'SomeMethod'
        
        //** create a callback for every "public" method
        _app.all(_opt.routePrefix + path + m +'/?', _errorHandler, route.bind(ctx, obj[m]));
    }
}
