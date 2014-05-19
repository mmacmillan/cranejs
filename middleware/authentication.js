var url = require('url'),
    qs = require('querystring'),
    options = {};

var auth = (module.exports = {

    //** cookie helpers
    //** ----

    cookie: {
        //** set the auth cookie for the given response and value; hardcoded base64 and a long expires...move to options
        set: function(res, value, opt) {
            opt = opt||{};
            if(!options.crypto) return;

            res.cookie(options.authCookie, this.generateToken(value, opt), {
                domain: opt.authCookieDomain||(options.authCookieDomain||null),
                expires: opt.timeout || options.timeout, //** default is 14 days
                httpOnly: opt.httpOnly===false?false:true
            }) 
        },

        //** get the auth cookie based on the options, for the given request
        get: function(req, decrypt) { 
            var cookie = req.cookies[options.authCookie];

            //** decrypt the cookie's if needed
            if(options.crypto && cookie)
                cookie = decrypt !== false ? options.crypto.aesDecrypt(cookie, 'hex') : cookie;

            return cookie;
        },

        //** set the cookie to expires in the past, so the browser will remove it
        remove: function(res) {
            res.cookie(options.authCookie, '', {
                domain: options.authCookieDomain,
                expires: new Date(Date.now() - 14*(24*(60*(60*1000))) ) //** 14 days ago
            });
        },

        generateToken: function(value, opt) {
            opt = opt||{};

            //** return the encrypted value as the token
            return options.crypto.aesEncrypt(value, opt.encoding||'hex');
        }
    },

    //** error methods
    //** ----

    error: {
        //** respond with a 403, for unauthenticated requests
        unauthenticated: function(req, res) {
            res.statusCode = 403;
            res.end();
        },

        //** respond with a 401, for unauthorized requests
        unauthorized: function(req, res) {
            res.statusCode = 401;
            res.end();
        }
    },


    //** authentication methods
    //** ----

    method: {

        //** cookie based authentication; supply the cookie name to look for, the url to redirect to, and any options
        cookie: function(domain, cookieName, authUrl, opt) {
            //** allow opt to be a fail: function()
            if(typeof(opt) == 'function') opt = { fail: opt }; 
            //** allow authUrl to be a opt
            if(typeof(authUrl) == 'object') { opt = authUrl; authUrl = null; }

            //** set the middleware options
            opt = opt||{};
            options.public = opt.public || 'js|g|css|pub'; //** regex OR of pub paths
            options.timeout = opt.timeout || new Date(Date.now() + (((60 * 60 * 24) * 14) * 1000)); //** 14 days...
            options.authUrl = authUrl;
            options.authCookie = cookieName;
            options.authCookieDomain = domain;
            options.crypto = opt.crypto;
            options.fail = opt.fail||function(req, res, next) {
                //** otherwise, redirect all other requests to authenticate
                res.redirect(options.authUrl +'?r='+ encodeURIComponent(req.url));
            }


            return function(req, res, next) {
                //** first get the token from the cookie
                var token = auth.cookie.get(req),
                    uri = url.parse(req.url);

                if(token) {
                    //** parse the plaintext token, as a querystring
                    var data = qs.parse(token);

                    //** set the encrypted token on the request for later reference, fire a handler, then set the request.user cache
                    options.onReceive && options.onReceive(data);
                    req.cookie = auth.cookie.get(req, false);
                    req.user = data;
                }

                //** if the user is present, or we're serving static assets, skip auth
                if(req.user 
                    || /^\/auth\/?(.*?)?/.test(uri.pathname) //** auth urls
                    || new RegExp('^\/('+ options.public +')\/?(.*?)').test(uri.pathname)) //** static resource urls
                    return next();

                //** fire the fail handler; by default this redirects the user to the auth url
                options.fail(req, res, next);
            }
        }
    }
});
