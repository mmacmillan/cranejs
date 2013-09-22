//** simple middleware to bypass the call for the favicon by sending an automatic 200
module.exports = function(req, res, next) {
    if(require('url').parse(req.url).pathname == '/favicon.ico') return res.end();
    next();
}
