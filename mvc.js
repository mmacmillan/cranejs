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
    handlebars = require('handlebars'),
    mongoose = require('mongoose'),
    q = require('q');

var _controllers = {},
    _repos = {},
    _queue = [],
    _repoQueue = [],
    _app = null,
    _ioc = null,
    _opt = null,
    _init = null,
    _errorHandler = null,
    _templates = {
        layout: {}
    };


//** Component Interface
//** ----

var mvc = (module.exports = {
    initialize: function(app, opt) {
        if(_init) return;

        //** some defaults
        _.defaults((_opt = opt||{}), {
            defaultController: 'index',
            indexView: 'index',
            routePrefix: '/',
        });

        //** set the global reference to the express app (express only for now)
        _app = app;
        _errorHandler = opt.errorHandler;

        //** if handlebars is being used, do some extra parsing
        if(_app.settings['view engine'] == 'hndl') { //** move this to config or an "enum"
            var layouts = app.settings.views + 'layout/',
                partials = app.settings.views + 'partials/',
                formatName = function(n) { return n.replace(path.extname(n), '') };

            //** find any layouts defined within the views folder; compile them as a handlebars template
            //*** dont read and cache these during dev, use a config to toggle this...
            fs.existsSync(layouts) && fs.readdirSync(layouts).forEach(function(layout) {
                _templates.layout[formatName(layout)] = handlebars.compile(fs.readFileSync(layouts+layout, 'utf8'));
            });

            //** find any partials defined within the views folder; register them with handlebars
            fs.existsSync(partials) && fs.readdirSync(partials).forEach(function(partial) {
                handlebars.registerPartial(formatName(partial), fs.readFileSync(partials+partial, 'utf8'));
            });
        }

        //** initialize any repos and controllers that have been q'd
        _repoQueue.forEach(initializeRepo);
        _queue.forEach(initializeController);
        _init = true;
    },

    //** sets the ioc container we use for resolving objects
    container: function(cont) { if(cont) _ioc = cont; return mvc },

    controller: function(name, deps, impl) {
        if(!name || !impl) return;
        !Array.isArray((deps = deps||[])) && (deps = [deps]);

        //** if we've seen this controller before, return it, otherwise, store it
        if(_controllers[(name = name.toLowerCase())]) return _controllers[name];
        _controllers[name] = impl = _.extend(impl, {name: name||''});

        //** make sure the controller knows about its dependencies by name, the ioc will resolve these
        if(deps.length > 0 && !impl._dependencies) impl._dependencies = deps;

        //** initialize our controller, or queue it for initialization later
        _init
            ? initializeController(impl)
            : _queue.push(impl);

        //** set the controller implementation as the exports object for the given module
        return impl;
    },

    repository: function(name, model, deps, impl) {
        if(!name || !model || !impl) return;
        !Array.isArray((deps = deps||[])) && (deps = [deps]);

        //** if we've seen this repo before, return it, otherwise, store it
        if(_repos[(name = name.toLowerCase())]) return _repos[name];
        _repos[name] = impl = _.extend(impl, {name: name||''});

        //** make sure the repo knows about its dependencies by name, the ioc will resolve these
        if(deps.length > 0 && !impl._dependencies) impl._dependencies = deps;

        //** initialize our repo, or queue it for initialization later
        var obj = { name: name, model: model, impl: impl };
        _init
            ? initializeRepo(obj)
            : _repoQueue.push(obj);

        //** set the repo implementation as the exports object for the given module
        return impl;

    }
});



//** Routing
//** ----

function route(handler, req, res, next) { //** simple route handler
    function error(err) { _errorHandler && _errorHandler.call(this, err, req ,res) }
    var p = q.defer();

    //** helper to "send a response", optionally specifying the content type and status code
    p.response = function(obj, status, opt) {
        var type = typeof(opt) === 'string' && opt || null;

        //** set the status code and content type if specified
        if(status) res.statusCode = status;
        if(type) res.set('content-type', type);

        //** resolve the promise with the object
        p.resolve(obj);
    }

    //** call the handler for this route
    util.log('[http] routing: '+ req.url);
    handler.call(this, p, req, res);

    //** handle the callback
    p.promise
        .then(function(result) {
            result = result || {};

            //** 1) if the result object is a string, assume its markup and send text/html to the client
            if(typeof(result) == 'string') {
                !res.get('content-type') && res.set('content-type', 'text/html');
                res.end(result.toString());

            //** 2) if the result object is an object, assume its an object literaly that needs to be serialized to json
            } else {
                !res.get('content-type') && res.set('content-type', 'application/javascript');
                res.end(JSON.stringify(result));
            }

        }, error)

        .catch(function(a, b) {
            console.log('caught');
        });
}

function initializeController(c) {
    //** wire up the individual controller methods
    parseMethods(c, c.name);

    //** if this is the default controller, wire it up sans controller name (let its methods be served off root)
    if(c.name == _opt.defaultController) 
        parseMethods(c, '');

    //** extend the default controller implementation onto the object
    _.defaults(c, {
        util: {
            //** returns a mongoose objectId from a string/int/etc id
            ObjectId: function(id) { return mongoose.Types.ObjectId(id); }
        },

        //** a simple method that wraps the pattern of rendering a view with options
        view: function(res, name, opt, p) {
            p = p || _q.defer(), opt = opt||{};

            //** render the view, return a promise, resolving/rejecting it when the view is rendered
            res.render(name, opt, function(err, html) {
                if(err) return p.reject(err); //**** MAKE THIS RETURN AN HTTP ERROR/500
                p.resolve(html);
            });
            return p.promise;
        }
    });

    //** if a container has been provided, resolve the controller, to get its dependencies
    _ioc && _ioc(c._iocKey);

    //** if the controller implements an initialize method, call it now
    _.isFunction(c.initialize) && c.initialize.call(c);
}

function initializeRepo(r) {
    if(!_ioc && typeof(r.model) === 'string')
        throw new Error('No container is available to resolve the model:'+ r.model);

    //** resolve a string model
    if(typeof(r.model) === 'string') r.model = _ioc(r.model);

    //** compile a new model that we can mixin with our repo implementation; this keeps the base model separate from our decorated repository
    var repo = _.extend(mongoose.Model.compile(r.model.modelName, r.model.schema, r.model.collection.name, mongoose.connection, mongoose), r.impl);

    //** re-register the object with the container
    _ioc && r.impl._iocKey && _ioc.register(r.name, repo, {force: true});

    //** if the repo implements an initialize method, call it now
    _.isFunction(repo.initialize) && repo.initialize.call(repo);
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

        if(typeof(obj[m]) !== 'function') continue;

        //** if this is the "index" method, wire it up sans named endpoint
        if(m == _opt.indexView) {
            _app.get(_opt.routePrefix + path, _errorHandler, route.bind(obj, obj[m]));
            _app.post(_opt.routePrefix + path, _errorHandler, route.bind(obj, obj[m]));
        }

        //**** add translation table here to translate method names before we create endpoints
        //**** ie, translate obj['SomeMethod'] to obj['SomeOtherMethod'] and dont wire up 'SomeMethod'
        
        //** create a callback for every "public" method
        _app.get(_opt.routePrefix + path + m +'/?', _errorHandler, route.bind(ctx, obj[m]));
        _app.post(_opt.routePrefix + path + m +'/?', _errorHandler, route.bind(ctx, obj[m]));
    }
}


//** handlebars helpers
//** ----

handlebars.registerHelper('layout', function(name, opt) {
    !opt && (opt = name) && (name = null);

    //** get the layout template and build a context
    var layout = _templates.layout[name||'default'], 
        ctx = layout && _.extend(this, opt, { content: opt.fn(this) });

    //** either render the layout with the block text, or just render the block text
    return layout && layout.call(this, ctx) || opt.fn(this);
});

handlebars.registerHelper('template', function(path, opt) {
    !opt && (opt = path) && (path = null);

    //** load and cache the template if we haven't seen it before
    var template = _templates[path];
    if(!template) {
        var temp = fs.readFileSync(_app.settings.views + path + (path.indexOf('.') == -1 ? '.hndl' : ''), 'utf8'); //**** weak test for extension, fix this
        //temp && (_templates[path] = template = handlebars.compile(temp)); //**** disable caching until we use config to toggle it
        temp && (template = handlebars.compile(temp));
    }

    //** render the template with the block content
    return template
        ? template.call(this, _.extend(this, opt, { content: opt.fn(this) }))
        : opt.fn(this);
});
