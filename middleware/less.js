var _util = require('util'),
    _url = require('url'),
    _fs = require('fs'),
    _path = require('path'),
    _less = require('less');

var _basePath = null,
    _errorHandler = null;

function middleware(req, res, next) {
    var parts = _url.parse(req.url);

    if(/^\/(less|css)\/(.*)?$/.test(parts.pathname)) {
        var path = _path.normalize(_basePath + parts.pathname);
        var isCss = path.indexOf('.css') != -1;

        _fs.readFile(path.replace('.css', '.less'), 'utf8', function(err, data) { 
            if(err) return _errorHandler && _errorHandler(err, req, res) || err;
            res.header('content-type', 'text/'+ (isCss?'css':'less'));

            //** 1) its a less file; serve as is
            if(!isCss) res.end(data);
            else {
                try {
                    //** render the less, send the css to the client
                    _less.render(data, function(err, css) { 
                        err && _errorHandler && _errorHandler(err, req, res);
                        res.send(err?500:200, err||css)
                    })
                } catch(e) {
                    //**** handle this better
                    next();
                }
            }
        })
    } else
        next();
}

//** set the base path that will be used by the middleware, prior to using
module.exports = exports = function(path, errorHandler) {
    _basePath = path;
    _errorHandler = errorHandler;
    return middleware;
}
