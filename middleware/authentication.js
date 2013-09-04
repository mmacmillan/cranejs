var _url = require('url'),
    crypto = require('../crypto'),
    _authUrl = null,
    _authCookie = null;

function authentication(req, res, next) {
    var cookie = authentication.getCookie(req),
        uri = _url.parse(req.url);

    //** get the request user from the cookie if its exists, set the request user
    if(cookie) {
        var parts = cookie.split('|');
        req.user = { username: parts[0] }
    }

    //** if the user is present, or we're serving static assets, skip auth
    if(req.user 
        || /^\/auth\/?(.*?)?/.test(uri.pathname) //** auth urls
        || /^\/(js|g|css|pub)\/(.*?)/.test(uri.pathname)) //** static resource urls
        return next();

    //** otherwise, redirect all other requests to authenticate
    res.redirect(_authUrl +'?r='+ encodeURIComponent(req.url));
}

//** add some helpers to the auth middleware for getting/setting the auth cookie
authentication.setCookie = function(res, value) { 
    res.cookie(_authCookie, crypto.aesEncrypt(value, 'base64'), { 
        expires: new Date(Date.now() + 900000), 
        httpOnly: true 
    }) 
}

authentication.getCookie = function(req) { 
    if(req.cookies[_authCookie])
        return crypto.aesDecrypt(req.cookies[_authCookie], 'base64');
}

//** wrap the middleware creating, requiring the authenticatioan url and cookie name to use
module.exports = exports = function(authUrl, cookieName) {
    _authUrl = authUrl;
    _authCookie = cookieName;

    return authentication;
}
