/*
 | ioc.js
 | ----
 | the ioc component of the crane module
 |
 | Mike MacMillan
 | mikejmacmillan@gmail.com
*/
var util = require('util'),
    _ = require('lodash'),
    fs = require('fs'),
    events = require('events'),
    path = require('path'),
    vm = require('vm'),
    modules = {},
    unresolved = [],
    init = false;

var defaults = {
    keyProp: 'name',
    parse: function(o) { return o; },
    filter: function(o) { return path.extname(o) == '.js'; } //** by default, filter all but javascript
};

//** the ioc container; gets an instance of a resolved object
function ioc(key, args, context) { return ioc.instance(key, args, context) }

//** extend the ioc object
_.extend(ioc, events.EventEmitter.prototype, {
    //** the supported lifetime types; these effect how the object is resolved
    /*
        object: use the object "as-is", you maintain its lifetime, container just "stores" it by key
        singleton: if the object is a function, it will be executed and cached only once (with dependencies if specified using amd-like syntax)
        transient: similar to a singleton, just instantiated each time its requested (with dependencies)
    */
    lifetime: {
        object: 'object',
        singleton: 'singleton',
        transient: 'transient'
    },

    initialize: function(success, error) {
        if(init) return;

        //** resolve all the objects
        Object.keys(modules).forEach(function(m) { modules[m].resolve() })

        //** trigger the unresolved event if any unresolved dependencies remain
        if(unresolved.length > 0)
            ioc.emit('unresolved', unresolved);

        //** fire success, trigger load
        init = true;
        success && success.call && success.call(ioc);
        ioc.emit('load');
    },

    initialized: function() { return init },


    //** Resolution Methods
    //** ----

    //** format: instance('key', [arg1, arg2, ...] [, context]);
    instance: function(key, args, context) {
        //** find the object by key, and resolve with the given arguments
        key = (key||'').toLowerCase();
        var args = args||[],
            comp = modules[key] && modules[key].instance(args, context);

        //** if the object couldn't be resolved, trigger an event for handling
        !comp && ioc.emit('resolve:error', { key: key, args: args, context: context });
        return comp;
    },

    //** format: ns('controllers')
    ns: function(nskey) {
        var objs = {},
            nskey = (nskey||'').toLowerCase(),
            gex = nskey && nskey != '' ? new RegExp('\\.?'+ nskey +'\\.(.*?)') : /^[^.]*$/;

        //** find all the objects of the given namespace, and return a resolved object for use
        for(var key in modules)
            gex.test(key) && (objs[key.replace(nskey +'.', '')] = modules[key].resolve());

        //** trigger an error if we couldn't resolve the namespace
        Object.keys(objs).length==0 && this.emit('resolve:error', { namespace: nskey });

        return objs;
    },

    //** simply return if the container contains an object with the given key
    contains: function(key) {
        return !!modules[key];
    },

    modules: function() {
        return modules;
    },



    //** Registration Methods
    //** ----

    path: function(dir, opt) {
        //** some default options...
        _.defaults((opt = opt||{}), {
            recurse: opt.recurse!==false,
            keyProp: opt.keyProp || defaults.keyProp,
            parse: opt.parse || defaults.parse,
            filter: opt.filter || defaults.filter
        });

        function load(p) {
            var dirs = [],
                base = opt.key || path.normalize(p.replace(crane.path, '')).substring(1).replace(/[/\\]/g, '.'),
                files = fs.readdirSync(p);

            files.forEach(function(name) {
                //** queue folders for for loading if recursion is enabled
                if(fs.statSync(p +'/'+ name).isDirectory())
                    return opt.recurse && dirs.push(p +'/'+ name);
                else {
                    //** apply the filter to the file's name/path, returning if necessary
                    if(('apply' in opt.filter) && !opt.filter.call(this, name)) return;

                    //** require the object to see if its valid; fire the parse callback if so, then create the container key and register it.  reject objects
                    //** that return the ioc; that means they are self-registering, and merely need be require()'d
                    if((x = require(p +'/'+ name)) !== ioc) {
                        if(('apply' in opt.parse) && !opt.parse.call(this, x)) return;
                        var key = (base +'.').replace('..', '.') + (x[opt.keyProp] || path.basename(name, '.js'));
                        this.register(key, x, opt);
                    }
                }
            }.bind(this));

            //** recurse each sub-directory
            dirs.forEach(load.bind(this));
        }

        load.call(this, path.normalize(dir[0] == '/' ? dir : crane.path +'/'+ dir));
        return this;
    },

    children: function(key, obj, opt) {
        if(!obj) return;

        //** apply some defaults
        _.defaults((opt = opt||{}), {
            filter: defaults.parse //** ie, do nothing to filter by default
        });

        //** split the object's children into key/value pairs, and register each, allowing the dev a chance to filter before registration
        _.pairs(obj).forEach(function(pair) {
            if(('apply' in opt.filter) && !opt.filter.apply(this, pair)) return;
            this.register(key +'.'+ pair[0], pair[1], opt);
        }.bind(this));

        return this;
    },

    //** intended for including ioc modules; those that simply ioc.register() within their .js file
    module: function(modulePath, opt) {
        require(path.normalize(modulePath[0] == '/' ? modulePath : crane.path +'/'+ modulePath));
        return this;
    },

    //** 2 usages: register('name', { implementation }, { options }) or register('name', ['depependency1', 'dependency2'], { implementation }, { options })
    //** if the implementation is a function, it is assumed that the module is returned after executing that function (with scope)
    register: function(key, deps, obj, opt) {
        //** gets an object from a function, given a list of dependencies; used for resolving objects that take a dependency list, and return an "instance"
        function getObject(dependencies) {
            var inst = _.isFunction(obj)
                ? obj.apply(obj, _.toArray(dependencies))
                : obj;

            return opt.create && _.isFunction(opt.create)
                ? opt.create(inst)
                : inst;
        }

        //** normalize the key
        key = (key||'').toLowerCase();

        //** allow the second argument to be either a dependency array, or the implementation itself
        if(!Array.isArray(deps) || !obj) {
            obj = deps;
            opt = obj;
            deps = [];
        }

        //** make sure dependencies are in an array
        !Array.isArray(deps) && (deps = [deps]);

        _.defaults((opt = opt||{}), {
            lifetime: ioc.lifetime.object //** objects by default, are registered as objects; not instantiated, used "as-is"
        });

        //** register the object, wrapped in a facade to facilitate resolution, given the component lifetime
        if(modules[key] && opt.force !== true) return;
        modules[key] = {
            key: key,
            lifetime: opt.lifetime,
            dependencies: deps,
            resolved: {},
            resolutionAttempts: 0,

            //** holds a resolved instance to avoid duplicate work, for object and singletime lifetimes
            _instance: null,

            instance: function(args, context) {
                var comp = null;
                args = args||[];

                //** dont return instances of unresolved objects
                if(Object.keys(this.resolved).length != this.dependencies.length) {
                    if(!this.resolve(args, context)) return;
                }

                //** return object directly, "as-is"
                if(opt.lifetime == ioc.lifetime.object)
                    comp = obj;

                //** return the singleton, instantiating with the resolved dependencies if not yet created
                else if(opt.lifetime == ioc.lifetime.singleton)
                    comp = this._instance || (this._instance = getObject(this.resolved));

                //** return the transient; same as a singleton, just construct it each time its requested
                else if(opt.lifetime == ioc.lifetime.transient)
                    comp = getObject(this.resolved);

                return comp;
            },

            /**
             * resolves the object against the given context, ensuring all dependencies are valid by triggering resolve
             * recursively on all child dependencies.  circular dependencies will be met with an empty object, and any
             * dependencies already resolved will be reused.  if unresolvable, the parent object will be added to a
             * global unresolved queue.
             *
             * @param {Array} args
             * @param {Object} context
             * @returns {boolean} whether or the not the object and its dependencies can be resolved
             */
            resolve: function(args, context) {
                args = args||[];
                context = context||{};

                if(!context[this.key])
                    context[this.key] = this;

                if(Object.keys(this.resolved).length != this.dependencies.length) {
                    var resolved = true;

                    this.dependencies.forEach(function(dep) {
                        dep = dep && dep.toLowerCase() || '';

                        //** skip resolved dependencies
                        if(this.resolved[dep]) return;

                        //** fulfill circular dependencies with an empty object
                        if(context[dep]) {
                            this.resolved[dep] = {};
                            return;
                        }

                        //** get the target dependency from the container, pushing this object into the resolution Q if we can't
                        var obj = ioc.instance(dep, null, context);
                        if(obj) this.resolved[dep] = obj;
                        else  resolved = false;
                    }.bind(this));

                    if(!resolved) unresolved.push(this);
                    return resolved;
                }
            }
        }

        //** provide a shorthand to its container registration object
        obj._iocKey = key;
        return this;
    }
});

//** initialize the ioc as an eventEmitter as well; psuedo-inheritance, then expose it as the module
events.EventEmitter.call(ioc);
module.exports = ioc;
