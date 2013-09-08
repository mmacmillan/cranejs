/*
 | web.js
 | ----
 | the web server component of the crane module
 |
 | Mike MacMillan
 | mikejmacmillan@gmail.com
*/
var util = require('util'),
    http = require('http'),
    _ = require('lodash'),
    cons = require('consolidate'),
    express = require('express'),
    crane = null,
    _app = null;

function web_nodejs(opt) {
    if(_app) return web_nodejs;

    //**** nodejs http server implementation here
    return web;
}

function web_express(opt) {
    if(_app) return web_express;
    if(typeof(opt) === 'string') opt = {root: opt}; //** allow opt to be a string, indicating the app root

    //** setup some opinionated defaults
    _.defaults((opt = opt||{}), {
        strictRouting: true,
        engine: [{ name: 'hndl', handler: 'handlebars' }], //** handlebars by default, .hndl files (this allows html to be served separate)

        root: crane.path, //** use the app root
        pub: '/pub/',
        views: '/views/',
        logs: '/logs/',

        middleware: function(app) {
            //** express middleware (parse all-the-things by default)
            app.use(express.cookieParser());
            app.use(express.json());
            app.use(express.urlencoded());
            app.use(express.multipart());

            //** all pub assets are served static
            app.use(express.static(opt.root + opt.pub));
        }
    });

    //** initialize the express app with some common concerns
    _app = express();
    _app.configure(function() {
        _app.set('strict routing', opt.strictRouting);

        //** initialize the supported rendering engines 
        !Array.isArray(opt.engine) && (opt.engine = [opt.engine]);
        opt.engine.forEach(function(obj) { _app.engine(obj.name, cons[obj.handler]); })

        //** set the first registered engine as the default; set the base view path
        _app.set('view engine', opt.engine[0].name);
        _app.set('views', opt.views);

        //** register the middleware
        opt.middleware(_app);
    });

    return web;
}

module.exports = web = {
    __init: function(parent) { crane = parent; },

    //** passes the router to the developer for custom configuration
    configure: function(cb) { 
        cb.call(crane, _app); 
        return web;
    },

    //** start the http server given the router function (this is essentially what express does)
    listen: function() {
        var host = http.createServer(_app);
        host.listen.apply(host, arguments);
    },

    //** accessor for the web server instance
    app: function() { return _app },

    //** the web server factory objects
    express: web_express,
    nodejs: web_nodejs

}
