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
    modules = {}

var defaults = {
    keyProp: 'name',
    parse: function(o) { return o; },
    filter: function(o) { return path.extname(o) == '.js'; } //** by default, filter all but javascript
};

//** the ioc container; resolves an object key against the container, given the arguments
function ioc(key) { return ioc.resolve(key) }

//** extend the ioc object
_.extend(ioc, events.EventEmitter.prototype, {
    //** the supported lifetime types; these effect how the object is resolved
    /*
        object: middleware, helper function, utility library, etc; return it "as-is", do not attempt to create/instantiate
        singleton: repository, controller, etc; ensure this object is created one time, and that instance is reused when .resolve()'d
        transient: object, component, widget, etc; a new instance of this object is returned each time .resolve() is called
    */
    lifetime: {
        object: 'object',
        singleton: 'singleton',
        transient: 'transient'
    },

    //** allows the user to specifically configure the ioc object, while still maintaining a fluent interface
    configure: function(fn) {
        fn && fn.call(ioc, ioc);
        return this;
    },


    //** Resolution Methods
    //** ----

    //** format: resolve('key', arg1, arg2, arg3, arg4, ...)
    resolve: function(key) {
        //** find the object by key, and resolve with the given arguments
        key = (key||'').toLowerCase();
        var args = _.toArray(arguments).slice(1);
        var comp = modules[key] && modules[key].resolve(args);

        //** if the object couldn't be resolved, trigger an event for handling
        !comp && ioc.emit('resolve:error', { key: key });
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

        //** return a null object if we didn't resolve any objects from that namespace
        return objs;
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
                base = path.normalize(p.replace(crane.path, '')).substring(1).replace(/[/\\]/g, '.'),
                files = fs.readdirSync(p);

            files.forEach(function(name) {
                //** queue folders for for loading if recursion is enabled
                if(fs.statSync(p +'/'+ name).isDirectory())
                    return opt.recurse && dirs.push(p +'/'+ name);
                else {
                    //** apply the filter to the file's name/path, returning if necessary
                    if(('apply' in opt.filter) && !opt.filter.call(this, name)) return;

                    //** require the object to see if its valid; fire the parse callback if so, then create the container key and register it
                    if((x = require(p +'/'+ name))) {
                        if(('apply' in opt.parse) && !opt.parse.call(this, x)) return;
                        var key = (base +'.').replace('..', '.') + (x[opt.keyProp] || path.basename(name, '.js'));
                        this.register(key, x, opt);
                    }
                }
            }.bind(this));

            //** recurse each sub-directory
            dirs.forEach(load.bind(this));
        }

        load.call(this, path.normalize(crane.path + dir));
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

    register: function(key, obj, opt) {
        key = (key||'').toLowerCase();
        _.defaults((opt = opt||{}), {
            lifetime: ioc.lifetime.object //** objects by default, are registered as objects; not instantiated, used "as-is"
        });

        function create(base) {
            var inst = Object.create(base.hasOwnProperty('prototype') ? base.prototype : base); //** allow an object to be the prototype
            ('apply' in base) && base.apply(inst, _.toArray(arguments).slice(1)); //** call the "base constructor" if its there...
            return inst;
        }

        //** register the object, wrapped in a facade to facilitate resolution, given the component lifetime
        if(modules[key] && opt.force !== true) return;
        modules[key] = {
            key: key,
            lifetime: opt.lifetime,
            instance: null,

            //** provides the correct instance of the object based on lifetime
            resolve: function(args) {
                var comp = null; 
                args = args||[];
                args.unshift(obj);

                //** return object's directly
                if(opt.lifetime == ioc.lifetime.object) 
                    comp = obj;

                //** return the singleton, instantiating if not yet
                else if(opt.lifetime == ioc.lifetime.singleton)
                    comp = modules[key].instance || (modules[key].instance = create.apply(this, args));

                //** construct the transient object, of the given type, with the given arguments
                else
                    comp = create.apply(this, args);

                //** resolve any dependencies; im on the fence about using _dependencies...
                if(!comp._resolved && obj._dependencies) {
                    comp._resolved = true; //** mark as resolved immediately to prevent an infinite loop of resolution, aka resolution-of-doom

                    if(!Array.isArray(obj._dependencies)) obj._dependencies = [obj._dependencies];

                    //** resolve each dependency, assuming we're resolving a namespace if the dependency starts with ns:, ex ns:Controllers
                    obj._dependencies.forEach(function(dep) {
                        if(dep.indexOf(':') != -1) { //** if its an alias...ns: or SomeAlias:
                            var segs = dep.split(':');

                            /^ns\:(.*?)/.test(dep)
                                ? comp[segs[1]] = ioc.ns(segs[1]) //** ex, ['ns:Foobars']
                                : comp[segs[0]] = ioc.resolve(segs[1]) //** ex, ['Foobar:Some.Nested.Component.Foobar']
                        } else
                            comp[dep] = ioc.resolve(dep); //** ex, ['Foobar']
                    });
                }
                
                return comp;
            }
        }

        //** provide a shorthand to its container registration object
        obj._iocKey = key;
        return this;
    },

    //** remove this
    dump: function() { console.log(util.inspect(modules)); return this; }
});

//** initialize the ioc as an eventEmitter as well; psuedo-inheritance, then expose it as the module
events.EventEmitter.call(ioc);
module.exports = global.ioc = ioc;
