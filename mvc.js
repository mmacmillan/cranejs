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
    q = require('q'),
    ioc = require('crane-js').ioc;

var _app = null,
    _init = null,
    _errorHandler = null,
    _templates = {
        layout: {}
    },
    _controllers = [],
    _opt = {
        defaultController: 'index',
        indexView: 'index',
        routePrefix: '/',
    };


//** Component Interface
//** ----

var mvc = (module.exports = {
    initialize: function(app, opt, cb) {
        if(_init) return;

        //** overlay the defaults
        _.defaults(_opt, opt);

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

        _controllers.forEach(function(name) { ioc.instance(name) });
        _init = true;
        cb && cb.call(mvc);
    },

    //** sets the ioc container we use for resolving objects
    container: function(cont) { if(cont) ioc = cont; return mvc },

    controller: function(name, deps, impl) {
        //** set the controller implementation as the exports object for the given module
        if(!name || !impl) return;
        name = name.toLowerCase(); //** normalize the dependency name; case is ignored

        //** if we've seen this controller before, return
        if(ioc.contains(name)) return ioc(name);
        _controllers.push(name);

        ioc.register(name, deps, impl, {
            lifetime: ioc.lifetime.singleton,
            create: function(name, inst) {
                name = (name||'').replace('controller', '');

                //** wire up the individual controller methods
                parseMethods(inst, name);

                //** if this is the default controller, wire it up sans controller name (let its methods be served off root)
                if(name == _opt.defaultController)
                    parseMethods(inst, '');

                //** extend the default controller implementation onto the object
                _.defaults(inst, {
                    util: {
                        //** returns a mongoose objectId from a string/int/etc id
                        ObjectId: function(id) { return mongoose.Types.ObjectId(id); }
                    },

                    //** a simple method that wraps the pattern of rendering a view with options
                    view: function(res, vname, opt, p) {
                        p = p || _q.defer(), opt = opt||{};

                        //** render the view, return a promise, resolving/rejecting it when the view is rendered
                        res.render(vname, opt, function(err, html) {
                            if(err) return p.reject(err); //**** MAKE THIS RETURN AN HTTP ERROR/500
                            p.resolve(html);
                        });
                        return p.promise;
                    }
                });

                //** if the controller implements an initialize method, call it now
                _.isFunction(inst.initialize) && inst.initialize.call(inst);
                return inst;
            }.bind(impl, name)
        });

        //** return the ioc so that if this is being included in a ioc.path() registration, it doesn't immediately resolve
        return ioc;
    },

    repository: function(name, model, deps, impl) {
        if(!name || !model || !impl) return;
        name = name.toLowerCase(); //** normalize the dependency name; case is ignored

        //** if we've seen this repo before, return
        if(ioc.contains(name)) return ioc(name);

        //** resolve the model if given a name, 'Models.Customer'
        if(typeof(model) === 'string')
            model = ioc.instance(model);

        ioc.register(name, deps, impl, {
            lifetime: ioc.lifetime.singleton,
            create: function(inst) {
                var repo = _.extend(mongoose.Model.compile(model.modelName, model.schema, model.collection.name, mongoose.connection, mongoose), inst, {
                    _name: name, //** _name used internally to avoid naming conflicts, refactor this to use iocKey
                    model: model
                });

                if(inst.initialize && _.isFunction(inst.initialize))
                    inst.initialize.call(inst, repo);

                return repo;
            }
        });

        //** return the ioc so that if this is being included in a ioc.path() registration, it doesn't immediately resolve
        return ioc;
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

    //** wrap a call to the response method, wrapping the message in an envelope, with a 500 error
    p.error = function(message) { p.response({ message: message }, 500) }

    //** used for callbacks to promises for fail state, etc
    p.errorCallback = function(err) { p.error(err && err.message) }

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
                var status = "ok";

                //** set a custom status based on the status code
                if(res.statusCode == 500) status = "error";

                !res.get('content-type') && res.set('content-type', 'application/javascript');
                res.end(JSON.stringify({ status: status, response: result }));
            }

        }, error)

        .catch(function(a, b) {
            console.log('caught');
        });
}

//** parses route handlers from the given object
function parseMethods(obj, p, ctx) {
    ctx = ctx||obj;
    if(!p && p != '') p = obj._name||''; //** p = path
    if(p != '' && _.last(p) != '/') p += '/';

    for(var m in obj) {
        //** convention: anything starting with underscore is "private", dont wire up the initialize method as a route handler
        if(/^_.*/.test(m) || m == 'initialize') continue;

        //** if the property is an object, parse it, nesting the path; this allows /controller/nested/object/endpoint routes easily
        if(typeof(obj[m]) == 'object') {
            parseMethods(obj[m], p + m, ctx);
            continue;
        }

        if(typeof(obj[m]) !== 'function') continue;

        //** if this is the "index" method, wire it up sans named endpoint
        if(m == _opt.indexView) {
            _app.all(_opt.routePrefix + p , _errorHandler, route.bind(obj, obj[m])); //** for now...
        } else {
            //**** add translation table here to translate method names before we create endpoints
            //**** ie, translate obj['SomeMethod'] to obj['SomeOtherMethod'] and dont wire up 'SomeMethod'

            //** create a callback for every "public" method
            _app.all(_opt.routePrefix + p + m +'/?', _errorHandler, route.bind(ctx, obj[m])); //** for now as well...
        }
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

handlebars.registerHelper('template', function(p, opt) {
    !opt && (opt = p) && (p = null);

    //** load and cache the template if we haven't seen it before
    var template = _templates[p];
    if(!template) {
        var temp = fs.readFileSync(_app.settings.views + p + (p.indexOf('.') == -1 ? '.hndl' : ''), 'utf8'); //**** weak test for extension, fix this
        //temp && (_templates[path] = template = handlebars.compile(temp)); //**** disable caching until we use config to toggle it
        temp && (template = handlebars.compile(temp));
    }

    //** render the template with the block content
    return template
        ? template.call(this, _.extend(this, opt, { content: opt.fn(this) }))
        : opt.fn(this);
});

