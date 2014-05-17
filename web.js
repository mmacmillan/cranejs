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
    _app = null;


//** web server factory methods
//** ----

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

        extendMiddleware: true, //** when true, any .middleware function defined will be passed to the default middleware and integrated, vs overwriting it
        middleware: function() {}
    });

    //** initialize the express app with some common concerns
    _app = express();
    _app.configure(function() {
        _app.set('strict routing', opt.strictRouting);
        _app.set('x-powered-by', false);

        //** initialize the supported rendering engines 
        !Array.isArray(opt.engine) && (opt.engine = [opt.engine]);
        opt.engine.forEach(function(obj) { _app.engine(obj.name, cons[obj.handler]); })

        //** set the first registered engine as the default; set the base view path
        _app.set('view engine', opt.engine[0].name);
        _app.set('views', opt.root + opt.views);

        //** register the middleware, either extending the default middleware, or overwriting it with a custom middleware stack
        opt.extendMiddleware
            ? defaultMiddleware(_app, opt, opt.middleware)
            : opt.middleware(_app);
    });

    return web;
}



//** helper methods
//** ----

function defaultMiddleware(app, opt, cb) {
    //** express middleware (parse all-the-things by default)
    app.use(express.cookieParser());
    app.use(express.json());
    app.use(express.urlencoded());

    //** fire the callback, to allow injecting middleware such as auth, above the router/static middleware
    cb && cb(app);

    //** try and handle the request via the registered routes
    app.use(app.router);

    //** then try and serve it from the public assets, if possible
    app.use(express.static(opt.root + opt.pub));
}



//** web component interface
//** ----

var web = (module.exports = {
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

    //** the web server factory objects
    express: web_express,
    nodejs: web_nodejs

});

//** create the read-only .app property of the web component, to return the app instance
Object.defineProperty(web, 'app', {
    enumerable: true,
    get: function() { return _app; }
});
