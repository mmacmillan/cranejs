var url = require('url'),
    qs = require('querystring'),
    options = {};

var auth = (module.exports = {

    //** cookie helpers
    //** ----

    cookie: {
        //** set the auth cookie for the given response and value; hardcoded base64 and a long expires...move to options
        set: function(res, username, id, opt) {
            opt = opt||{};
            if(!options.crypto) return;

            res.cookie(options.authCookie, this.generateToken(username, id, opt), {
                domain: opt.authCookieDomain||(options.authCookieDomain||null),
                expires: opt.expires||new Date(Date.now() + 900000), //** 15 minutes
                httpOnly: opt.httpOnly===false?false:true
            }) 
        },

        //** get the auth cookie based on the options, for the given request
        get: function(req, decrypt) { 
            var cookie = req.cookies[options.authCookie];
            if(options.crypto && cookie)
                return decrypt !== false ? options.crypto.aesDecrypt(cookie, 'hex'): cookie;
        },

        //** set the cookie to expires in the past, so the browser will remove it
        remove: function(res) {
            res.cookie(options.authCookie, '', { 
                expires: new Date(Date.now() - 14*(24*(60*(60*1000))) ) //** 14 days ago
            });
        },

        generateToken: function(username, id, opt) {
            opt = opt||{};
            var hash = 'username='+ username +'&id='+ id + '&timestamp='+ (new Date);

            //** return the encrypted has as the token
            return options.crypto.aesEncrypt(hash, opt.encoding||'hex');
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

                //** get the request user from the cookie if its exists, set the request user
                if(token) {
                    var data = qs.parse(token);

                    req.cookie = auth.cookie.get(req, false);
                    req.user = { 
                        id: data.id,
                        username: data.username
                    }
                }

                //** if the user is present, or we're serving static assets, skip auth
                if(req.user 
                    || /^\/auth\/?(.*?)?/.test(uri.pathname) //** auth urls
                    || new RegExp('^\/('+ options.public +')\/(.*?)').test(uri.pathname)) //** static resource urls
                    return next();

                //** fire the fail handler; by default this redirects the user to the auth url
                options.fail(req, res, next);
            }
        }
    }
})
