//** simple middleware to bypass the call for the favicon
module.exports = exports = function(req, res, next) {
    if(require('url').parse(req.url).pathname == '/favicon.ico') return res.send();
    next();
}
