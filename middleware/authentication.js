var url = require('url'),
    util = require('util');

var options = {},
    auth = (module.exports = {

    //** util methods
    //** ----

    util: {
        //** set the auth cookie for the given response and value; hardcoded base64 and a long expires...move to options
        setCookie: function(res, username, id, opt) { 
            opt = opt||{};
            opt.expires = opt.expires||new Date(Date.now() + 900000); //** 15 minutes
            opt.httpOnly = opt.httpOnly===false?false:true;

            res.cookie(options.authCookie, options.crypto.aesEncrypt(username +'='+ id +'|'+ (opt.data||''), 'base64'), { 
                expires: opt.expires, 
                httpOnly: opt.httpOnly
            }) 
        },

        //** get the auth cookie based on the options, for the given request
        getCookie: function(req) { 
            if(req.cookies[options.authCookie])
                return options.crypto.aesDecrypt(req.cookies[options.authCookie], 'hex');
        },

        //** set the cookie to expires in the past, so the browser will remove it
        removeCookie: function(res) {
            res.cookie(options.authCookie, '', { 
                expires: new Date(Date.now() - 14*(24*(60*(60*1000))) ) 
            });//** 14 days ago
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
        cookie: function(cookieName, authUrl, opt) {
            //** allow opt to be a fail: function()
            if(typeof(opt) == 'function') opt = { fail: opt }; 
            //** allow authUrl to be a opt
            if(typeof(authUrl) == 'object') opt = authUrl;

            //** set the middleware options
            opt = opt||{};
            options.public = opt.public || 'js|g|css|pub'; //** regex OR of pub paths
            options.authUrl = authUrl;
            options.authCookie = cookieName;
            options.crypto = opt.crypto;
            options.fail = opt.fail||function(req, res, next) { 
                //** otherwise, redirect all other requests to authenticate
                res.redirect(options.authUrl +'?r='+ encodeURIComponent(req.url));
            }

            if(!options.crypto)
                throw new Error('No crypto provided');

            return function authentication(req, res, next) {
                var ck = auth.util.getCookie(req),
                    uri = url.parse(req.url);

                //** get the request user from the cookie if its exists, set the request user
                if(ck) {
                    debugger;
                    var parts = ck.split('|');
                    req.user = { username: parts[0] }
                }

                //** if the user is present, or we're serving static assets, skip auth
                if(req.user 
                    || /^\/auth\/?(.*?)?/.test(uri.pathname) //** auth urls
                    || new RegExp('^\/('+ opt.public +')\/(.*?)').test(uri.pathname)) //** static resource urls
                    return next();

                //** fire the fail handler; by default this redirects the user to the auth url
                options.fail(req, res, next);
            }
        }
    }
})
