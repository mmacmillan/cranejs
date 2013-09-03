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

//** the container; returns a module by key if it exists
function ioc(key) { return modules[key]; }
util.inherits(ioc, require('events').EventEmitter);

//** extend the ioc object
_.extend(ioc.prototype, {
    initialize: function(parent) { 
        crane = parent; 
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

            //** read the path examine each file
            files.forEach(function(name) {
                //** if its a folder, then queue it for loading
                if(fs.statSync(p +'/'+ name).isDirectory())
                    return opt.recurse && dirs.push(p +'/'+ name);
                else {
                    //** apply the filter to the item's name/path
                    if(('apply' in opt.filter) && !opt.filter.call(this, name)) return;

                    //** require the object to see if its valid; assing the key by parsing the specified property, or infer it based on the filename
                    if((x = require(p +'/'+ name))) {
                        if(('apply' in opt.parse) && !opt.parse.call(this, x)) return; //** fire the parse callback for items that pass the filter
                        x['ioc-key'] = (base +'.').replace('..', '.') + (x[opt.keyProp] || path.basename(name, '.js'));
                        modules[x['ioc-key']] = x;
                    }
                }
            });

            //** recurse each sub-directory
            dirs.forEach(load);
        }

        //** load the given path, with the options
        load(path.normalize(crane.path + dir));
        return this;
    },

    //** remove this
    dump: function() { console.log(util.inspect(modules)); return ioc; }
});

module.exports = exports = new ioc;
