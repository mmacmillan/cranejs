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
    path = require('path'),
    modules = {},
    crane = null;

var defaults = {
    keyProp: 'name',
    parse: function(o) { return o; },
    filter: function(o) { return path.extname(o) == '.js'; } //** by default, filter all but javascript
};

//** the ioc container; resolves an object key against the container, given the arguments
function ioc(key) { 
    var args = _.toArray(arguments).slice(1);
    return modules[key] && modules[key].resolve(args);
}

//** extend the ioc object
_.extend(ioc, {
    initialize: function(parent) { crane = parent; },

    //** the supported component lifetimes; these effect how the object is resolved
    lifeTime: {
        singleton: 'singleton',
        transient: 'transient'
    },

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
                        x['ioc-key'] = (base +'.').replace('..', '.') + (x[opt.keyProp] || path.basename(name, '.js'));
                        this.register(x['ioc-key'], x, opt);
                    }
                }
            }.bind(this));

            //** recurse each sub-directory
            dirs.forEach(load.bind(this));
        }

        load.call(this, path.normalize(crane.path + dir));
        return this;
    },

    register: function(key, obj, opt) {
        _.defaults((opt = opt||{}), {
            lifeTime: ioc.lifeTime.singleton //** components adhere to the singleton lifetime by default
        });

        //** small helper to construct objects based on either a function constructor, or object literal
        function construct(base) {
            var args = _.toArray(arguments).slice(1);
            function fn() { ('apply' in base) && base.apply(this, args); }
            fn.prototype = ('prototype' in base) && base.prototype || base; //** supports an object literal as the prototype
            return new fn();
        }

        //** register the object, wrapped in a facade to facilitate resolution, given the component lifetime
        if(modules[key]) return;
        modules[key] = {
            key: key,
            lifeTime: opt.lifeTime,

            //** provides the correct instance of the object based on lifetime
            resolve: function(args) {
                args = args||[];

                //** return the singleton object
                if(opt.lifeTime == ioc.lifeTime.singleton)
                    return obj;

                //** construct the transient object, of the given type, with the given arguments
                args.unshift(obj);
                return construct.apply(this, args);
            }
        }
        return this;
    },

    //** remove this
    dump: function() { console.log(util.inspect(modules)); return this; }
});

module.exports = exports = ioc;
