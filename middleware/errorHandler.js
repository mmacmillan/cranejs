var _util = require('util');

function HttpError(code, message, end) {
    //** allow the code to be omitted and accept a string only version
    if(code && !message) {
        message = code;
        code = null;
    }

    this.statusCode = code || 500;
    this.message = message;
    this.end = end === false ? false : true; //** end the response by default when an HttpError is encountered
}
_util.inherits(HttpError, Error);


module.exports = exports = function(err, req, res, next) {
    if(err) {
        //** fire the error event within the core
        _util.log('errorHandler; '+ err.message);

        //** end the response if needed
        if(res && err instanceof exports.httpError && err.end) {
            res.statusCode = err.statusCode;
            res.set({'content-type': 'text/plain'});
            res.end(err.message);
        }
    }
}

exports.httpError = HttpError;
exports.promiseRejectHandler = function(req, res, err) { //** allows .bind(req, res), then passing the err at a later time
    exports.call(this, new HttpError(500, err && err.message, true), req, res);
}
